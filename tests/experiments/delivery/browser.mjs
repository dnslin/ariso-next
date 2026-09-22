const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
await page.goto(config.origin);
console.log(await page.snapshot());
const downloads = [];
for (const [selector, expected] of [
  ['a[href="/file?id=browser&download=1"]', '旅行.final.png'],
  ['a[href="/file?id=svg"]', '旅行.svg'],
]) {
  const waiting = page.waitForEvent('download', { timeout: 30000 });
  await page.click(selector);
  const download = await waiting;
  assert.equal(download.suggestedFilename(), expected);
  await download.saveAs(`${config.output}/${expected}`);
  assert.equal(await download.failure(), null);
  downloads.push({ filename: expected, completed: true });
}
const protocol = await page.evaluate(async () => {
  const head = await fetch('/file?id=browser', { method: 'HEAD' });
  const conditional = await fetch('/file?id=browser', {
    headers: { 'If-None-Match': '*' },
  });
  return {
    head: { status: head.status, body: await head.text() },
    conditional: { status: conditional.status, body: await conditional.text() },
    userAgent: navigator.userAgent,
  };
});
assert.deepEqual(protocol.head, { status: 200, body: '' });
assert.deepEqual(protocol.conditional, { status: 304, body: '' });
await writeFile(
  `${config.output}/browser.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      spaceId: task.spaceId,
      downloads,
      protocol,
    },
    null,
    2,
  ),
);
console.log({ downloads, protocol });
// The calling task closes its one shared TaskSpace after all checks finish.
