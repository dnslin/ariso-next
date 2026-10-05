const query = new URLSearchParams(location.search);
const scenario = query.get('scenario') ?? 'normal';
document.body.classList.toggle('dark', query.get('dark') === '1');
const content = document.getElementById('content');
const footer = document.getElementById('footer');
const dialog = document.getElementById('confirmation');
const shell = document.querySelector('.shell');
const icon = (name) => window.arisoIcons[name] ?? '';
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
const nav = [
  ['LayoutDashboard', '总览'],
  ['CloudUpload', '上传'],
  ['Images', '图库'],
  ['Folder', '相册'],
  ['Tags', '标签'],
  ['Link', '分享管理'],
  ['Trash2', '回收站'],
  ['ChartNoAxesCombined', '访问统计'],
  ['HardDrive', '存储管理'],
  ['SlidersHorizontal', '站点设置'],
];
document.querySelector('nav').innerHTML = nav
  .map(
    ([name, label]) =>
      `<button class="${label === '站点设置' ? 'current' : ''}" type="button">${icon(name)}<span>${label}</span></button>`,
  )
  .join('');
for (const element of document.querySelectorAll('[data-icon]'))
  element.innerHTML = icon(element.dataset.icon);
document.getElementById('menu').onclick = () => {
  shell.classList.add('phone-menu');
  document.getElementById('collapse').innerHTML = icon('X');
  document.getElementById('collapse').setAttribute('aria-label', '关闭菜单');
};
document.getElementById('collapse').onclick = () => {
  if (shell.classList.contains('phone-menu')) {
    shell.classList.remove('phone-menu');
    document.getElementById('menu').focus();
  } else shell.classList.toggle('collapsed');
};
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && shell.classList.contains('phone-menu')) {
    shell.classList.remove('phone-menu');
    document.getElementById('menu').focus();
  }
});

const form = {
  compression: true,
  version: 'compressed',
  watermark: !['normal', 'read-error', 'save-error', 'save-unknown'].includes(
    scenario,
  ),
  mode: scenario.startsWith('asset') ? 'image' : 'text',
  position: '右下',
};
let page = [
  'normal',
  'text',
  'asset',
  'asset-expired',
  'asset-saved',
  'asset-read-error',
  'save-different',
  'read-error',
  'save-error',
  'save-unknown',
].includes(scenario)
  ? 'settings'
  : 'preview';
let previewState = page === 'preview' ? scenario : 'preview';
let testFile = null;
let settingsScroll = 0;
const demoFileName = '测试图片.png';
let resultFileName = scenario === 'original' ? '静态图像.svg' : demoFileName;
const fieldValues = new Map();
let assetFileName;
let assetCleared = false;
let assetSelected = scenario.startsWith('asset');
let readFailed = scenario === 'read-error';
let saveUnknown = ['save-unknown', 'save-different'].includes(scenario);
const targetNames = {
  original: '原图',
  thumbnail: '缩略图',
  compressed: '压缩图',
  watermark: '水印图',
};
let target = scenario === 'original' ? 'original' : 'compressed';
let previousTarget = target;
let resultMime = scenario === 'original' ? 'image/svg+xml' : 'image/webp';
let renderSignature;
let currentRenderSignature;
let watermarkOpacity = 50;
let demoTimer;
let unavailableReason =
  'GIF 不生成压缩图和水印图。可明确选择原图或缩略图重新预览。';
const notice =
  scenario === 'save-error'
    ? '保存失败，服务器返回字段错误。其他输入已保留，请修正后重试。'
    : ['save-unknown', 'save-different'].includes(scenario)
      ? '连接中断，保存结果尚未确认。输入已保留，请核对已保存设置后再操作。'
      : '';
const field = (label, control, extra = '') =>
  `<div class="field"><label>${label}</label>${control}${extra}</div>`;
const number = (name, value, min, max, suffix = '') =>
  `<div class="number-control"><input name="${name}" aria-label="${name}${suffix}" type="number" value="${value}" min="${min}" max="${max}" step="any" /></div>`;
const select = (name, values, value) =>
  `<select aria-label="${name}" name="${name}">${values.map(([id, text]) => `<option value="${id}"${id === value ? ' selected' : ''}>${text}</option>`).join('')}</select>`;
