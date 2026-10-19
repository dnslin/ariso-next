const { config, readConfig } = require('./lib/config.cjs');
const { readResult } = require('./lib/result.cjs');

/** @typedef {import('picgo').IPicGo} PicGo */

/** @param {PicGo} ctx */
async function handle(ctx) {
  const input = ctx.output;
  // PicGo may publish partial imgUrl results even when an uploader throws.
  ctx.output = [];
  const completed = [];
  let filename = '';
  let token = '';
  let target = '';
  try {
    const settings = readConfig(ctx);
    token = settings.token;
    target = settings.url;
    const files = input.map((item) => {
      const bytes = Buffer.isBuffer(item.buffer)
        ? item.buffer
        : typeof item.base64Image === 'string'
          ? Buffer.from(item.base64Image, 'base64')
          : null;
      if (!bytes?.length || !item.fileName)
        throw new Error('每张图片须包含文件名与非空的 Buffer/base64 内容');
      return { item, bytes, filename: item.fileName };
    });
    if (!files.length) throw new Error('没有待上传的图片');
    for (const file of files) {
      const { item, bytes } = file;
      filename = file.filename;
      /** @type {Record<string, unknown>} */
      const formData = {
        file: {
          value: bytes,
          options: {
            filename,
            ...(item.contentType && { contentType: item.contentType }),
          },
        },
        visibility: 'public',
      };
      for (const key of ['storageId', 'albumId', 'tag']) {
        const value =
          settings[/** @type {'storageId'|'albumId'|'tag'} */ (key)];
        if (value) formData[key] = value;
      }
      let response;
      try {
        response = await ctx.request({
          method: 'POST',
          url: settings.url,
          headers: { Authorization: `Bearer ${token}` },
          formData,
          resolveWithFullResponse: true,
          timeout: settings.timeout,
          maxRedirects: 0,
          validateStatus: () => true,
        });
      } catch (error) {
        // Transport errors can carry request credentials; never forward the raw object.
        const reason =
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
            ? error.message
            : '网络中断或请求超时';
        throw new Error(
          `${reason}；上传结果未确认，服务器可能继续处理，请先到图库核对，不要直接重传`,
        );
      }
      const result = readResult(response, settings.linkVersion);
      completed.push({
        ...item,
        imgUrl: result.url,
        url: result.url,
        contentType: result.mime,
      });
      ctx.log.info(
        `Ariso 已保存：${filename}；图片 ID：${result.imageId}；${result.url}；请求 ID：${result.requestId}`.replaceAll(
          token,
          '[已隐藏 Token]',
        ),
      );
      for (const warning of result.warnings)
        ctx.log.warn(
          `Ariso ${filename}：${warning.code} / ${warning.stage}：${warning.message}`.replaceAll(
            token,
            '[已隐藏 Token]',
          ),
        );
    }
    ctx.output = completed;
    return ctx;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : '上传结果未确认，请到图库核对';
    const message = `Ariso${target ? ` ${target}` : ''}${filename ? ` · ${filename}` : ''}：${detail}。本批已有 ${completed.length} 张上传并选链成功，已保存图片不会删除，后续图片未上传。`;
    const clean = token ? message.replaceAll(token, '[已隐藏 Token]') : message;
    ctx.emit('notification', { title: 'Ariso 上传未完成', body: clean });
    throw new Error(clean);
  }
}

/** @param {PicGo} ctx */
module.exports = (ctx) => ({
  register() {
    ctx.helper.uploader.register('ariso', {
      name: 'Ariso（公开上传）',
      handle,
      config,
    });
  },
  uploader: 'ariso',
});
