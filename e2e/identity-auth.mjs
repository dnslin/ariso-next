/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const report = {
  phase: config.phase,
  taskSpaceId: task.spaceId,
  status: 'failed',
};
const post = (path, body = {}) =>
  page.fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
async function session() {
  const response = await page.fetch('/api/auth/get-session');
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  return JSON.parse(response.body);
}
try {
  if (config.phase === 'second-session') {
    // The persisted origin changed while the existing production process stayed up.
    const rejected = await post('sign-in/email', config.credentials);
    assert.equal(rejected.status, 403);
    report.oldOriginRejected = true;
  }
  await page.goto(config.origin);
  if (config.phase === 'logout-first') {
    assert.equal((await session()).user.email, config.credentials.email);
    assert.equal((await post('sign-out')).status, 200);
    assert.equal(await session(), null);
    await page.goto(config.otherOrigin);
    const remaining = await session();
    assert.equal(remaining.user.email, config.credentials.email);
    assert.equal(remaining.session.id, config.secondSessionId);
    report.onlyCurrentSessionRevoked = true;
  } else {
    assert.equal(
      await session(),
      null,
      'Each host must start without a session',
    );
    const response = await post('sign-in/email', config.credentials);
    assert.equal(response.status, 200, response.body);
    const current = await session();
    assert.equal(current.user.email, config.credentials.email);
    report.sessionId = current.session.id;
    report.httpOnly = await page.evaluate(
      () => !document.cookie.includes('ariso.session_token'),
    );
    assert.equal(report.httpOnly, true);
  }
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(config.report, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(report);
