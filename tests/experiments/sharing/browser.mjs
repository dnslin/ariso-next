/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { setTimeout: delay } = await import('node:timers/promises');
const task = await taskSpace(config.spaceId);
const pages = await task.pages();
const page = pages.some((item) => item.label === config.pageLabel)
  ? task.page(config.pageLabel)
  : await task.newPage();
assert.equal(
  page.label,
  config.pageLabel,
  'Use the authorized experiment Page',
);
const additional = await task.newPage();
const secrets = new Set(['sharing-password', 'sharing-experiment-password']);
const report = {
  startedAt: new Date().toISOString(),
  scope: 'protocol experiment',
  status: 'failed',
  taskSpaceId: task.spaceId,
  pageLabel: page.label,
  origin: config.origin,
  checks: [],
  lateResponses: [],
  visibilityEvents: [],
  twoBrowserContexts: 'unverified',
  limitations: [
    'Different hosts isolate cookies in one Ego profile; they are not two browser contexts.',
    'Ego Target.createTarget is unavailable; no separate browser context is claimed.',
    'The page is a protocol probe, not a delivered sharing UI or Figma acceptance.',
    'Control gates and the client batch switch are explicit experiment operations.',
  ],
};
const safe = (value) => {
  let output = String(value);
  for (const secret of secrets)
    output = output.replaceAll(secret, '[redacted]');
  return output;
};
async function request(path, init = {}) {
  const response = await fetch(`${config.origin}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.ok, true, 'Experiment control request succeeds');
  return response.json();
}
const control = (body) =>
  request('/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
async function waitControl(predicate, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (true) {
    const state = await request('/control');
    if (predicate(state)) return state;
    assert.ok(Date.now() < deadline, description);
    await delay(50);
  }
}
async function seed(id, password = 'sharing-password') {
  const share = await control({ action: 'seed', id, password });
  secrets.add(share.token);
  return share;
}
const unlock = (target, share) =>
  target.fetch(`/s/${share.token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'sharing-password' }),
  });
