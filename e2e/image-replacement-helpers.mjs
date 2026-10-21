import assert from 'node:assert/strict';
import { join } from 'node:path';

const status = '[data-testid="detail-replacement-status"]';

export async function ensureWorkflowOwnerVisible(page, report, phase) {
  const read = () =>
    page.evaluate(() => ({
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      href: location.href,
    }));
  const entry = { phase, before: await read() };
  (report.ownerVisibility ??= []).push(entry);
  await page.cdp('Page.bringToFront');
  await page.waitForFunction(
    () => !document.hidden && document.visibilityState === 'visible',
  );
  entry.after = await read();
}

/** Failure diagnostics are captured before the native upload cap is restored. */
export async function recordCappedReplacementReception(
  page,
  fixture,
  imageId,
  uploadIndex,
  expectedJobId,
  phase,
  report,
) {
  const states = await Promise.allSettled([
    page.evaluate(
      ({ imageId, uploadIndex }) => {
        const card = document.querySelector(`[data-image-id="${imageId}"]`);
        const active = document.activeElement;
        const observer = window.__imageWorkflowReplacement;
        const request = observer?.requests[uploadIndex];
        return {
          at: new Date().toISOString(),
          hidden: document.hidden,
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
          href: location.href,
          cardText: card?.textContent.trim() ?? null,
          cardJobId: card?.getAttribute('data-job-id') ?? null,
          detailOpen: !!document.querySelector(
            '[data-testid="library-detail"]',
          ),
          detailStatus:
            document
              .querySelector('[data-testid="detail-replacement-status"]')
              ?.textContent.trim() ?? null,
          focus: active
            ? {
                tag: active.tagName,
                id: active.id,
                role: active.getAttribute('role'),
                ariaLabel: active.getAttribute('aria-label'),
                text: active.textContent.trim().slice(0, 120),
                connected: active.isConnected,
              }
            : null,
          xhrCount: observer?.requests.length ?? null,
          xhr: request
            ? {
                filename: request.filename,
                status: request.status,
                ended: request.ended,
                aborted: request.aborted,
              }
            : null,
        };
      },
      { imageId, uploadIndex },
    ),
    fixture.json(`/api/images/${imageId}/replace`),
    fixture.detail(imageId).then((detail) => ({
      activeJob: detail.activeJob,
      processingJob: detail.processingJob,
      originalName: detail.originalName,
      contentUpdatedAt: detail.contentUpdatedAt,
      width: detail.width,
      height: detail.height,
    })),
  ]);
  const value = (result) =>
    result.status === 'fulfilled'
      ? result.value
      : { diagnosticError: result.reason?.stack ?? String(result.reason) };
  (report.replacementReceptionDiagnostics ??= []).push({
    phase,
    at: new Date().toISOString(),
    uploadCapBytesPerSecond: 128,
    expectedJobId,
    browser: value(states[0]),
    replacement: value(states[1]),
    detail: value(states[2]),
  });
}

/** Serialized DOM read: a visited hidden panel is never the current preview. */
export function readSelectedDetailPreview() {
  const dialog = document.querySelector('[data-testid="library-detail"]');
  const tabs = [
    ...(dialog?.querySelectorAll(
      '[role="tablist"][aria-label="查看版本"] [role="tab"][aria-selected="true"]',
    ) ?? []),
  ];
  const tab = tabs[0];
  const panel = document.getElementById(
    tab?.getAttribute('aria-controls') ?? '',
  );
  const visible = (node) =>
    !!node?.getClientRects().length &&
    !node.closest('[inert],[data-inert],[hidden],[aria-hidden="true"]');
  const panelVisible =
    !!panel &&
    !!dialog?.contains(panel) &&
    panel.getAttribute('role') === 'tabpanel' &&
    visible(panel);
  const images = panelVisible
    ? [...panel.querySelectorAll('[data-testid="detail-preview"]')].filter(
        visible,
      )
    : [];
  const image = images[0];
  const path = image?.getAttribute('src') ?? null;
  const url = path ? new URL(path, location.href) : null;
  return {
    selectedCount: tabs.length,
    label: tab?.textContent.trim() ?? null,
    panelVisible,
    imageCount: images.length,
    path,
    role: url?.searchParams.get('type') ?? null,
    contentId: url?.searchParams.get('v') ?? null,
    complete: image?.complete ?? false,
    width: image?.naturalWidth ?? 0,
    height: image?.naturalHeight ?? 0,
  };
}

