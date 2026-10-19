/** @typedef {import('picgo').IPicGo} PicGo */

const versionChoices = ['site', 'original', 'compressed', 'watermark'];

/** @param {PicGo} ctx */
function config(ctx) {
  const saved = /** @type {Record<string, unknown>} */ (
    ctx.getConfig('picBed.ariso') || {}
  );
  return [
    {
      name: 'siteUrl',
      type: 'input',
      required: true,
      alias: 'Ariso 站点地址',
      message: '站点根地址；使用此上传器上传的图片将公开',
      default: saved.siteUrl || '',
    },
    {
      name: 'token',
      type: 'password',
      required: true,
      alias: '上传 Token',
      message: '填写裸 Token，不含 Bearer；仅遮挡输入，本地配置仍须妥善保存',
      default: saved.token || '',
    },
    {
      name: 'storageId',
      type: 'input',
      required: false,
      alias: '存储 ID',
      message: '留空使用站点默认存储',
      default: saved.storageId || '',
    },
    {
      name: 'albumId',
      type: 'input',
      required: false,
      alias: '默认相册 ID',
      message: '可选，填写一个相册 ID',
      default: saved.albumId || '',
    },
    {
      name: 'tag',
      type: 'input',
      required: false,
      alias: '默认标签',
      message: '可选，一个完整标签名称；逗号不会拆分',
      default: saved.tag || '',
    },
    {
      name: 'linkVersion',
      type: 'list',
      required: false,
      alias: '外链版本',
      message: '按本次站点默认版本或指定版本生成固定地址',
      default: saved.linkVersion || 'site',
      choices: versionChoices.map((value, index) => ({
        name: ['按本次站点默认版本', '原图', '压缩图', '水印图'][index],
        value,
      })),
    },
    {
      name: 'timeoutSeconds',
      type: 'input',
      required: false,
      alias: '连接空闲超时（秒）',
      message:
        '默认 3000 秒，不是整次请求的总时限；持续传输时总耗时可超过此值，断线后请先到图库核对',
      default: saved.timeoutSeconds ?? 3000,
    },
  ];
}

/** @param {PicGo} ctx */
function readConfig(ctx) {
  const value = /** @type {Record<string, unknown>} */ (
    ctx.getConfig('picBed.ariso') || {}
  );
  const text = (/** @type {unknown} */ field) =>
    typeof field === 'string' ? field.trim() : '';
  let site;
  try {
    site = new URL(text(value.siteUrl));
  } catch {
    throw new Error('请填写有效的 Ariso 站点根地址');
  }
  if (
    !['http:', 'https:'].includes(site.protocol) ||
    site.pathname !== '/' ||
    site.search ||
    site.hash ||
    site.username ||
    site.password
  )
    throw new Error(
      'Ariso 站点须为 http/https 根地址，不含路径、查询参数或账号密码',
    );
  const token = text(value.token);
  if (!token || /\s/.test(token))
    throw new Error('请填写不含 Bearer 前缀的裸上传 Token');
  const linkVersion = text(value.linkVersion) || 'site';
  if (!versionChoices.includes(linkVersion))
    throw new Error('请选择有效的外链版本');
  const timeoutSeconds =
    value.timeoutSeconds === undefined || value.timeoutSeconds === ''
      ? 3000
      : Number(value.timeoutSeconds);
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds <= 0 ||
    timeoutSeconds * 1000 > 2147483647
  )
    throw new Error('连接空闲超时须为正整数秒，且不超过 2147483 秒');
  return {
    url: new URL('/api/upload', site).href,
    token,
    linkVersion,
    timeout: timeoutSeconds * 1000,
    storageId: text(value.storageId),
    albumId: text(value.albumId),
    tag: text(value.tag),
  };
}

module.exports = { config, readConfig };