async function open(target, share) {
  await target.goto(`${config.origin}/s/${share.token}`);
  await target.waitForFunction(() => Boolean(window.sharingProbe));
}
async function activate(target) {
  await task.cdp('Target.activateTarget', { targetId: target.targetId });
  await target.waitForFunction(() => document.visibilityState === 'visible');
}
async function hidePage(reason) {
  // Ego's evaluate/waitForFunction/cdp activate their addressed Page. Drain its
  // binding events instead so observing the background Page cannot reveal it.
  await page.events();
  await activate(additional);
  const deadline = Date.now() + 3000;
  while (true) {
    const transitions = (await page.events())
      .filter(
        ({ method, params }) =>
          method === 'Runtime.bindingCalled' &&
          params.name === '__arisoSharingVisibility',
      )
      .map(({ params }) => params.payload);
    for (const visibility of transitions)
      report.visibilityEvents.push({ reason, visibility });
    if (transitions.includes('hidden')) return;
    assert.ok(
      Date.now() < deadline,
      'A real hidden document event is observed',
    );
    await delay(50);
  }
}
async function probe(target = page) {
  return target.evaluate(() => {
    const value = window.sharingProbe;
    return {
      status: value.status,
      items: value.items,
      showName: value.showName,
      applied: value.applied,
      ignored: value.ignored,
      batches: value.batches,
      errors: value.errors,
      visibility: value.visibility,
    };
  });
}
async function cookieHeaders(target) {
  const headers = (await target.events()).flatMap(({ method, params }) => {
    if (method !== 'Network.responseReceivedExtraInfo') return [];
    return Object.entries(params.headers)
      .filter(([name]) => name.toLowerCase() === 'set-cookie')
      .flatMap(([, value]) => String(value).split('\n'))
      .filter((value) => value.startsWith('ariso_share_grant='));
  });
  for (const header of headers) {
    const value = header.match(/^ariso_share_grant=([^;]+)/)?.[1];
    if (value) secrets.add(value);
  }
  return headers;
}
async function holdDecodedResponse(kind) {
  await page.evaluate((expectedKind) => {
    const original = window.fetch;
    const gate = {
      decoded: false,
      aborted: false,
      released: false,
      release: null,
    };
    window.sharingDecodeGate = gate;
    let armed = true;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (
        !armed ||
        !new URL(String(input), location.href).pathname.endsWith(
          `/${expectedKind}`,
        )
      )
        return response;
      armed = false;
      // Decode the real complete HTTP response before delaying delivery to the probe.
      const body = await response.json();
      gate.decoded = true;
      gate.aborted = init?.signal?.aborted ?? false;
      init?.signal?.addEventListener('abort', () => {
        gate.aborted = true;
      });
      await new Promise((resolve) => {
        gate.release = () => {
          gate.released = true;
          resolve();
        };
      });
      // Deliberately return those exact decoded bytes after abort, as in the
      // existing selection reconciliation experiment's held real Response.
      response.json = async () => body;
      return response;
    };
  }, kind);
}
let failure;
try {
  await Promise.all([
    page.cdp('Network.enable'),
    additional.cdp('Network.enable'),
  ]);
  await page.cdp('Runtime.enable');
  await page.cdp('Runtime.addBinding', { name: '__arisoSharingVisibility' });
  const visibilityScript = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `window.__arisoSharingVisibilityListener = () => {
        window.__arisoSharingVisibility(document.visibilityState);
      };
      document.addEventListener('visibilitychange', window.__arisoSharingVisibilityListener);`,
    },
  );
  const a = await seed('browser-cookie-a');
  const b = await seed('browser-cookie-b');
  await Promise.all([open(page, a), open(additional, b)]);
  assert.equal(
    (await probe()).status,
    401,
    'Share A initially needs a password',
  );
  assert.equal(
    (await probe(additional)).status,
    401,
    'Share B initially needs a password',
  );
  const beforeUnlock = Date.now();
  const unlocked = await Promise.all([unlock(page, a), unlock(additional, b)]);
  for (const result of unlocked) assert.equal(result.status, 200);
  const emitted = [
    ...(await cookieHeaders(page)),
    ...(await cookieHeaders(additional)),
  ];
  assert.equal(
    emitted.length,
    2,
    'Both real unlock responses emit a grant Cookie',
  );
  for (const header of emitted)
    assert.equal(
      /(?:^|;)\s*Domain=/i.test(header),
      false,
      'No Domain attribute is emitted',
    );
  const { cookies } = await page.cdp('Network.getCookies', {
    urls: [a, b].map((share) => `${config.origin}/s/${share.token}`),
  });
  const grants = cookies.filter(
    (cookie) => cookie.name === 'ariso_share_grant',
  );
  assert.equal(grants.length, 2, 'Same-name grant Cookies retain both paths');
  report.cookies = [a, b].map((share, index) => {
    const cookie = grants.find((item) => item.path === `/s/${share.token}`);
    assert.ok(Boolean(cookie), 'Cookie uses the matching share path');
    secrets.add(cookie.value);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax');
    assert.equal(cookie.secure, false);
    assert.equal(cookie.domain, new URL(config.origin).hostname);
    const remainingSeconds = cookie.expires - beforeUnlock / 1000;
    assert.ok(
      remainingSeconds >= 86395 && remainingSeconds <= 86430,
      'Cookie lasts 24 hours',
    );
    return {
      share: index === 0 ? 'a' : 'b',
      pathMatchesCurrentToken: true,
      noDomainAttribute: true,
      domain: cookie.domain,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      lifetimeSeconds: Math.round(remainingSeconds),
    };
  });
  for (const [target, share] of [
    [page, a],
    [additional, b],
  ]) {
    assert.equal(
      await target.evaluate(() =>
        document.cookie.includes('ariso_share_grant'),
      ),
      false,
    );
    const response = await target.fetch(`/s/${share.token}/items`);
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(JSON.parse(response.body).items.length, 161);
    assert.equal(
      JSON.parse(response.body).items.some(({ id }) =>
        ['private-image', 'trashed-image'].includes(id),
      ),
      false,
    );
  }
  report.checks.push(
    'Real HttpOnly/Lax/host-only/path-scoped 24-hour Cookies; concurrent albums retain grants and private/trashed entries stay absent.',
  );

  await open(additional, a);
  await Promise.all([page.events(), additional.events()]);
  const countBefore = (await request('/control')).grantCount;
  for (const result of await Promise.all([
    unlock(page, a),
    unlock(additional, a),
  ]))
    assert.equal(result.status, 200);
  assert.equal((await request('/control')).grantCount, countBefore + 2);
  const parallelHeaders = [
    ...(await cookieHeaders(page)),
    ...(await cookieHeaders(additional)),
  ];
  assert.equal(
    parallelHeaders.length,
    2,
    'Both same-album tabs receive independent grants',
  );
  for (const header of parallelHeaders) {
    const grant = header.match(/^ariso_share_grant=([^;]+)/)[1];
    const response = await fetch(`${config.origin}/s/${a.token}/items`, {
      headers: { Cookie: `ariso_share_grant=${grant}` },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(
      response.status,
      200,
      'Each concurrently issued grant remains valid',
    );
  }
  report.checks.push(
    'Two same-origin tabs unlock one album concurrently; each real issued grant remains valid.',
  );

  const other = new URL(config.origin);
  other.hostname = 'localhost';
  assert.notEqual(other.hostname, new URL(config.origin).hostname);
  await additional.goto(`${other.origin}/s/${a.token}`);
  await additional.waitForFunction(() => Boolean(window.sharingProbe));
  assert.equal(
    (await probe(additional)).status,
    401,
    'Different host receives no grant Cookie',
  );
  const isolated = await additional.cdp('Network.getCookies', {
    urls: [`${other.origin}/s/${a.token}`],
  });
  assert.equal(
    isolated.cookies.some(({ name }) => name === 'ariso_share_grant'),
    false,
  );
  report.checks.push(
    'A different host remains anonymous in the same profile; this is host isolation, not a second browser context.',
  );

  assert.equal(
    (await page.fetch('/owner')).status,
    401,
    'The browser does not send a path-scoped sharing Cookie to the owner route',
  );
  const ownerLogin = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-experiment-ip': '192.0.2.240',
    },
    body: JSON.stringify({
      email: 'owner@example.test',
      password: 'sharing-experiment-password',
    }),
  });
  assert.equal(ownerLogin.status, 200);
  assert.equal((await page.fetch('/owner')).status, 200);
  const ownerLocked = await seed('browser-owner-locked');
  assert.equal(
    (await page.fetch(`/s/${ownerLocked.token}/items`)).status,
    401,
    'Owner Cookie does not bypass share password',
  );
  assert.equal(
    (
      await page.fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    200,
  );
  report.checks.push(
    'Browser Cookie paths keep the owner route anonymous; a real owner Cookie still needs the sharing password. Explicitly forwarding grant Cookies and real private delivery are covered by separate HTTP tests.',
  );

  const polling = await seed('browser-polling', null);
  await activate(page);
  await open(page, polling);
  const started = Date.now();
  await page.waitForFunction(
    () =>
      window.sharingProbe.batches.length >= 3 &&
      window.sharingProbe.applied >= 3,
    undefined,
    { timeout: 10000 },
  );
  const firstPollMs = Date.now() - started;
  assert.ok(
    firstPollMs >= 4500,
    'First automatic refresh waits for the five-second interval',
  );
  assert.deepEqual((await probe()).batches.slice(0, 3), [80, 80, 1]);
  await control({
    action: 'gate',
    id: polling.id,
    kind: 'refresh',
    enabled: true,
  });
  await waitControl(
    (state) =>
      state.gates.some(
        (gate) =>
          gate.id === polling.id &&
          gate.kind === 'refresh' &&
          gate.entered === 1,
      ),
    'An actual automatic refresh reaches its response gate',
  );
  await delay(5500);
  let pollingState = await request('/control');
  assert.equal(
    pollingState.gates.find(
      (gate) => gate.id === polling.id && gate.kind === 'refresh',
    ).entered,
    1,
    'Unfinished polling never overlaps another cycle',
  );
  await hidePage('polling-stops-when-hidden');
  const hiddenCount = pollingState.requests.filter(
    (item) => item.id === polling.id && item.kind === 'refresh',
  ).length;
  await delay(5500);
  pollingState = await request('/control');
  assert.equal(
    pollingState.requests.filter(
      (item) => item.id === polling.id && item.kind === 'refresh',
    ).length,
    hiddenCount,
    'A real hidden document sends no polls',
  );
  await control({
    action: 'gate',
    id: polling.id,
    kind: 'refresh',
    enabled: false,
  });
  await control({
    action: 'member',
    id: polling.id,
    imageId: 'img-000',
    public: false,
  });
  await control({
    action: 'member',
    id: polling.id,
    imageId: 'img-001',
    public: true,
    trashed: true,
  });
  const resumedAt = Date.now();
  await activate(page);
  await waitControl(
    (state) =>
      state.requests.filter(
        (item) => item.id === polling.id && item.kind === 'refresh',
      ).length >=
      hiddenCount + 3,
    'Visibility restoration immediately checks all loaded IDs',
    3000,
  );
  const resumedMs = Date.now() - resumedAt;
  assert.ok(
    resumedMs < 3000,
    'Restoration does not wait for the next five-second timer',
  );
  const batches = (await request('/control')).requests
    .filter((item) => item.id === polling.id && item.kind === 'refresh')
    .map((item) => item.ids.length);
  assert.deepEqual(batches.slice(-3), [80, 80, 1]);
  await page.waitForFunction(() => window.sharingProbe.items.length === 159);
  assert.equal(
    (await probe()).items.some(({ id }) => ['img-000', 'img-001'].includes(id)),
    false,
  );
  report.polling = {
    firstPollMs,
    resumedMs,
    firstBatches: batches.slice(0, 3),
    noOverlap: true,
    actualVisibilityChange: true,
    changedMembersRemoved: 2,
  };
  report.checks.push(
    'Actual visible document polls every five seconds in 80/80/1 batches, never overlaps a held cycle, stops when hidden and checks immediately when restored; newly private or trashed members disappear.',
  );

  const visibilityRace = await seed('browser-visibility-race', null);
  await open(page, visibilityRace);
  await holdDecodedResponse('refresh');
  await page.evaluate(() => {
    void window.sharingProbe.refresh();
  });
  await page.waitForFunction(() => window.sharingDecodeGate.decoded);
  const raceBefore = (await request('/control')).requests.filter(
    (item) => item.id === visibilityRace.id && item.kind === 'refresh',
  ).length;
  await hidePage('pending-refresh-immediate-restoration');
  const raceResumedAt = Date.now();
  await activate(page);
  await waitControl(
    (state) =>
      state.requests.filter(
        (item) => item.id === visibilityRace.id && item.kind === 'refresh',
      ).length >=
      raceBefore + 3,
    'Visibility restoration starts a new refresh before the old decoded response is released',
    2500,
  );
  assert.ok(
    Date.now() - raceResumedAt < 2500,
    'Restoration works while an old cancelled refresh is unresolved',
  );
  const restored = await probe();
  await page.evaluate(() => window.sharingDecodeGate.release());
  await page.waitForFunction(
    (value) => window.sharingProbe.ignored > value,
    restored.ignored,
  );
  assert.deepEqual(
    (await probe()).items,
    restored.items,
    'Old refresh finally cannot undo the restored cycle',
  );
  report.checks.push(
    'A real hide/show transition starts a fresh check immediately while the cancelled decoded old refresh is still unresolved; its late return is ignored.',
  );

  for (const kind of ['items', 'neighbors', 'refresh']) {
    for (const change of [
      'authorization-cleared',
      'names-hidden',
      'batch-changed',
    ]) {
      const share = await seed(`browser-late-${kind}-${change}`);
      await control({
        action: 'change',
        id: share.id,
        patch: { showName: true },
      });
      await open(page, share);
      assert.equal((await unlock(page, share)).status, 200);
      await open(page, share);
      const before = await probe();
      assert.equal(before.items.length, 161);
      assert.equal(
        before.items.every((item) => typeof item.displayName === 'string'),
        true,
      );
      await holdDecodedResponse(kind);
      await page.evaluate((value) => {
        const current = window.sharingProbe;
        void (value === 'refresh' ? current.refresh() : current.load(value));
      }, kind);
      await page.waitForFunction(() => window.sharingDecodeGate.decoded);
      const otherKind = kind === 'items' ? 'neighbors' : 'items';
      if (change === 'authorization-cleared') {
        await control({
          action: 'change',
          id: share.id,
          patch: { enabled: false },
        });
        await page.evaluate(
          (value) => window.sharingProbe.load(value),
          otherKind,
        );
        assert.equal((await probe()).status, 410);
        assert.equal((await probe()).items.length, 0);
      } else if (change === 'names-hidden') {
        await control({
          action: 'change',
          id: share.id,
          patch: { showName: false },
        });
        await page.evaluate(
          (value) => window.sharingProbe.load(value),
          otherKind,
        );
        assert.equal((await probe()).showName, false);
        assert.equal(
          (await probe()).items.some((item) => 'displayName' in item),
          false,
        );
      } else {
        // An explicit probe batch switch, not a product interaction or server mutation.
        await page.evaluate(() => {
          window.sharingProbe.invalidate();
          window.sharingProbe.items = window.sharingProbe.items.slice(0, 1);
        });
      }
      const changed = await probe();
      assert.equal(
        await page.evaluate(() => window.sharingDecodeGate.aborted),
        true,
        'Invalidation aborts the old request after its response was decoded',
      );
      assert.equal(
        changed.ignored,
        before.ignored,
        'No decoded stale result is claimed before delivery',
      );
      await page.evaluate(() => window.sharingDecodeGate.release());
      await page.waitForFunction(
        (value) => window.sharingProbe.ignored > value,
        before.ignored,
      );
      const after = await probe();
      assert.equal(
        after.status,
        changed.status,
        'Late response cannot restore access',
      );
      assert.equal(
        after.showName,
        changed.showName,
        'Late response cannot restore names',
      );
      assert.deepEqual(
        after.items,
        changed.items,
        'Late response cannot restore an old batch',
      );
      assert.equal(
        after.applied,
        changed.applied,
        'Old real response is never applied',
      );
      assert.deepEqual(
        after.errors,
        [],
        'Cancellation does not create an unhandled probe error',
      );
      report.lateResponses.push({
        kind,
        change,
        realResponseDecodedBeforeDelay: true,
        deliveredAfterAbort: true,
        ignored: true,
        oldDataNotRestored: true,
        explicitProbeBatchSwitch: change === 'batch-changed',
      });
    }
  }
  report.checks.push(
    'Nine fully decoded real items/neighbors/refresh responses are delivered after abort and rejected by generation after access invalidation, server name hiding or an explicit experimental batch switch.',
  );
  report.environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    visibility: document.visibilityState,
  }));
  await page.evaluate(() => {
    document.removeEventListener(
      'visibilitychange',
      window.__arisoSharingVisibilityListener,
    );
    delete window.__arisoSharingVisibilityListener;
  });
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', visibilityScript);
  await page.cdp('Runtime.removeBinding', { name: '__arisoSharingVisibility' });
  await additional.close();
  report.visibilityObserverRemoved = true;
  report.status = 'passed';
} catch (error) {
  failure = new Error(safe(error.stack ?? error));
  report.error = failure.message;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'sharing-experiment.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log(JSON.stringify(report));
// The caller owns the one shared TaskSpace and decides when to finish it.