async function detailMenuState(page, name) {
  return page.evaluate((name) => {
    const menu = document.querySelector(
      '[role="menu"][aria-label="图片详情更多操作"]',
    );
    const matches = [
      ...(menu?.querySelectorAll('[role="menuitem"]') ?? []),
    ].filter((item) => item.textContent.trim() === name);
    const item = matches[0];
    return {
      name,
      count: matches.length,
      html: item?.outerHTML ?? null,
      disabled: !!item?.disabled || !!item?.matches(':disabled'),
      ariaDisabled: item?.getAttribute('aria-disabled') ?? null,
      dataDisabled: item?.getAttribute('data-disabled') ?? null,
      blockedAncestor: !!item?.closest('[inert],[aria-disabled="true"]'),
      focused: document.activeElement === item,
      activeRole: document.activeElement?.getAttribute('role') ?? null,
      activeText: document.activeElement?.textContent.trim() ?? null,
      inputDisabled:
        document.querySelector('[data-testid="replacement-file-input"]')
          ?.disabled ?? null,
    };
  }, name);
}

/** Native keyboard activation avoids Ego's verified false-disabled menu clicks. */
export async function activateDetailMenuAction(page, name, report) {
  const trace = { name, input: 'native-focus-Enter', states: [] };
  (report.detailMenuActions ??= []).push(trace);
  await page.click('[data-testid="detail-more-entry"]');
  const selector = `loc=role:menuitem[name=${JSON.stringify(name)}]`;
  await page.waitForSelector(selector);
  trace.states.push(await detailMenuState(page, name));
  await page.waitForFunction((name) => {
    const menu = document.querySelector(
      '[role="menu"][aria-label="图片详情更多操作"]',
    );
    const item = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find(
      (node) => node.textContent.trim() === name,
    );
    return (
      item &&
      !item.disabled &&
      !item.matches(':disabled') &&
      item.getAttribute('aria-disabled') !== 'true' &&
      (item.getAttribute('data-disabled') === null ||
        item.getAttribute('data-disabled') === 'false') &&
      !item.closest('[inert],[aria-disabled="true"]') &&
      (name !== '替换图片' ||
        document.querySelector('[data-testid="replacement-file-input"]')
          ?.disabled === false)
    );
  }, name);
  await page.focus(selector);
  const focused = await detailMenuState(page, name);
  trace.states.push(focused);
  assert.equal(focused.count, 1);
  assert.equal(
    focused.focused,
    true,
    'The actual requested menu item receives keyboard focus',
  );
  assert.equal(focused.disabled || focused.blockedAncestor, false);
  assert.notEqual(focused.ariaDisabled, 'true');
  assert.ok(focused.dataDisabled === null || focused.dataDisabled === 'false');
  if (name === '替换图片') {
    // Ego must own the chooser before Enter. A bare CDP interception still
    // causes its unhandled-file-chooser guard to cancel the native picker.
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 10000 }),
      page.keyboard.press('Enter'),
    ]);
    assert.equal(
      await chooser.isMultiple(),
      false,
      'Replacement accepts one file',
    );
    return chooser;
  }
  await page.keyboard.press('Enter');
  await page.waitForSelector(selector, { state: 'hidden' });
}

export async function chooseDetailReplacement(page, files, report) {
  const chooser = await activateDetailMenuAction(page, '替换图片', report);
  const result = await chooser.setFiles(files);
  await page.waitForSelector('loc=role:menuitem[name="替换图片"]', {
    state: 'hidden',
  });
  return result;
}