const switchControl = (name, checked) =>
  `<label class="switch"><input type="checkbox" id="${name}" aria-label="${{ compression: '压缩版本', watermark: '启用水印', 'max-edge': '最长边限制' }[name]}"${checked ? ' checked' : ''} /><span>${checked ? '已开启' : '已关闭'}</span></label>`;
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.hidden = false;
  setTimeout(() => {
    element.hidden = true;
  }, 3500);
}
function confirm(title, description, action, callback) {
  dialog.innerHTML = `<button type="button" class="close icon" aria-label="关闭确认">${icon('X')}</button><h2 id="dialog-title">${title}</h2><p>${description}</p><div class="actions"><button type="button" class="cancel">取消</button><button type="button" class="primary confirm">${action}</button></div>`;
  dialog.querySelector('.close').onclick = dialog.querySelector(
    '.cancel',
  ).onclick = () => dialog.close();
  dialog.querySelector('.confirm').onclick = () => {
    dialog.close();
    callback();
  };
  dialog.showModal();
}
function renderSettings() {
  page = 'settings';
  const heading = `<div class="page-title"><h1>站点设置</h1><p class="muted">管理站点、图片处理与账号偏好。</p></div><div class="categories desktop">${['基本设置', '图片处理', '账号与安全', '上传 API', '邮件服务'].map((label) => `<button type="button"${label === '图片处理' ? ' class="current"' : ' disabled'}>${label}</button>`).join('')}</div><div class="categories mobile">${field('设置分类', select('设置分类', [['processing', '图片处理']], 'processing'))}</div>`;
  if (readFailed) {
    content.innerHTML = `${heading}<div class="notice"><h2>未能读取处理设置</h2><p class="error">服务器读取失败。请重新加载后编辑，不能用示例默认值覆盖当前设置。</p><div><button id="reload">重新加载</button></div></div>`;
    footer.innerHTML = '';
    document.getElementById('reload').onclick = () => {
      readFailed = false;
      renderSettings();
    };
    return;
  }
  const defaults = `<section class="card"><h2>默认与任务</h2><div class="grid three">${field(
    '新上传默认可见性',
    select(
      '新上传默认可见性',
      [
        ['public', '公开'],
        ['private', '私有'],
      ],
      'public',
    ),
    '<small>仅影响新提交，已有图片不变。</small>',
  )}${field(
    '默认外链版本',
    select(
      '默认外链版本',
      [
        ['original', '原图'],
        ['compressed', '压缩图'],
        ['watermark', '水印图'],
      ],
      form.version,
    ),
    '<small>默认链接跟随此选择，固定版本不变。</small>',
  )}${field('处理并发数', number('处理并发数', 1, 1, 4), '<small>1–4；调小后，已运行任务继续完成。</small>')}</div></section>`;
  const derived = `<section class="card"><h2>派生图片</h2><div class="grid three derived">${field('压缩版本', `<div class="switch-row"><span></span>${switchControl('compression', form.compression)}</div>`)}${field(
    '输出格式',
    select(
      '输出格式',
      [
        ['webp', 'WebP'],
        ['jpeg', 'JPEG'],
        ['avif', 'AVIF'],
      ],
      'webp',
    ),
  )}${field('质量', number('质量', scenario === 'save-error' ? 0 : scenario === 'save-different' ? 76 : 82, 1, 100), scenario === 'save-error' ? '<small class="error">质量须为 1–100 的整数。</small>' : '')}</div><div class="grid mobile-single">${field('最长边限制', `<div class="switch-row"><span></span>${switchControl('max-edge', false)}</div><div id="max-edge-value" hidden>${number('最长边（px）', 1920, 1, 32768)}</div>`)}${field('JPEG 背景色', '<input aria-label="JPEG 背景色" value="#FFFFFF" />')}</div><p class="note">缩略图固定 WebP · 最长边 640 px · 质量 80。保持原比例，不放大小图。</p></section>`;
  const positions = `<div class="position-layout"><div class="field"><span class="field-label">水印位置</span><div class="positions" role="group" aria-label="水印位置">${['左上', '上中', '右上', '左中', '居中', '右中', '左下', '下中', '右下'].map((label) => `<button type="button" aria-pressed="${label === form.position}"${form.watermark ? '' : ' disabled'}>${label}</button>`).join('')}</div><small id="position-label">当前位置：${form.position}</small></div>${field('边距（短边比例 %）', number('边距', 2, 0, 20), '<small>居中方向不加偏移。</small>')}</div>`;
  const text = `<div id="text-fields"${form.watermark && form.mode === 'text' ? '' : ' hidden'}><div class="grid mobile-single">${field('水印文字', '<textarea aria-label="水印文字">© Ariso</textarea>', '<small>最多200个字符、5行。</small>')}${field(
    '内置字体',
    select(
      '内置字体',
      [
        ['chinese', '内置中文字体'],
        ['latin', '内置拉丁字体'],
      ],
      'chinese',
    ),
  )}</div><div class="grid three" style="margin-top:20px">${field('相对字号（短边 %）', number('相对字号', 3, 1, 20))}${field('字体颜色', '<input aria-label="字体颜色" value="#FFFFFF" />')}${field('不透明度（%）', number('文字不透明度', watermarkOpacity, 0, 100))}</div><div class="grid" style="margin-top:20px">${field('描边颜色', '<input aria-label="描边颜色" value="#000000" />')}${field('描边宽度（px）', number('描边宽度', 0, 0, 10))}</div></div>`;
  const asset = `<div id="image-fields"${form.watermark && form.mode === 'image' ? '' : ' hidden'}><div class="field"><span class="field-label">水印素材</span><div><button type="button" id="upload-asset">${icon('Upload')} 上传水印素材</button><input type="file" id="asset-file" accept="image/png,image/webp,image/svg+xml" hidden /></div><small>PNG、WebP 或静态 SVG，不超过 5 MiB。</small><div class="asset-info" id="asset-info">${scenario === 'asset-saved' ? '<strong>已保存素材</strong><span>image/png · 320 × 120 · 18.2 KiB（演示）</span><code>65e40a25-86c5-4cf3-baa1-2d77c8a244ab</code><small>已采用，无临时到期限制。</small>' : scenario === 'asset-read-error' ? '<strong>现存素材信息读取失败</strong><code>65e40a25-86c5-4cf3-baa1-2d77c8a244ab</code><small class="error">保留当前ID；未获取属性，不显示伪造名称或图像。</small><button type="button" id="retry-asset">重新读取素材信息</button>' : scenario === 'asset-expired' ? '<strong class="error">素材已到期，请重新上传。</strong>' : scenario === 'asset' ? '<strong>临时素材 · 尚未保存</strong><span>PNG · 320 × 120 · 18.2 KiB</span><code>65e40a25-86c5-4cf3-baa1-2d77c8a244ab</code><small>还剩50分钟可采用；保存处理设置后采用。</small>' : '<p>尚未选择素材。</p>'}</div></div><div class="grid" style="margin-top:20px">${field('相对图片宽度（画布 %）', number('图片宽度', 20, 1, 100))}${field('不透明度（%）', number('图片不透明度', watermarkOpacity, 0, 100))}</div></div>`;
  const watermark = `<section class="card"><div class="switch-row"><h2>水印</h2>${switchControl('watermark', form.watermark)}</div><div class="segments" role="group" aria-label="水印类型"><button type="button" data-mode="text"${form.watermark ? '' : ' disabled'} aria-pressed="${form.mode === 'text'}">文字水印</button><button type="button" data-mode="image"${form.watermark ? '' : ' disabled'} aria-pressed="${form.mode === 'image'}">图片水印</button></div><fieldset id="watermark-fields"${form.watermark ? '' : ' disabled'} style="border:0;padding:0;margin:0;display:grid;gap:20px">${positions}${text}${asset}</fieldset><p class="note" id="watermark-note">${form.watermark ? '只应用当前模式；切换时保留另一模式的参数。' : '水印已关闭。开启后可编辑位置与参数。'}</p><div id="asset-clear-action" style="display:${assetSelected ? 'flex' : 'none'};align-items:center;gap:12px;flex-wrap:wrap"><span style="font-size:13px">保留的图片素材仅在保存后解除引用。</span><button type="button" id="clear-asset">清空素材选择</button></div></section>`;
  content.innerHTML = `${heading}<div id="save-notice" class="notice${notice && (saveUnknown || scenario === 'save-error') ? '' : ' hidden'}"><p class="error">${notice}</p>${['save-unknown', 'save-different'].includes(scenario) ? '<div><button id="check-save">核对已保存设置</button></div>' : ''}</div>${defaults}${derived}${watermark}`;
  footer.innerHTML =
    '<div class="actions"><button id="open-preview">预览处理效果</button><button id="save" class="primary">保存处理设置</button></div>';
  for (const element of content.querySelectorAll('input,textarea,select')) {
    const key =
      element.name || element.id || element.getAttribute('aria-label');
    if (!key || !fieldValues.has(key) || element.type === 'file') continue;
    if (element.type === 'checkbox') element.checked = fieldValues.get(key);
    else element.value = fieldValues.get(key);
  }
  document.getElementById('max-edge-value').hidden =
    !document.getElementById('max-edge').checked;
  if (assetFileName)
    document.getElementById('asset-info').innerHTML =
      `<strong>${escapeHtml(assetFileName)}</strong><span>临时素材 · 尚未保存</span><small>原型只演示选择，不上传、不校验文件、不产生真实ID。</small>`;
  const versions = content.querySelector('[name="默认外链版本"]');
  versions.onchange = () => {
    form.version = versions.value;
  };
  function switchOff(which) {
    const isDefault =
      (which === 'compression' && form.version === 'compressed') ||
      (which === 'watermark' && form.version === 'watermark');
    const control = document.getElementById(which);
    if (!control.checked && isDefault) {
      control.checked = true;
      confirm(
        '当前默认版本需要此开关',
        '关闭不会删除已有版本。请选择其他有效默认版本，或明确改为原图后继续关闭。',
        '改为原图并继续',
        () => {
          versions.value = form.version = 'original';
          control.checked = false;
          updateSwitch(which);
        },
      );
    } else updateSwitch(which);
  }
  function updateSwitch(which) {
    const control = document.getElementById(which);
    form[which] = control.checked;
    control.nextElementSibling.textContent = control.checked
      ? '已开启'
      : '已关闭';
    if (which === 'watermark') {
      document.getElementById('watermark-fields').disabled = !control.checked;
      for (const button of content.querySelectorAll('[data-mode]'))
        button.disabled = !control.checked;
      document.getElementById('text-fields').hidden =
        !control.checked || form.mode !== 'text';
      document.getElementById('image-fields').hidden =
        !control.checked || form.mode !== 'image';
      document.getElementById('watermark-note').textContent = control.checked
        ? '只应用当前模式；切换时保留另一模式的参数。'
        : '水印已关闭。开启后可编辑位置与参数。';
      for (const button of document.querySelectorAll('.positions button'))
        button.disabled = !control.checked;
    }
  }
  document.getElementById('compression').onchange = () =>
    switchOff('compression');
  document.getElementById('watermark').onchange = () => switchOff('watermark');
  document.getElementById('max-edge').onchange = (event) => {
    document.getElementById('max-edge-value').hidden = !event.target.checked;
    event.target.nextElementSibling.textContent = event.target.checked
      ? '已开启'
      : '已关闭';
  };
  for (const button of content.querySelectorAll('[data-mode]'))
    button.onclick = () => {
      form.mode = button.dataset.mode;
      for (const item of content.querySelectorAll('[data-mode]'))
        item.setAttribute('aria-pressed', String(item === button));
      document.getElementById('text-fields').hidden = form.mode !== 'text';
      document.getElementById('image-fields').hidden = form.mode !== 'image';
    };
  for (const button of content.querySelectorAll('.positions button'))
    button.onclick = () => {
      form.position = button.textContent;
      for (const item of content.querySelectorAll('.positions button'))
        item.setAttribute('aria-pressed', String(item === button));
      document.getElementById('position-label').textContent =
        `当前位置：${form.position}`;
    };
  document.getElementById('retry-asset')?.addEventListener('click', () => {
    document.getElementById('asset-info').innerHTML =
      '<strong>已保存素材</strong><span>image/png · 320 × 120 · 18.2 KiB（演示）</span><code>65e40a25-86c5-4cf3-baa1-2d77c8a244ab</code>';
  });
  document.getElementById('clear-asset').onclick = () => {
    assetSelected = false;
    assetCleared = true;
    assetFileName = undefined;
    document.getElementById('asset-info').innerHTML = '<p>尚未选择素材。</p>';
    document.getElementById('asset-clear-action').style.display = 'none';
    document.getElementById('save').focus();
    toast('选择已清空，保存后生效（原型演示）');
  };
  document.getElementById('upload-asset').onclick = () =>
    document.getElementById('asset-file').click();
  document.getElementById('asset-file').onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    assetFileName = file.name;
    assetSelected = true;
    assetCleared = false;
    document.getElementById('asset-clear-action').style.display = 'flex';
    document.getElementById('asset-info').innerHTML =
      `<strong>${escapeHtml(file.name)}</strong><span>临时素材 · 尚未保存</span><small>原型只演示选择，不上传、不校验文件、不产生真实ID。</small>`;
  };
  document.getElementById('save').onclick = () => {
    if (saveUnknown) {
      toast('请先核对已保存设置。');
      return;
    }
    if (
      (form.version === 'compressed' && !form.compression) ||
      (form.version === 'watermark' && !form.watermark)
    ) {
      const area = document.getElementById('save-notice');
      area.classList.remove('hidden');
      area.innerHTML =
        '<p class="error">当前默认版本所需的开关已关闭。请明确选择其他有效默认版本。</p>';
      versions.focus();
      return;
    }
    const invalid = [...content.querySelectorAll('input[type="number"]')].find(
      (input) => !input.disabled && (!input.value || !input.checkValidity()),
    );
    if (invalid) {
      invalid.focus();
      toast('请修正数字字段后保存。');
      return;
    }
    if (scenario === 'asset-expired' && !assetCleared) {
      document.getElementById('upload-asset').focus();
      toast('素材已到期，请重新上传。');
      return;
    }
    toast('处理设置已保存（原型演示）');
  };
  document.getElementById('check-save')?.addEventListener('click', () => {
    if (scenario === 'save-different') {
      document.getElementById('save-notice').innerHTML =
        `<p>已保存值与本次输入不同。当前输入仍保留，请决定使用哪一份。</p><table><thead><tr><th>字段</th><th>已保存</th><th>当前输入</th></tr></thead><tbody><tr><td>质量</td><td>82</td><td>${escapeHtml(document.querySelector('[name="质量"]').value)}</td></tr></tbody></table><div class="actions"><button id="keep-input">保留当前输入</button><button id="use-saved">使用已保存设置</button></div>`;
      document.getElementById('keep-input').onclick = () => {
        saveUnknown = false;
        document.getElementById('save-notice').hidden = true;
        toast('输入已保留，请点击保存。');
      };
      document.getElementById('use-saved').onclick = () => {
        saveUnknown = false;
        document.querySelector('[name="质量"]').value = '82';
        document.getElementById('save-notice').hidden = true;
        toast('已使用服务器保存值（原型演示）');
      };
      return;
    }
    saveUnknown = false;
    document.getElementById('save-notice').innerHTML =
      '<p>核对完成：已保存值与本次输入一致。（原型演示）</p>';
  });
  for (const name of ['文字不透明度', '图片不透明度']) {
    const control = content.querySelector(`[name="${name}"]`);
    control.oninput = () => {
      watermarkOpacity = control.value;
      for (const other of content.querySelectorAll(
        '[name="文字不透明度"], [name="图片不透明度"]',
      ))
        other.value = watermarkOpacity;
    };
  }
  document.getElementById('open-preview').onclick = () => {
    settingsScroll = content.scrollTop;
    for (const element of content.querySelectorAll('input,textarea,select')) {
      const key =
        element.name || element.id || element.getAttribute('aria-label');
      if (key && element.type !== 'file')
        fieldValues.set(
          key,
          element.type === 'checkbox' ? element.checked : element.value,
        );
    }
    const currentSignature =
      JSON.stringify(
        [...fieldValues].filter(
          ([key]) =>
            ![
              '设置分类',
              '新上传默认可见性',
              '默认外链版本',
              '处理并发数',
            ].includes(key),
        ),
      ) +
      form.mode +
      form.position +
      form.watermark +
      form.compression;
    if (
      ['succeeded', 'original', 'stale'].includes(previewState) &&
      currentSignature !== renderSignature
    )
      previewState = 'stale';
    currentRenderSignature = currentSignature;
    renderPreview();
  };
}
function renderPreview() {
  page = 'preview';
  const active = ['queued', 'running', 'cancel-unknown'].includes(previewState);
  const knownResult = ['succeeded', 'stale', 'original'].includes(previewState);
  const hasFile = testFile || previewState !== 'preview';
  const fileName =
    testFile?.name ?? (scenario === 'original' ? '静态图像.svg' : demoFileName);
  const status = {
    queued: '排队中',
    running: '生成中',
    succeeded: '预览完成',
    stale: '上次预览 · 参数已变更',
    original: '预览完成 · 原图附件',
    unavailable: '此目标不适用',
    cancelled: '已取消',
    expired: '预览已到期',
    cleanup: '已取消 · 清理失败',
    'create-unknown': '创建结果尚未确认',
    'cancel-unknown': '取消结果尚未确认',
    session: '会话已失效',
  }[previewState];
  const explanations = {
    queued: '正在等待与正式任务共用的处理名额。',
    running: '正在使用本次提交时的参数处理测试图。',
    unavailable: unavailableReason,
    cancelled: '测试文件已清理。设置输入和已选测试图保留，可重新预览。',
    expired: '成功结果已超过30分钟。请重新预览，不能继续使用旧结果。',
    cleanup: '临时文件清理失败：EACCES。请重试清理；错误不会改为成功提示。',
    'create-unknown':
      '请求连接中断，没有收到预览ID，无法确认是否已受理。输入已保留，不自动重复创建；重新预览可能产生另一临时任务。',
    'cancel-unknown':
      '连接中断，不能确认取消是否完成。已有任务ID可读取真实状态后再操作。',
    session: '请重新登录后继续，当前输入保留在页面内。',
  }[previewState];
  content.innerHTML = `<button id="back" type="button" class="link">${icon('ArrowLeft')}返回图片处理</button><div class="page-title"><h1>临时处理预览</h1><p class="muted">使用当前未保存参数；预览不会保存设置。</p></div><section class="card"><h2>测试图片</h2><div class="result-header"><div>${hasFile ? `<strong>${escapeHtml(fileName)}</strong><small>${testFile ? `${(testFile.size / 1024).toFixed(1)} KiB · 本次选择` : '演示身份 · 不代表真实上传'}</small>` : '<p>尚未选择测试图。</p>'}</div><button id="choose-file"${active ? ' disabled' : ''}>${icon('Upload')}${hasFile ? '更换测试图' : '选择测试图'}</button><input id="test-file" type="file" hidden /></div><div class="field"><span class="field-label">预览目标</span><div class="grid target-options">${Object.entries(
    targetNames,
  )
    .map(
      ([key, label]) =>
        `<button type="button" data-target="${key}" aria-pressed="${key === target}" class="${key === target ? 'primary' : ''}"${active ? ' disabled' : ''}>${label}</button>`,
    )
    .join(
      '',
    )}</div></div><p class="note">选择一个文件和目标后，点击「生成预览」。成功结果保留30分钟。</p></section>${status ? `<section class="card preview-result"><div class="result-header"><h2>${knownResult ? (previewState === 'stale' ? '上次预览' : '预览结果') : '预览状态'}</h2><span class="badge">${status}</span></div>${knownResult ? `<p>${escapeHtml(resultFileName)} · ${targetNames[previousTarget]}</p>${previewState === 'stale' ? '<p class="note">参数或目标已变更。以下结果属于上次提交，重新预览后才应用当前选择。</p>' : ''}${resultMime === 'image/svg+xml' ? '<p>浏览器中不显示原始SVG。原文件保持完整，可通过所有者私有附件查看。</p><div><button id="attachment">查看原图附件</button></div>' : `<div class="canvas">${icon('Image')}<span>实际结果显示区</span><small>此原型不生成图片，生产页显示服务端返回的真实结果。</small></div>`}<dl class="metadata"><div><dt>实际编码</dt><dd>${resultMime}</dd></div><div><dt>尺寸</dt><dd>1280 × 960</dd></div><div><dt>大小</dt><dd>186.4 KiB（演示）</dd></div><div><dt>有效期</dt><dd>完成后30分钟</dd></div></dl>` : `<p${previewState === 'cleanup' ? ' class="error"' : ''}>${explanations}</p>`}${previewState === 'cleanup' ? '<div><button id="retry-cleanup">重试清理</button></div>' : ''}${previewState === 'cancel-unknown' ? '<div><button id="check-preview">核对任务状态</button></div>' : ''}${previewState === 'session' ? '<div><button id="login">重新登录</button></div>' : ''}</section>` : ''}`;
  footer.innerHTML = `<div class="actions preview-actions"><button id="return-settings">返回设置</button><button id="generate" class="primary"${!hasFile || ['cancel-unknown', 'session'].includes(previewState) ? ' disabled' : ''}>${active ? '取消预览' : '生成预览'}</button></div>`;
  function goBack() {
    renderSettings();
    content.scrollTop = settingsScroll;
    document.getElementById('open-preview').focus();
  }
  document.getElementById('back').onclick = document.getElementById(
    'return-settings',
  ).onclick = goBack;
  document.getElementById('choose-file').onclick = () =>
    document.getElementById('test-file').click();
  document.getElementById('test-file').onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    testFile = file;
    if (knownResult) previewState = 'stale';
    renderPreview();
  };
  for (const button of content.querySelectorAll('[data-target]'))
    button.onclick = () => {
      target = button.dataset.target;
      if (knownResult) previewState = 'stale';
      renderPreview();
    };
  document
    .getElementById('attachment')
    ?.addEventListener('click', () =>
      toast('正式实现返回真实原图附件；原型不生成附件。'),
    );
  document.getElementById('retry-cleanup')?.addEventListener('click', () => {
    previewState = 'cancelled';
    renderPreview();
  });
  document.getElementById('check-preview')?.addEventListener('click', () => {
    previewState = 'cancelled';
    renderPreview();
  });
  document
    .getElementById('login')
    ?.addEventListener('click', () =>
      toast('正式实现前往登录；原型保留当前页面。'),
    );
  document.getElementById('generate').onclick = () => {
    if (active) {
      clearTimeout(demoTimer);
      const button = document.getElementById('generate');
      button.disabled = true;
      button.textContent = '取消中…';
      setTimeout(() => {
        previewState = 'cancelled';
        if (page === 'preview') renderPreview();
      }, 1000);
      return;
    }
    const create = () => {
      const submittedTarget = target;
      const compressionEnabled = form.compression;
      const watermarkEnabled = form.watermark;
      renderSignature = currentRenderSignature;
      resultFileName = fileName;
      previousTarget = target;
      resultMime =
        target === 'original' ? testFile?.type || 'image/png' : 'image/webp';
      previewState = 'queued';
      renderPreview();
      demoTimer = setTimeout(() => {
        if (previewState === 'queued') {
          previewState = 'running';
          if (page === 'preview') renderPreview();
          demoTimer = setTimeout(() => {
            if (previewState === 'running') {
              previewState =
                resultMime === 'image/svg+xml' ? 'original' : 'succeeded';
              if (
                (submittedTarget === 'compressed' && !compressionEnabled) ||
                (submittedTarget === 'watermark' && !watermarkEnabled)
              ) {
                previewState = 'unavailable';
                unavailableReason =
                  submittedTarget === 'compressed'
                    ? '本次参数关闭压缩。请开启压缩，或明确选择另一目标。'
                    : '本次参数关闭水印。请开启水印，或明确选择另一目标。';
              }
              if (
                ['succeeded', 'original'].includes(previewState) &&
                currentRenderSignature !== renderSignature
              )
                previewState = 'stale';
              if (page === 'preview') renderPreview();
            }
          }, 1600);
        }
      }, 800);
    };
    if (previewState === 'create-unknown')
      confirm(
        '重新创建临时预览',
        '上次请求没有收到ID，不能确认是否受理。继续会提交新预览，可能同时存在另一临时任务。',
        '重新创建',
        create,
      );
    else create();
  };
  content.scrollTop = 0;
}
if (page === 'settings') renderSettings();
else renderPreview();
