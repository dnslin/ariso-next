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
async function start(storage) {
  return request(`/api/storages/${storage.id}/cors-tests`, 'POST', {
    revision: storage.configRevision,
  });
}
async function perform(session) {
  // These are native browser fetches: preflight, CORS and readable response
  // semantics are enforced by the actual browser, not a Node request.
  return page.evaluate(async (session) => {
    const results = [];
    for (const signature of [session.upload, session.get, session.head]) {
      try {
        const response = await fetch(signature.url, {
          method: signature.method,
          headers: signature.headers,
          mode: 'cors',
          credentials: 'omit',
          ...(signature.method === 'PUT' ? { body: session.payload } : {}),
        });
        const mismatch =
          signature.method === 'GET' &&
          response.ok &&
          (await response.text()) !== session.payload;
        results.push({
          method: signature.method,
          status: response.status,
          responseType: response.type,
          ...(mismatch ? { error: 'Browser GET payload mismatch' } : {}),
        });
      } catch (error) {
        results.push({
          method: signature.method,
          status: 0,
          responseType: 'error',
          error: error.message,
        });
      }
    }
    return results;
  }, session);
}
async function complete(storage, session, results) {
  return request(
    `/api/storages/${storage.id}/cors-tests/${session.probeId}/complete`,
    'POST',
    { results },
  );
}
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
    const session = await start(storage);
    const results = await perform(session);
    assert.deepEqual(
      results.map((result) => result.method),
      ['PUT', 'GET', 'HEAD'],
    );
    assert.ok(
      results.every(
        (result) =>
          result.responseType === 'cors' &&
          result.status >= 200 &&
          result.status < 300 &&
          !result.error,
      ),
      JSON.stringify(results),
    );
    const completed = await complete(storage, session, results);
    entry.probes.push({ key: session.upload.key, results, report: completed });
    assert.equal(completed.passed, true);
    assert.equal(completed.cleanupPending, false);
    await page.reload();
    const persisted = await request(`/api/storages/${storage.id}/cors-tests`);
    assert.equal(persisted.status, 'passed');
    assert.equal(persisted.report.probeId, session.probeId);
    assert.equal(persisted.probes.length, 0);
    report.checks.push(
      `${target.service}: actual browser PUT/GET/HEAD, byte equality, server verification/cleanup and persisted passed result`,
    );
    if (config.corsFixture) {
      await control('deny-cors');
      const failedSession = await start(storage);
      const failedResults = await perform(failedSession);
      assert.ok(
        failedResults.some((result) => result.responseType === 'error'),
      );
      const failed = await complete(storage, failedSession, failedResults);
      entry.probes.push({
        key: failedSession.upload.key,
        results: failedResults,
        report: failed,
      });
      assert.equal(failed.passed, false);
      assert.equal(
        (await request(`/api/storages/${storage.id}/cors-tests`)).status,
        'failed',
      );
      await control('delete-failure');
      const dirtySession = await start(storage);
      const dirty = await complete(
        storage,
        dirtySession,
        await perform(dirtySession),
      );
      entry.probes.push({ key: dirtySession.upload.key, report: dirty });
      assert.equal(dirty.passed, false);
      assert.equal(dirty.cleanupPending, true);
      await control('normal');
      await request(
        `/api/storages/${storage.id}/probes/${dirtySession.probeId}/retry-cleanup`,
        'POST',
        {},
      );
      assert.equal(
        (await request(`/api/storages/${storage.id}/cors-tests`)).probes.length,
        0,
      );
      const abandoned = await start(storage);
      assert.ok(
        (await perform(abandoned)).every(
          (result) => result.status >= 200 && result.status < 300,
        ),
      );
      // Leave without completion and advance only this disposable probe's
      // deadline. The production maintenance loop must own cleanup.
      await page.goto(`${config.origin}/`);
      const { identitySql } = await import(config.identitySessionScript);
      await identitySql(
        config,
        `UPDATE storage_probes SET expires_at = 1 WHERE id = '${abandoned.probeId}'`,
      );
      await page.waitForFunction(
        async (storageId) => {
          const response = await fetch(`/api/storages/${storageId}/cors-tests`);
          if (!response.ok) return false;
          const state = await response.json();
          return state.probes.length === 0 && state.status === 'failed';
        },
        storage.id,
        { timeout: 75000 },
      );
      const expired = await request(`/api/storages/${storage.id}/cors-tests`);
      assert.equal(expired.report.passed, false);
      assert.equal(expired.report.probeId, abandoned.probeId);
      entry.probes.push({ key: abandoned.upload.key, report: expired.report });
      report.checks.push(
        'Leaving without completion and controlled persisted expiry invokes the real server maintenance cleanup and preserves a failed result',
      );
      const fixture = await control();
      assert.deepEqual(fixture.objects, []);
      assert.ok(fixture.requests.some((item) => item.method === 'OPTIONS'));
      entry.fixture = fixture;
      report.checks.push(
        'Real CORS refusal never passes; DELETE failure persists cleanup responsibility; retry empties the exact fixture object list',
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
