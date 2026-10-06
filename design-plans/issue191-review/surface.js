// This proposal uses simulated data and responses. It never sends product writes.
const params = new URLSearchParams(location.search);
const outcome = params.get('outcome') ?? 'success';
let screen = params.get('screen') ?? 'settings';
document.body.classList.toggle('dark', params.get('dark') === '1');
const content = document.getElementById('content');
const footer = document.getElementById('footer');
const dialog = document.getElementById('confirmation');
let opener,
  pending = false,
  expiryMode = 'date';
const icon = (name) => window.arisoIcons[name] ?? '';
const button = (text, action, primary = false) =>
  `<button ${primary ? 'class="primary"' : ''} data-action="${action}">${text}</button>`;
function navigate(nextScreen) {
  if (window.parent !== window) {
    window.parent.postMessage({ screen: nextScreen }, location.origin);
  } else {
    const destination = new URL('http://127.0.0.1:53525/shares');
    destination.search = params.toString();
    destination.searchParams.set('screen', nextScreen);
    location.assign(destination);
  }
}
const navigation = [
  ['LayoutDashboard', '总览', true],
  ['CloudUpload', '上传'],
  ['Images', '图库'],
  ['Folder', '相册'],
  ['Tags', '标签'],
  ['Link', '分享管理'],
  ['Trash2', '回收站'],
  ['ChartNoAxesCombined', '访问统计', true],
  ['HardDrive', '存储管理'],
  ['SlidersHorizontal', '站点设置'],
];
document.querySelector('nav').innerHTML = navigation
  .map(
    ([name, label, disabled]) =>
      `${name === 'ChartNoAxesCombined' ? '<p class="nav-section">管理</p>' : ''}<button class="nav-item ${name === 'Link' ? 'active' : ''}" ${disabled ? 'disabled' : ''} data-action="${name === 'Link' ? 'list' : 'navigation'}" title="${label}">${icon(name)}<span>${label}</span>${disabled ? '<small>尚未开放</small>' : ''}</button>`,
  )
  .join('');
document
  .querySelectorAll('[data-icon]')
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
function notify(message) {
  const toast = document.getElementById('toast');
  toast.innerHTML = `<div class="toast-row"><p>${message}</p><button class="icon" aria-label="关闭通知" data-action="dismiss-toast">${icon('X')}</button></div>`;
  toast.hidden = false;
}
function render() {
  if (screen !== 'list' && screen !== 'create') {
    navigate(screen);
    return;
  }
  const scrollTop = content.scrollTop;
  if (screen === 'list') {
    content.innerHTML = `<div class="page-title"><h1>分享管理</h1><p class="muted">分享相册中的公开图片，控制密码与有效期。</p></div><section class="list-card"><h2>分享管理 · 3 项</h2><div class="list-head"><span>分享相册</span><span>访问设置</span><span>状态与操作</span></div>${[
      ['山野之间', '48', '密码保护 · 10/31 到期', '已启用'],
      ['夏日片段', '18', '无密码 · 09/30 到期', '已过期'],
      ['周末随拍', '16', '无密码 · 不过期', '已关闭'],
    ]
      .map(
        ([name, count, access, status]) =>
          `<div class="row"><div class="album"><span class="cover">${icon('Image')}</span><div class="name"><p>${name}</p><small>${count} 张公开图片</small></div></div><p class="access">${access}</p><div class="row-right"><small class="${status === '已过期' ? 'expired' : ''}">${status}</small>${button('管理', status === '已过期' ? 'expired' : status === '已关闭' ? 'disabled' : 'settings')}</div></div>`,
      )
      .join('')}</section>`;
    footer.innerHTML =
      '<div class="pagination"><p>共 3 项 · 40 条 / 页 · 1 / 1</p><div class="actions"><button disabled>上一页</button><button disabled>下一页</button></div></div>';
    return;
  }
  content.innerHTML = `<div class="page-title"><button class="link" data-action="list">${icon('ArrowLeft')}返回分享管理</button><h1>分享设置</h1><p>山野之间 · 尚未创建</p></div><section class="settings"><h2>尚未创建分享</h2><p class="muted">创建后可分享相册中的公开图片。</p>${button('创建并启用分享', 'create-dialog', true)}</section>`;
  footer.innerHTML = `<div class="actions">${button('返回分享管理', 'list')}<button disabled title="匿名页面由 Issue #192 交付">预览尚未开放</button></div>`;
  content.scrollTop = scrollTop;
}

