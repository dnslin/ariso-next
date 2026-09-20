/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const task = await taskSpace(
  config.spaceId ?? 'Ariso identity protocol experiment',
);
console.log({ taskSpaceId: task.spaceId });
const page = task.page('p1');
const report = { taskSpaceId: task.spaceId, status: 'failed', checks: [] };
try {
  let index = 0;
  for (const host of ['127.0.0.1', 'localhost', '127.0.0.1']) {
    const origin = `http://${host}:${config.port}`;
    await writeFile(config.configPath, JSON.stringify({ origin }));
    await page.goto(origin);
    const login = await page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-experiment-ip': `192.0.2.${++index}`,
      },
      body: JSON.stringify({
        email: 'owner@example.test',
        password: 'identity-experiment-password',
      }),
    });
    assert.equal(login.status, 200, login.body);
    const session = await page.fetch('/api/auth/get-session');
    assert.equal(JSON.parse(session.body).user.email, 'owner@example.test');
    const direct = await page.fetch('/probe/session');
    assert.deepEqual(JSON.parse(direct.body), JSON.parse(session.body));
    const readable = await page.evaluate(() => document.cookie);
    assert.ok(!readable.includes('ariso-identity-experiment.session_token'));
    const { cookies } = await page.cdp('Network.getCookies', {
      urls: [origin],
    });
    const cookie = cookies.find(
      (c) => c.name === 'ariso-identity-experiment.session_token',
    );
    assert.ok(cookie, 'Browser stored the actual response Cookie');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax');
    assert.equal(cookie.secure, false);
    assert.equal(cookie.domain, host);
    const otherOrigin = `http://${host === 'localhost' ? '127.0.0.1' : 'localhost'}:${config.port}`;
    await page.goto(otherOrigin);
    const other = await page.fetch('/api/auth/get-session');
    assert.equal(
      JSON.parse(other.body),
      null,
      'Host-only Cookie must not cross hosts',
    );
    await page.goto(origin);
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body).user.email,
      'owner@example.test',
    );
    const logout = await page.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(logout.status, 200);
    assert.equal(
      JSON.parse((await page.fetch('/api/auth/get-session')).body),
      null,
    );
    report.checks.push({
      origin,
      login: login.status,
      session: session.status,
      serverApiAgrees: true,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      domain: cookie.domain,
      crossHostAnonymous: true,
      logout: logout.status,
    });
  }
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  report.status = 'passed';
  if (!config.keepSpace) await task.finish({ keep: [] });
} finally {
  await writeFile(config.report, `${JSON.stringify(report, null, 2)}\n`);
}
