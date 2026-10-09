const assert = (await import('node:assert/strict')).default;
const { writeFile, readFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel);
await page.goto(config.origin);
console.log(await page.snapshot());
const results = [];
let svgUrl;
for (const sample of config.samples) {
  const result = await page.evaluate(async (sample) => {
    const bytes = Uint8Array.from(atob(sample.data), (character) =>
      character.charCodeAt(0),
    );
    const body = new FormData();
    // Neither the filename nor the declared MIME can select the decoder.
    body.append(
      'file',
      new Blob([bytes], { type: 'text/html' }),
      'deceptive.html',
    );
    const response = await fetch(
      `/branding/${sample.format === 'ICO' ? 'favicon' : 'logo'}`,
      { method: 'PUT', body },
    );
    const asset = await response.json();
    if (response.status !== 200) return { status: response.status, asset };
    const read = await fetch(asset.url);
    const headers = Object.fromEntries(read.headers);
    document.querySelector('main').replaceChildren();
    const image = new Image();
    image.alt = sample.format;
    image.src = asset.url;
    document.querySelector('main').append(image);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return {
      status: response.status,
      asset,
      headers,
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel: [...context.getImageData(1, 1, 1, 1).data],
      userAgent: navigator.userAgent,
    };
  }, sample);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.asset.format, sample.format);
  assert.equal(result.asset.mime, sample.mime);
  assert.equal(result.headers['content-type'], sample.mime);
  assert.equal(result.width, sample.width);
  assert.equal(result.height, sample.height);
  assert.ok(
    result.pixel[0] > 230 && result.pixel[1] < 20 && result.pixel[2] < 20,
    'Decoded upper-left pixel must be red',
  );
  if (sample.format === 'SVG') {
    svgUrl = result.asset.url;
    assert.match(result.headers['content-disposition'], /^attachment;/);
    assert.equal(
      result.headers['content-security-policy'],
      "sandbox; default-src 'none'",
    );
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    await page.screenshot({ path: `${config.output}/brand-image.png` });
  }
  results.push({ format: sample.format, ...result });
}
const rejections = await page.evaluate(async () => {
  const wrap = (body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${body}</svg>`;
  const inputs = [
    wrap(
      '<script>window.__brandExecuted=true;fetch("/script-canary")</script>',
    ),
    wrap('<rect onload="window.__brandExecuted=true"/>'),
    wrap('<animate attributeName="opacity" values="0;1" dur="1s"/>'),
    wrap('<image href="/external-canary"/>'),
  ];
  const results = [];
  for (const source of inputs) {
    const body = new FormData();
    body.append('file', new Blob([source], { type: 'image/png' }), 'safe.png');
    const response = await fetch('/branding/logo', { method: 'PUT', body });
    results.push({ status: response.status, body: await response.json() });
  }
  return { results, executed: window.__brandExecuted === true };
});
for (const result of rejections.results) {
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'SITE_ASSET_INVALID');
}
assert.equal(rejections.executed, false);
const retained = await page.fetch(svgUrl);
assert.equal(retained.status, 200, 'Rejected replacements retain the old URL');
// A regular link attempts document navigation. Attachment must download while
// retaining the HTML document, rather than become a same-origin SVG document.
await page.evaluate((url) => {
  window.__brandDocument = 'retained';
  const link = document.createElement('a');
  link.href = url;
  link.textContent = 'Open SVG';
  document.querySelector('main').append(link);
}, svgUrl);
const waiting = page.waitForEvent('download', { timeout: 15_000 });
await page.click('a[href="' + svgUrl + '"]');
const download = await waiting;
await download.saveAs(`${config.output}/brand-download.svg`);
assert.equal(await download.failure(), null);
assert.equal(await page.url(), `${config.origin}/`);
assert.equal(await page.evaluate(() => window.__brandDocument), 'retained');
assert.equal(
  (await readFile(`${config.output}/brand-download.svg`)).toString('base64'),
  config.samples.find((sample) => sample.format === 'SVG').data,
);
await writeFile(
  `${config.output}/brand-experiment.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      status: 'passed',
      spaceId: task.spaceId,
      scope: 'Protocol experiment only; no product UI or Figma acceptance',
      results,
      rejections,
      navigation: { downloaded: true, originalDocumentRetained: true },
    },
    null,
    2,
  ) + '\n',
);
console.log({
  brandProtocol: 'passed',
  formats: results.map((result) => result.format),
});
