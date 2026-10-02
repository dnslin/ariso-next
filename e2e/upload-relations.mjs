/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { verifyUploadRelationChoices } = await import(
  new URL('./upload-relation-choices.mjs', config.identitySessionScript).href
);
const { verifyUploadRelationCreation } = await import(
  new URL('./upload-relation-creation.mjs', config.identitySessionScript).href
);
const { verifyUploadRelationSubmissions } = await import(
  new URL('./upload-relation-submissions.mjs', config.identitySessionScript)
    .href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const input = 'input[aria-label="选择图片文件"]';
const report = { status: 'failed', checks: [], layouts: [], steps: [] };
function step(name, details = {}) {
  report.step = { name, ...details };
  report.steps.push({ ...report.step, time: new Date().toISOString() });
  console.log({ relationStep: report.step });
}
async function api(path, method = 'GET', body, expected = 200) {
  const response = await page.fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  assert.equal(response.status, expected, `${path}: ${response.body}`);
  return JSON.parse(response.body);
}
try {
  await page.goto(`${config.origin}/upload`);
  if (await page.evaluate(() => !!document.querySelector('#email'))) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector(input, { state: 'attached' });
  const context = { page, config, sql, report, api, step };
  const choices = await verifyUploadRelationChoices(context);
  const relations = await verifyUploadRelationCreation(context, choices);
  await verifyUploadRelationSubmissions(context, relations);
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.page = await page.snapshot();
  await page.screenshot({ path: join(config.output, 'relations-failure.png') });
  throw error;
} finally {
  await page.evaluate(() => window.__restoreRelationFetch?.());
  await writeFile(
    join(config.output, 'upload-relations.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  status: report.status,
  checks: report.checks,
  layouts: report.layouts.length,
});
