const assert = (await import('node:assert/strict')).default;
const { readFile, writeFile } = await import('node:fs/promises');
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel);
await page.goto(config.origin);
const setup = await page.fetch('/api/setup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    code: config.setupCode,
    ...config.credentials,
    publicUrl: config.origin,
    timeZone: 'Asia/Shanghai',
  }),
});
assert.equal(setup.status, 200, 'Real setup must succeed');
await page.goto(`${config.origin}/login`);
await page.waitForSelector('#email');
await page.fill('#email', config.credentials.email);
await page.fill('#password', config.credentials.password);
await page.click('loc=role:button[name="登录"]');
await page.waitForURL(`${config.origin}/upload`);
const readSettings = async () => {
  const response = await page.fetch('/api/settings/site');
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
};
const baseline = await readSettings();
assert.equal(baseline.logoUrl, null);
assert.equal(baseline.faviconUrl, null);
const results = [];
const metadata = [];
let svgUrl;
for (const sample of config.samples) {
  const result = await page.evaluate(async (sample) => {
    const bytes = Uint8Array.from(atob(sample.data), (character) =>
      character.charCodeAt(0),
    );
    const body = new FormData();
    body.append(
      'file',
      new Blob([bytes], { type: 'text/html' }),
      'deceptive.html',
    );
    const response = await fetch(`/api/settings/site/branding/${sample.kind}`, {
      method: 'PUT',
      body,
    });
    const asset = await response.json();
    if (response.status !== 200) return { status: response.status, asset };
    const read = await fetch(asset.url);
    document.querySelector('#branding-protocol-check')?.remove();
    const section = document.createElement('section');
    section.id = 'branding-protocol-check';
    section.setAttribute('aria-label', 'Branding protocol check');
    const image = new Image();
    image.alt = `${sample.kind} ${sample.format}`;
    image.src = asset.url;
    section.append(image);
    document.body.prepend(section);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return {
      status: response.status,
      asset,
      headers: Object.fromEntries(read.headers),
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel: [...context.getImageData(1, 1, 1, 1).data],
      userAgent: navigator.userAgent,
    };
  }, sample);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(Object.keys(result.asset).sort(), ['mime', 'url']);
  assert.equal(result.asset.mime, sample.mime);
  assert.equal(result.headers['content-type'], sample.mime);
  assert.equal(result.width, sample.width);
  assert.equal(result.height, sample.height);
  assert.ok(
    result.pixel[0] > 230 && result.pixel[1] < 20 && result.pixel[2] < 20,
    'Decoded upper-left pixel must be red',
  );
  const settings = await readSettings();
  assert.equal(settings[`${sample.kind}Url`], result.asset.url);
  if (sample.kind === 'logo' && sample.format === 'SVG') {
    svgUrl = result.asset.url;
    assert.match(result.headers['content-disposition'], /^attachment;/);
    assert.equal(
      result.headers['content-security-policy'],
      "sandbox; default-src 'none'",
    );
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    await page.screenshot({ path: `${config.output}/branding-image.png` });
  }
  if (sample.kind === 'favicon') {
    for (const path of ['/', '/upload']) {
      await page.goto(`${config.origin}${path}`);
      await page.waitForFunction(
        ({ url, mime }) =>
          [...document.querySelectorAll('link[rel="icon"]')].some(
            (link) => link.getAttribute('href') === url && link.type === mime,
          ),
        result.asset,
      );
      metadata.push({
        format: sample.format,
        path,
        url: result.asset.url,
        mime: result.asset.mime,
      });
    }
  }
  results.push({ kind: sample.kind, format: sample.format, ...result });
}
const beforeRejections = await readSettings();
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
    const response = await fetch('/api/settings/site/branding/logo', {
      method: 'PUT',
      body,
    });
    results.push({ status: response.status, body: await response.json() });
  }
  return { results, executed: window.__brandExecuted === true };
});
for (const rejection of rejections.results) {
  assert.equal(rejection.status, 400);
  assert.equal(rejection.body.code, 'SITE_ASSET_INVALID');
}
assert.equal(rejections.executed, false);
const afterRejections = await readSettings();
assert.equal(afterRejections.logoUrl, beforeRejections.logoUrl);
assert.equal(afterRejections.faviconUrl, beforeRejections.faviconUrl);
assert.equal(
  (await page.fetch(svgUrl)).status,
  200,
  'Rejected replacements retain the old URL',
);
await page.goto(`${config.origin}/`);
await page.evaluate((url) => {
  window.__brandDocument = 'retained';
  const link = document.createElement('a');
  link.id = 'branding-download-check';
  link.href = url;
  link.textContent = 'Download test SVG';
  document.body.prepend(link);
}, svgUrl);
const waiting = page.waitForEvent('download', { timeout: 15000 });
await page.click('#branding-download-check');
const download = await waiting;
await download.saveAs(`${config.output}/branding-download.svg`);
assert.equal(await download.failure(), null);
assert.equal(await page.url(), `${config.origin}/`);
assert.equal(await page.evaluate(() => window.__brandDocument), 'retained');
assert.equal(
  (await readFile(`${config.output}/branding-download.svg`)).toString('base64'),
  config.samples.find(
    (sample) => sample.kind === 'logo' && sample.format === 'SVG',
  ).data,
);
const removals = [];
for (const kind of ['logo', 'favicon']) {
  const url = afterRejections[`${kind}Url`];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await page.fetch(`/api/settings/site/branding/${kind}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { url: null, mime: null });
  }
  assert.equal((await page.fetch(url)).status, 404);
  removals.push({ kind, idempotent: true, oldUrlStatus: 404 });
}
const restored = await readSettings();
for (const key of [
  'logoKey',
  'logoMime',
  'faviconKey',
  'faviconMime',
  'logoUrl',
  'faviconUrl',
])
  assert.equal(restored[key], null);
for (const key of ['name', 'description', 'publicUrl', 'timeZone'])
  assert.equal(restored[key], baseline[key]);
await page.goto(`${config.origin}/`);
assert.equal(
  await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="icon"]')].some((link) =>
      new URL(link.href).pathname.startsWith('/branding/'),
    ),
  ),
  false,
);
await writeFile(
  `${config.output}/branding.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      status: 'passed',
      spaceId: task.spaceId,
      scope:
        'Production HTTP, browser image decoding, runtime favicon metadata and SVG download only; no product UI or Figma acceptance',
      results,
      metadata,
      rejections,
      navigation: { downloaded: true, originalDocumentRetained: true },
      removals,
      restored: true,
    },
    null,
    2,
  ) + '\n',
);
console.log({
  brandingProtocol: 'passed',
  formats: [...new Set(results.map((result) => result.format))],
  runtimeMetadata: 'passed',
  restore: 'passed',
});