/** Observe real native input activation and XHRs without replacing a response. */
export async function observeReplacement(page) {
  const dispose = () =>
    page.evaluate(() => {
      const state = window.__imageWorkflowReplacement;
      if (!state) return;
      XMLHttpRequest.prototype.open = state.open;
      XMLHttpRequest.prototype.send = state.send;
      document.removeEventListener('click', state.click, true);
      delete window.__imageWorkflowReplacement;
    });
  try {
    await page.evaluate(() => {
      const state = {
        open: XMLHttpRequest.prototype.open,
        send: XMLHttpRequest.prototype.send,
        requests: [],
        chooserClicks: 0,
      };
      const requests = new WeakMap();
      state.click = (event) => {
        if (event.target.matches?.('[data-testid="replacement-file-input"]'))
          state.chooserClicks++;
      };
      window.__imageWorkflowReplacement = state;
      document.addEventListener('click', state.click, true);
      XMLHttpRequest.prototype.open = function (method, url, ...args) {
        if (
          method.toUpperCase() === 'POST' &&
          /^\/api\/images\/[^/]+\/replace$/.test(
            new URL(String(url), location.href).pathname,
          )
        )
          requests.set(this, {
            url: String(url),
            status: null,
            ended: false,
            aborted: false,
          });
        return state.open.call(this, method, url, ...args);
      };
      XMLHttpRequest.prototype.send = function (body) {
        const entry = requests.get(this);
        if (entry) {
          entry.filename =
            body instanceof FormData ? body.get('file')?.name : null;
          state.requests.push(entry);
          this.addEventListener('abort', () => {
            entry.aborted = true;
          });
          this.addEventListener('loadend', () => {
            entry.status = this.status;
            entry.body = this.responseText;
            entry.ended = true;
          });
        }
        return state.send.call(this, body);
      };
    });
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        `Replacement observer installation failed: ${error}; cleanup failed: ${cleanup}`,
      );
    }
    throw error;
  }
  return {
    read: () =>
      page.evaluate(() => ({
        requests: window.__imageWorkflowReplacement.requests,
        chooserClicks: window.__imageWorkflowReplacement.chooserClicks,
      })),
    dispose,
  };
}

export async function verifyUploadedImageReplacement({
  page,
  config,
  report,
  imageId,
}) {
  const href = await page.url();
  const read = async () => {
    const response = await page.fetch(`/api/images/${imageId}`);
    assert.equal(response.status, 200);
    return JSON.parse(response.body);
  };
  const before = await read();
  const observation = await observeReplacement(page);
  try {
    await chooseDetailReplacement(page, [], report);
    assert.equal((await observation.read()).requests.length, 0);
    assert.equal(await page.url(), href);
    await chooseDetailReplacement(
      page,
      [
        join(
          config.projectDirectory,
          'tests/fixtures/media-formats/source.png',
        ),
      ],
      report,
    );
    await page.waitForSelector(`${status}[data-state="succeeded"]`, {
      timeout: 120000,
    });
    const observed = await observation.read();
    assert.equal(observed.requests.length, 1);
    assert.equal(observed.requests[0].status, 202);
    assert.equal(observed.chooserClicks, 2);
    assert.equal(
      await page.url(),
      href,
      'Replacing an upload result retains its upload and album query context',
    );
    assert.equal(new URL(href).pathname, '/upload');
    assert.equal(new URL(href).searchParams.get('image'), imageId);
    const after = await read();
    assert.equal(after.id, before.id);
    assert.deepEqual(after.defaultLink.links, before.defaultLink.links);
    const original = after.versions.find(
      (version) => version.kind === 'original',
    );
    assert.notEqual(
      original.contentId,
      before.versions.find((version) => version.kind === 'original').contentId,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-testid="detail-replacement"], [data-testid="replacement-submit"]',
          ).length,
      ),
      0,
    );
    report.checks.push(
      'Upload-result replacement opens the native single-file selector, cancellation sends no POST, selecting one file sends one real accepted replacement, and the original detail, image identity, external link and upload URL remain in place.',
    );
  } finally {
    await observation.dispose();
  }
}
