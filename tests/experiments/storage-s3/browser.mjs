const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
await page.goto(config.origin);
console.log(await page.snapshot());
await page.cdp('Network.enable');
await page.events();
const put = await page.evaluate(
  async ({ signed, svg }) => {
    const response = await fetch(signed.put, {
      method: 'PUT',
      body: new Blob([svg], { type: 'image/svg+xml' }),
      headers: signed.headers,
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    return {
      status: response.status,
      type: response.type,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
      userAgent: navigator.userAgent,
    };
  },
  { signed: config.signed, svg: config.svg },
);
assert.ok(put.status >= 200 && put.status < 300);
assert.equal(put.type, 'cors', 'Must read the actual cross-origin response');
const events = await page.events();
// Save only the actual PUT request headers. Query credentials/signatures stay local to this process.
const requests = events.filter(
  (event) =>
    event.method === 'Network.requestWillBeSent' &&
    event.params?.request?.method === 'PUT',
);
assert.ok(requests.length, 'Browser network trace must contain the real PUT');
const headers = requests.map((event) => {
  const extra = events.find(
    (candidate) =>
      candidate.method === 'Network.requestWillBeSentExtraInfo' &&
      candidate.params.requestId === event.params.requestId,
  );
  assert.ok(extra, 'Require actual wire headers including Origin');
  const result = Object.fromEntries(
    Object.entries(extra.params.headers).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
  assert.equal(result.origin, config.origin);
  assert.equal(result.authorization, undefined);
  assert.equal(result.cookie, undefined);
  return result;
});
assert.ok(
  headers.some((value) =>
    Object.entries(value).some(
      ([key, value]) =>
        key.toLowerCase() === 'content-type' && value === 'image/svg+xml',
    ),
  ),
);
const waiting = page.waitForEvent('download', { timeout: 30_000 });
await page.click('a[href="/download"]');
const download = await waiting;
assert.equal(download.suggestedFilename(), '旅行.svg');
await download.saveAs(`${config.output}/旅行.svg`);
assert.equal(await download.failure(), null);
await writeFile(
  `${config.output}/browser.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      origin: config.origin,
      put,
      actualPutHeaders: headers,
      download: { filename: '旅行.svg', completed: true },
    },
    null,
    2,
  ) + '\n',
);
console.log({ putStatus: put.status, filename: '旅行.svg' });
// The caller owns the single task space and finishes it after all services.
