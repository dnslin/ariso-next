const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
await page.goto(config.externalOrigin);
console.log(await page.snapshot());
await page.waitForFunction(() => document.querySelector('img').complete);
const embedded = await page.evaluate(() => ({
  width: document.querySelector('img').naturalWidth,
  userAgent: navigator.userAgent,
}));
assert.ok(embedded.width > 0, 'Cross-origin public image must render');
const downloads = [];
for (const [selector, filename] of [
  ['#png', '旅行.final.png'],
  ['#svg', '旅行.svg'],
]) {
  const waiting = page.waitForEvent('download', { timeout: 30000 });
  await page.click(selector);
  const download = await waiting;
  assert.equal(download.suggestedFilename(), filename);
  await download.saveAs(`${config.output}/${filename}`);
  assert.equal(await download.failure(), null);
  downloads.push(filename);
}
await page.goto(config.origin);
const login = await page.evaluate(async ({ email, password }) => {
  const response = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.status;
}, config.credentials);
assert.equal(login, 200);
await writeFile(
  `${config.output}/browser.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      spaceId: task.spaceId,
      embedded,
      downloads,
      login,
    },
    null,
    2,
  ),
);
console.log({ embedded, downloads, login });