function close() {
  if (pending) return;
  dialog.close();
  opener?.focus({ preventScroll: true });
}
function show(trigger) {
  opener = trigger;
  expiryMode = 'date';
  dialog.innerHTML = `<div class="dialog-title"><h2 id="dialog-title">创建并启用分享</h2><button class="icon" aria-label="关闭" data-action="close">${icon('X')}</button></div><div class="dialog-body"><p class="muted">山野之间</p><p>默认网格、隐藏图片名称。创建后可独立修改。</p><label class="field">密码（选填）<input type="password" autocomplete="new-password" /></label><div class="field"><span>有效期</span><div class="segments">${button('指定时间', 'expiry-date')}${button('不过期', 'expiry-none')}</div></div><div id="date-field" class="field"><label for="expiry">到期时间 · Asia/Shanghai</label><input type="datetime-local" id="expiry" value="2026-10-31T23:59" /><small>UTC+08:00 · 按站点时区保存</small></div><div id="feedback" role="status"></div></div><div class="actions">${button('取消', 'close')}${button('创建并启用', 'submit', true)}</div>`;
  dialog
    .querySelector('[data-action="expiry-date"]')
    .setAttribute('aria-pressed', 'true');
  dialog.showModal();
}

function busy(value) {
  pending = value;
  dialog
    .querySelectorAll('button,input')
    .forEach((el) => (el.disabled = value));
}
async function submit() {
  if (pending) return;
  const feedback = document.getElementById('feedback');
  if (expiryMode === 'date') {
    const expires = Date.parse(
      `${document.getElementById('expiry').value}+08:00`,
    );
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      feedback.innerHTML =
        '<p class="error">新的到期时间必须晚于保存时刻。</p>';
      return;
    }
  }
  if (outcome === 'failed') {
    feedback.innerHTML = '<p class="error">保存失败。输入已保留，请重试。</p>';
    return;
  }
  if (outcome === 'unknown' || outcome === 'read-failed') {
    busy(true);
    feedback.innerHTML = '<p>未收到可确认的结果，正在读取当前配置…</p>';
    await new Promise((resolve) => setTimeout(resolve, 700));
    busy(false);
    await check();
    return;
  }
  close();
  navigate('settings');
}
async function check() {
  if (pending) return;
  const feedback = document.getElementById('feedback');
  busy(true);
  feedback.innerHTML = '<p>正在核对当前配置…</p>';
  await new Promise((resolve) => setTimeout(resolve, 700));
  busy(false);
  dialog.querySelector('.actions').innerHTML =
    `${button('返回设置', 'close')}${button('重新核对', 'check', true)}`;
  if (outcome === 'read-failed') {
    feedback.innerHTML =
      '<p class="error">读取当前配置失败，操作结果仍未知。未再次提交。</p>';
    return;
  }
  close();
  navigate('settings');
}
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'close') close();
  else if (action === 'dismiss-toast')
    document.getElementById('toast').hidden = true;
  else if (action === 'submit') await submit();
  else if (action === 'check') await check();
  else if (action === 'expiry-date' || action === 'expiry-none') {
    expiryMode = action === 'expiry-date' ? 'date' : 'none';
    dialog
      .querySelectorAll('.segments button')
      .forEach((el) => el.setAttribute('aria-pressed', String(el === target)));
    document.getElementById('date-field').hidden = expiryMode === 'none';
  } else if (['settings', 'list', 'expired', 'disabled'].includes(action)) {
    if (action === 'list') {
      screen = action;
      render();
    } else navigate(action);
  } else if (action === 'navigation') notify('此原型只展示分享管理流程');
  else if (action === 'create-dialog') show(target);
});
dialog.addEventListener('cancel', (event) => {
  if (pending) event.preventDefault();
});
document.getElementById('menu').onclick = () => {
  document.body.classList.add('menu-open');
  document.getElementById('collapse').innerHTML = icon('X');
  document.getElementById('collapse').setAttribute('aria-label', '关闭菜单');
  document.getElementById('collapse').focus();
};
document.getElementById('collapse').onclick = () => {
  if (document.body.classList.contains('menu-open')) {
    document.body.classList.remove('menu-open');
    document.getElementById('menu').focus();
  } else document.body.classList.toggle('collapsed');
};
render();
