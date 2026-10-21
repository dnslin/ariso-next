import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { waitForImageWorkflow } from './image-workflows-fixture.mjs';
import { isBrowserControlStop } from './browser-errors.mjs';

const body = '[data-testid="image-share-body"]';
async function expiryControlState(page, selector) {
  return page.evaluate((selector) => {
    const trigger = document.querySelector(selector);
    const ancestors = [];
    for (let node = trigger; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      ancestors.push({
        tag: node.tagName,
        id: node.id,
        role: node.getAttribute('role'),
        disabled: node.disabled ?? null,
        matchesDisabled: node.matches(':disabled'),
        disabledAttribute: node.getAttribute('disabled'),
        ariaDisabled: node.getAttribute('aria-disabled'),
        dataDisabled: node.getAttribute('data-disabled'),
        inert: node.inert,
        ariaHidden: node.getAttribute('aria-hidden'),
        pointerEvents: style.pointerEvents,
        visibility: style.visibility,
        display: style.display,
      });
    }
    const rect = trigger.getBoundingClientRect();
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    return {
      control: trigger.outerHTML,
      ancestors,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      center,
      centerHitsTrigger: hit === trigger || trigger.contains(hit),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, selector);
}
export async function verifyImageWorkflowShare({
  task,
  page,
  config,
  report,
  fixture,
  ui,
}) {
  // Deliberately start from the original; sharing must show the disclosed compressed role.
  await page.click('loc=role:tab[name="原图"]');
  await ui.more('临时分享');
  await page.waitForSelector(body);
  await page.waitForSelector(`${body} [data-share-source="compressed"]`);
  await ui.sourcePreview(fixture.privateImage, 'compressed');
  await page.waitForFunction(
    ({ id, name }) => {
      const panel = document.querySelector(
        '[data-testid="image-share-body"] section[aria-labelledby="image-share-heading"]',
      );
      const image = panel?.querySelector('img');
      if (!image || !image.complete || image.naturalWidth === 0) return false;
      const src = new URL(image.currentSrc || image.src, location.href);
      const frame = image.parentElement.getBoundingClientRect();
      return (
        src.pathname === `/i/${id}` &&
        src.searchParams.get('type') === 'compressed' &&
        frame.width === 80 &&
        frame.height === 80 &&
        panel.textContent.includes(name) &&
        panel.textContent.includes('分享压缩图')
      );
    },
    { id: fixture.privateImage.id, name: fixture.privateImage.displayName },
  );
  report.checks.push({
    scenario: 'private-share-preview-and-identity-match-authorized-role',
    imageId: fixture.privateImage.id,
    sourceRole: 'compressed',
    identityFrame: [80, 80],
    originalTabBeforeEnteringShare: true,
  });
  const expiry = `${body} button[data-slot="select-trigger"]`;
  report.stage = 'private-share-expiry-ready';
  await page.waitForFunction((selector) => {
    const trigger = document.querySelector(selector);
    return (
      trigger &&
      !trigger.disabled &&
      trigger.getAttribute('aria-disabled') !== 'true' &&
      !trigger.closest('[inert]')
    );
  }, expiry);
  report.shareExpiryControl = await page.evaluate(
    (selector) => document.querySelector(selector).outerHTML,
    expiry,
  );
  report.shareExpiryBeforeKeyboard = await expiryControlState(page, expiry);
  report.shareExpiryBeforeKeyboardSnapshot = await page.snapshot();
  report.shareExpiryPointer = {
    status: 'not-retested-known-ego-limitation',
    previousRoundEvidence: join(
      config.projectDirectory,
      'test-results/browser-image-workflows-round-06/image-workflows.json',
    ),
    independentCuaPointerProof: join(
      config.projectDirectory,
      '.data/image-workflows-preview/share-expiry-pointer.png',
    ),
    independentCuaCreateProof: join(
      config.projectDirectory,
      '.data/image-workflows-preview/share-active-pointer.png',
    ),
  };
  report.stage = 'private-share-expiry-keyboard-tab';
  report.shareExpiryTabTrace = [];
  let focused = false;
  for (let step = 0; step <= 10; step++) {
    const current = await page.evaluate((selector) => {
      const active = document.activeElement;
      return {
        target: active === document.querySelector(selector),
        tag: active?.tagName,
        id: active?.id,
        role: active?.getAttribute('role'),
        label: active?.getAttribute('aria-label'),
        text: active?.textContent?.trim().slice(0, 120),
      };
    }, expiry);
    report.shareExpiryTabTrace.push({ step, ...current });
    if (current.target) {
      focused = true;
      break;
    }
    if (step < 10) await page.keyboard.press('Tab');
  }
  assert.ok(
    focused,
    'Real Tab navigation reaches the expiry trigger within ten steps',
  );
  report.stage = 'private-share-expiry-keyboard-open';
  await page.keyboard.press('ArrowDown');
  report.shareExpiryAfterOpenKeySnapshot = await page.snapshot();
  await page.waitForSelector('loc=role:option[name="1 小时"]');
  report.shareExpiryOptions = await page.snapshot();
  report.stage = 'private-share-expiry-keyboard-choose';
  await page.keyboard.press('Home');
  report.shareExpiryAfterHomeSnapshot = await page.snapshot();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('role') === 'option' &&
      document.activeElement.textContent.trim() === '1 小时',
  );
  await page.keyboard.press('Enter');
  report.shareExpiryAfterEnterSnapshot = await page.snapshot();
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('1 小时'),
    expiry,
  );
  report.checks.push({
    scenario: 'private-share-expiry-selection',
    value: '1 小时',
    input: 'native-keyboard-Tab-ArrowDown-Home-Enter',
    pointer: report.shareExpiryPointer.status,
  });
  report.limitations.push(
    'The share form actions in this suite use real keyboard navigation and Enter. Earlier Ego selector clicks incorrectly reported disabled and its coordinate pointer did not open the popup despite enabled DOM and ancestors. Independent CUA pointer operation on the actual product selected one hour and created a share; those screenshots are separate evidence. This suite does not claim Ego pointer acceptance for the share form.',
  );
  report.stage = 'private-share-create';
  await ui.capture(
    'private-share-create',
    body,
    `${body} button:text-is("创建分享")`,
  );
  await ui.captureMobileForm('private-share-create', [
    ['identity-expiry', expiry],
    ['permissions-action', `${body} button:text-is("创建分享")`],
  ]);
  await ui.modalKeyboard(
    '[data-testid="library-detail"]',
    `${body} button:text-is("创建分享")`,
  );
  async function keyboardActivate(label, selector = `${body} button`) {
    report.stage = `private-share-keyboard-${label}`;
    const match = { selector, label };
    await page.waitForFunction(({ selector, label }) => {
      const target = [...document.querySelectorAll(selector)].find(
        (node) => node.textContent.trim() === label,
      );
      return (
        target &&
        !target.matches(':disabled') &&
        !target.disabled &&
        !target.closest('[inert],[aria-disabled="true"]')
      );
    }, match);
    const action = { label, input: 'native-keyboard-Tab-Enter', focus: [] };
    (report.shareKeyboardActions ??= []).push(action);
    let reached = false;
    for (let step = 0; step <= 10; step++) {
      const state = await page.evaluate(({ selector, label }) => {
        const matches = [...document.querySelectorAll(selector)].filter(
          (node) => node.textContent.trim() === label,
        );
        const target = matches[0],
          active = document.activeElement;
        return {
          matches: matches.length,
          targetDisabled: !!target?.disabled || !!target?.matches(':disabled'),
          targetInert: !!target?.closest('[inert]'),
          targetAriaDisabled: !!target?.closest('[aria-disabled="true"]'),
          reached: active === target,
          active: {
            tag: active?.tagName,
            role: active?.getAttribute('role'),
            label: active?.getAttribute('aria-label'),
            text: active?.textContent?.trim().slice(0, 120),
          },
        };
      }, match);
      action.focus.push({ step, ...state });
      assert.equal(state.matches, 1, `${label} resolves to one actual control`);
      assert.ok(
        !state.targetDisabled &&
          !state.targetInert &&
          !state.targetAriaDisabled,
        `${label} is actually enabled and outside inert content`,
      );
      if (state.reached) {
        reached = true;
        break;
      }
      if (step < 10) await page.keyboard.press('Tab');
    }
    assert.ok(reached, `Real Tab navigation reaches ${label} within ten steps`);
    await page.keyboard.press('Enter');
    action.afterEnterSnapshot = await page.snapshot();
  }
  async function create(label) {
    await keyboardActivate(label);
    const settings = await waitForImageWorkflow(
      () => fixture.json(`/api/images/${fixture.privateImage.id}/share`),
      (value) => value.share?.state === 'active',
      'Explicit private-share creation',
    );
    await page.waitForFunction(
      (url) =>
        [
          ...document.querySelectorAll(
            '[data-testid="image-share-body"] textarea',
          ),
        ].some((node) => node.value === url),
      settings.share.url,
    );
    assert.equal(settings.share.sourceVersion, 'compressed');
    await ui.sourcePreview(fixture.privateImage, settings.share.sourceVersion);
    return settings.share;
  }
  const first = await create('创建分享');
  assert.ok(
    Date.parse(first.expiresAt) - Date.now() <= 3600000 + 1000,
    'The real server uses the selected one-hour deadline',
  );
  await ui.capture(
    'private-share-active',
    body,
    `${body} button:text-is("复制地址")`,
  );
  await ui.captureMobileForm('private-share-active', [
    ['complete-link', `${body} textarea[aria-label="临时查看地址"]`, first.url],
    ['actions-revoke', `${body} button:text-is("撤销分享")`],
  ]);
  await keyboardActivate('复制地址');
  await page.waitForFunction(() => {
    const text =
      document.querySelector('[data-testid="image-share-body"]')?.textContent ??
      '';
    return (
      text.includes('已复制查看地址') ||
      text.includes('浏览器未允许自动复制，请手动复制')
    );
  });
  report.checks.push({
    scenario: 'private-share-copy-keyboard',
    result: await page.evaluate(() =>
      document
        .querySelector('[data-testid="image-share-body"]')
        ?.textContent.includes('已复制查看地址')
        ? 'copied-message'
        : 'explicit-manual-copy-fallback',
    ),
  });
  const pendingPreview = page.waitForEvent('popup', { timeout: 15000 });
  void pendingPreview.catch(() => undefined);
  await keyboardActivate('预览访客页', `${body} a`);
  const ownerPreview = await pendingPreview;
  try {
    await ownerPreview.waitForLoadState();
    await ownerPreview.waitForFunction(() =>
      [...document.images].some(
        (image) =>
          image.src.includes('/media') &&
          image.complete &&
          image.naturalWidth > 0,
      ),
    );
    assert.equal(
      new URL(await ownerPreview.url()).pathname,
      `/s/image/${first.token}`,
    );
    report.checks.push({
      scenario: 'private-share-preview-link-keyboard',
      popupPath: new URL(await ownerPreview.url()).pathname,
      actualMediaDecoded: true,
    });
  } catch (error) {
    if (!isBrowserControlStop(error)) await ownerPreview.close();
    throw error;
  }
  await ownerPreview.close();
  await task.cdp('Target.activateTarget', { targetId: page.targetId });
  const anonymous = await task.newPage();
  const url = new URL(config.origin);
  url.hostname = `image-share-${randomUUID().slice(0, 8)}.localhost`;
  const anonymousOrigin = url.origin;
  async function visit(share) {
    report.stage = 'private-share-anonymous-media';
    await anonymous.goto(`${anonymousOrigin}/s/image/${share.token}`);
    await anonymous.waitForFunction(() =>
      [...document.images].some(
        (image) =>
          image.src.includes('/media') &&
          image.complete &&
          image.naturalWidth > 0,
      ),
    );
    const session = await anonymous.fetch('/api/auth/get-session');
    assert.equal(session.status, 200);
    assert.equal(JSON.parse(session.body), null);
    const privateImage = await anonymous.fetch(
      `/i/${fixture.privateImage.id}?type=compressed`,
    );
    assert.equal(privateImage.status, 401);
    const content = await anonymous.fetch(`/s/image/${share.token}/media`, {
      method: 'HEAD',
    });
    assert.equal(content.status, 200);
    assert.equal(content.headers['referrer-policy'], 'no-referrer');
    assert.ok(content.headers['cache-control'].includes('no-store'));
    const visible = await anonymous.evaluate(() => document.body.innerText);
    assert.ok(!visible.includes(fixture.privateImage.displayName));
    assert.ok(
      (await anonymous.title()).endsWith(' · 图片分享'),
      'The anonymous single-image page uses its own public title',
    );
  }
  try {
    await visit(first);
    for (const width of [1440, 390, 360, 430, 768])
      for (const theme of width === 1440 || width === 390
        ? ['light', 'dark']
        : ['light']) {
        await resizeViewport(anonymous, width, width < 768 ? 844 : 1000);
        await setTheme(anonymous, theme);
        const geometry = await readGeometry(anonymous);
        assertGeometry(geometry, `anonymous share ${width} ${theme}`);
        const screenshot = `image-workflows-anonymous-${theme}-${width}.png`;
        await anonymous.screenshot({ path: join(config.output, screenshot) });
        report.layouts.push({
          scene: 'anonymous-share',
          width,
          theme,
          screenshot,
          geometry,
        });
      }
    await task.cdp('Target.activateTarget', { targetId: page.targetId });
    await keyboardActivate('撤销分享');
    await page.waitForSelector('loc=role:dialog[name="撤销图片分享"]');
    await keyboardActivate(
      '确认撤销',
      '[role="dialog"][aria-label="撤销图片分享"] button',
    );
    await waitForImageWorkflow(
      () => fixture.json(`/api/images/${fixture.privateImage.id}/share`),
      (value) => value.share?.state === 'revoked',
      'Explicit share revocation',
    );
    await anonymous.reload();
    await anonymous.waitForSelector('loc=role:heading[name="分享已失效"]');
    assert.equal(
      (await anonymous.fetch(`/s/image/${first.token}/media`)).status,
      410,
    );
    await task.cdp('Target.activateTarget', { targetId: page.targetId });
    const second = await create('重新创建分享');
    assert.notEqual(second.token, first.token);
    assert.equal(
      (await fetch(`${config.origin}/s/image/${first.token}`)).status,
      404,
      'Recreating never revives the old token',
    );
    await visit(second);
    await task.cdp('Target.activateTarget', { targetId: page.targetId });
    await keyboardActivate(
      '返回图片详情',
      `${body} [data-testid="detail-return"]`,
    );
    await page.waitForSelector(body, { state: 'hidden' });
    await page.waitForFunction(() =>
      document.activeElement?.closest('[data-testid="detail-more-entry"]'),
    );
    report.checks.push({
      scenario: 'private-share-independent-cookie-context',
      context:
        'Unique localhost subdomain with host-isolated Cookie in the same Ego profile',
      ownerOrigin: config.origin,
      anonymousOrigin,
      ownerSession: false,
      originalPrivateImageStatus: 401,
      explicitRevocationStatus: 410,
      sourceRole: second.sourceVersion,
      previousTokenRemainsInvalid: true,
    });
    return { anonymous, anonymousOrigin, share: second };
  } catch (error) {
    if (!isBrowserControlStop(error)) await anonymous.close();
    throw error;
  }
}
