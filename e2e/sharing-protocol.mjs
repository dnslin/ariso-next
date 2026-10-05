/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel);
const additional = await task.newPage();
const checks = [];
const report = {
  taskSpaceId: task.spaceId,
  status: 'failed',
  scope: 'production sharing Cookie protocol',
  checks,
};
try {
  await page.goto(`${config.origin}/api/health`);
  await additional.goto(`${config.origin}/api/health`);
  const unlock = (target, token) =>
    target.fetch(`/s/${token}/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'sharing-protocol-password' }),
    });
  const results = await Promise.all(
    config.tokens.map((token) => unlock(page, token)),
  );
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  const cookies = (
    await page.cdp('Network.getCookies', {
      urls: config.tokens.map((t) => `${config.origin}/s/${t}/unlock`),
    })
  ).cookies.filter((c) => c.name === 'ariso_share_grant');
  assert.equal(cookies.length, 2);
  assert.equal(new Set(cookies.map((c) => c.value)).size, 2);
  for (const [index, token] of config.tokens.entries()) {
    const scoped = (
      await page.cdp('Network.getCookies', {
        urls: [`${config.origin}/s/${token}/unlock`],
      })
    ).cookies.filter((c) => c.name === 'ariso_share_grant');
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].path, `/s/${token}`);
    assert.equal(scoped[0].httpOnly, true);
    assert.equal(scoped[0].sameSite, 'Lax');
    assert.equal(scoped[0].secure, false);
    assert.ok(scoped[0].expires - Date.now() / 1000 > 86300);
    assert.ok(scoped[0].expires - Date.now() / 1000 <= 86401);
    checks.push(
      `album-${index + 1}: isolated path, HttpOnly, Lax, persistent 24 hours`,
    );
  }
  const rootCookies = (
    await page.cdp('Network.getCookies', {
      urls: [`${config.origin}/api/shares`],
    })
  ).cookies;
  assert.equal(
    rootCookies.some((c) => c.name === 'ariso_share_grant'),
    false,
  );
  assert.equal((await page.fetch('/api/shares')).status, 401);
  checks.push('share grant grants no owner management access');
  const tabs = await Promise.all([
    unlock(page, config.tokens[0]),
    unlock(additional, config.tokens[0]),
  ]);
  assert.deepEqual(
    tabs.map((r) => r.status),
    [200, 200],
  );
  checks.push('same album in two tabs verifies twice successfully');
  const after = (
    await page.cdp('Network.getCookies', {
      urls: config.tokens.map((t) => `${config.origin}/s/${t}/unlock`),
    })
  ).cookies.filter((c) => c.name === 'ariso_share_grant');
  assert.equal(after.length, 2);
  assert.equal(
    after.find((c) => c.path.endsWith(config.tokens[1]))?.value,
    cookies.find((c) => c.path.endsWith(config.tokens[1]))?.value,
  );
  checks.push('album A verification preserves album B grant');
  report.status = 'passed';
} catch (error) {
  let message = String(error.stack ?? error);
  for (const token of config.tokens)
    message = message.replaceAll(token, '[Redacted]');
  report.error = message;
  throw new Error(message);
} finally {
  await writeFile(
    join(config.output, 'sharing-protocol.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (report.status === 'passed') await additional.close();
}
console.log(JSON.stringify(report));
