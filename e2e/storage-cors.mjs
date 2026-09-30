/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { setTimeout: delay } = await import('node:timers/promises');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  checks: [],
  services: [],
};
const request = async (path, method = 'GET', body) => {
  const response = await page.fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  assert.ok(
    response.status >= 200 && response.status < 300,
    `${method} ${path}: HTTP ${response.status} ${response.body}`,
  );
  return JSON.parse(response.body);
};
const control = async (mode) => {
  const response = await fetch(`${config.corsFixture}/_control`, {
    ...(mode ? { method: 'POST', body: JSON.stringify({ mode }) } : {}),
  });
  assert.equal(response.status, 200);
  return response.json();
};
try {
  await page.goto(config.origin);
  // The preceding identity suite deliberately exhausts the real login window.
  // Honor the server deadline; never clear its persisted limits or retry early.
  const signIn = () =>
    page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
  let login = await signIn();
  for (let attempt = 0; login.status === 429 && attempt < 6; attempt++) {
    const seconds = Number(
      login.headers['x-retry-after'] ?? login.headers['retry-after'],
    );
    assert.ok(
      Number.isFinite(seconds) && seconds > 0,
      'Rate-limited login must provide a positive retry deadline',
    );
    (report.loginRetrySeconds ??= []).push(seconds);
    await delay(seconds * 1000);
    login = await signIn();
  }
  assert.equal(
    login.status,
    200,
    `CORS verification login: HTTP ${login.status} ${login.body}`,
  );
  if (config.corsFixture) {
    const { verifyCorsAccessBoundaries } = await import(
      config.storageCorsUiScript
    );
    await verifyCorsAccessBoundaries(page, config, request, report);
  }
  const targets = config.corsTargets ?? [
    {
      service: 'local-http-fixture',
      endpoint: config.corsFixture,
      region: 'us-east-1',
      bucket: 'cors-test',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test-access',
        secretAccessKey: 'test-secret',
      },
    },
  ];
  for (const target of targets) {
    const storage = await request('/api/storages', 'POST', {
      type: 's3',
      name: `Issue 158 ${target.service}`,
      endpoint: target.endpoint,
      region: target.region,
      bucket: target.bucket,
      forcePathStyle: target.forcePathStyle,
      accessKey: target.credentials.accessKeyId,
      secretKey: target.credentials.secretAccessKey,
    });
    const entry = {
      service: target.service,
      storageId: storage.id,
      probes: [],
    };
    report.services.push(entry);
    if (target.service === 'r2')
      assert.ok(
        config.r2NoLockEvidence,
        'R2 connection test requires recorded whole-bucket no-lock confirmation',
      );
    const connection = await request(
      `/api/storages/${storage.id}/test`,
      'POST',
      {
        revision: storage.configRevision,
        ...(target.service === 'r2' ? { wholeBucketHasNoLockRules: true } : {}),
      },
    );
    assert.equal(connection.passed, true);
    entry.connection = connection;
    const state = await request(`/api/storages/${storage.id}/cors-tests`);
    assert.equal(state.origin, config.origin);
    assert.equal(state.status, 'untested');
    assert.deepEqual(state.example[0].AllowedOrigins, [config.origin]);
    assert.deepEqual(state.example[0].AllowedMethods, ['PUT', 'GET', 'HEAD']);
    assert.ok(!state.example[0].AllowedMethods.includes('OPTIONS'));
    const cookies = await page.cdp('Network.getCookies', {
      urls: [config.origin],
    });
    const wrongOriginUrl = new URL(
      `/api/storages/${storage.id}/cors-tests`,
      config.origin,
    );
    wrongOriginUrl.hostname = '127.0.0.1';
    const rejectedOrigin = await fetch(wrongOriginUrl, {
      method: 'POST',
      headers: {
        origin: 'https://incorrect.example.test',
        cookie: cookies.cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join('; '),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ revision: storage.configRevision }),
    });
    assert.equal(rejectedOrigin.status, 403);
    assert.equal((await rejectedOrigin.json()).code, 'INVALID_ORIGIN');
    assert.equal(
      (await request(`/api/storages/${storage.id}/cors-tests`)).probes.length,
      0,
    );
    report.checks.push(
      `${target.service}: authenticated HTTP request with wrong Origin rejected before issuing a probe (HTTP contract check, not a browser CORS claim)`,
    );
    const {
      openCorsUi,
      runCorsUiSample,
      verifyCorsUiFailures,
      verifyCorsLayouts,
    } = await import(config.storageCorsUiScript);
    await openCorsUi(page, config, storage.id);
    await verifyCorsLayouts(
      page,
      config,
      `${target.service}-overview`,
      report,
      [1440, 390],
    );
    const completed = await runCorsUiSample(page, storage.id);
    const results = completed.stages
      .filter((stage) => stage.stage.startsWith('browser-'))
      .map((stage) => stage.evidence);
    assert.deepEqual(
      results.map((result) => result.method),
      ['PUT', 'GET', 'HEAD'],
    );
    assert.ok(
      results.every(
        (result) =>
          result.responseType === 'cors' &&
          result.status >= 200 &&
          result.status < 300,
      ),
    );
    entry.probes.push({
      key: `probes/${completed.probeId}`,
      results,
      report: completed,
    });
    assert.equal(completed.passed, true);
    assert.equal(completed.cleanupPending, false);
    await page.reload();
    await page.waitForSelector(
      '[data-testid="storage-cors"][data-state="passed"]',
    );
    const persisted = await request(`/api/storages/${storage.id}/cors-tests`);
    assert.equal(persisted.status, 'passed');
    assert.equal(persisted.report.probeId, completed.probeId);
    assert.equal(persisted.probes.length, 0);
    report.checks.push(
      `${target.service}: real UI activation invokes production browser PUT/GET/HEAD, byte equality, server verification/cleanup and persisted passed result`,
    );
    if (config.corsFixture) {
      await verifyCorsUiFailures({
        page,
        config,
        storage,
        control,
        request,
        report,
        entry,
      });
      const fixture = await control();
      assert.deepEqual(fixture.objects, []);
      assert.ok(fixture.requests.some((item) => item.method === 'OPTIONS'));
      entry.fixture = fixture;
    } else {
      await verifyCorsLayouts(
        page,
        config,
        `${target.service}-passed`,
        report,
        [1440, 390],
      );
    }
  }
  await request('/api/auth/sign-out', 'POST', {});
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  if (config.corsFixture) await control('normal');
  await writeFile(
    join(config.output, 'storage-cors.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  storageCors: report.status,
  report: join(config.output, 'storage-cors.json'),
});
