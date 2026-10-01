/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { readFile, writeFile, mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const output = join(config.output, 'delivery-s3');
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  taskSpaceId: task.spaceId,
  checks: [],
  startedAt: new Date().toISOString(),
};
try {
  await page.goto(`${config.origin}/login`);
  const login = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(login.status, 200, 'Independent delivery owner must log in');
  await page.evaluate(({ privateImageId }) => {
    const image = document.createElement('img');
    image.id = 'delivery-owner-image';
    image.src = `/i/${privateImageId}?type=original`;
    document.body.append(image);
  }, config);
  await page.waitForFunction(
    () => document.querySelector('#delivery-owner-image')?.naturalWidth > 0,
  );
  report.checks.push(
    'Owner session cookie loads the private original through the real signed redirect.',
  );
  // Test anchors are browser fixtures, not new product UI or a design artifact.
  await page.evaluate(({ svgImageId }) => {
    const anchor = document.createElement('a');
    anchor.id = 'delivery-svg-download';
    anchor.href = `/i/${svgImageId}?type=original`;
    anchor.textContent = '下载 SVG 联验样本';
    document.body.append(anchor);
  }, config);
  const waiting = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#delivery-svg-download');
  const download = await waiting;
  assert.equal(download.suggestedFilename(), '旅行.final.svg');
  const filename = join(output, '旅行.final.svg');
  await download.saveAs(filename);
  assert.equal(await download.failure(), null);
  assert.deepEqual(await readFile(filename), await readFile(config.svgPath));
  report.checks.push(
    'SVG redirects to an actual octet-stream attachment; .svg name and every original byte survive browser download.',
  );
  const embed = new URL('/embed', config.embedOrigin);
  embed.searchParams.set('origin', config.origin);
  embed.searchParams.set('public', config.publicImageId);
  embed.searchParams.set('private', config.privateImageId);
  await page.goto(embed.href);
  await page.waitForFunction(() => {
    const publicImage = document.querySelector('#public');
    const privateImage = document.querySelector('#private');
    return publicImage?.naturalWidth > 0 && privateImage?.complete;
  });
  const images = await page.evaluate(() => ({
    publicWidth: document.querySelector('#public').naturalWidth,
    privateWidth: document.querySelector('#private').naturalWidth,
    userAgent: navigator.userAgent,
  }));
  assert.ok(images.publicWidth > 0);
  assert.equal(images.privateWidth, 0);
  report.checks.push(
    'A different-site image embed can display the public original, while the owner cookie is excluded and the private image fails.',
  );
  report.images = images;
  await page.screenshot({ path: join(output, 'external-embed.png') });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, 'browser.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
console.log({ deliveryS3: report.status, checks: report.checks });
// The parent runner owns the single shared TaskSpace and closes it after all suites.
