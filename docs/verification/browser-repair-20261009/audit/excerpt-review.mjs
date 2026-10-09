import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const directory = 'docs/verification/browser-repair-20261009/browser/reports';
const allowed = new Set([
  'layouts',
  'pages',
  'collapsed',
  'screenshots',
  'toastTargetLayouts',
]);
const summaryFields = {
  viewportWidths: 'width',
  viewportHeights: 'height',
  themes: 'theme',
  paths: 'path',
  states: 'name',
};
const results = [];
for (const file of (await readdir(directory)).sort()) {
  if (!file.endsWith('.excerpt.json')) continue;
  const excerpt = JSON.parse(await readFile(`${directory}/${file}`, 'utf8'));
  const { evidenceExcerpt, ...retained } = excerpt;
  const raw = JSON.parse(await readFile(evidenceExcerpt.rawReportPath, 'utf8'));
  const expected = { ...raw };
  const omissions = [];
  for (const [field, summary] of Object.entries(
    evidenceExcerpt.omittedObservations,
  )) {
    assert.ok(allowed.has(field), `${file}: permitted omission ${field}`);
    assert.ok(Array.isArray(raw[field]), `${file}: raw ${field} is an array`);
    assert.ok(!(field in retained), `${file}: ${field} omitted explicitly`);
    const expectedSummary = { count: raw[field].length };
    for (const [label, property] of Object.entries(summaryFields)) {
      const values = [
        ...new Set(
          raw[field]
            .map((row) => row?.[property])
            .filter((value) => value !== undefined),
        ),
      ];
      if (values.length) expectedSummary[label] = values;
    }
    assert.deepEqual(
      summary,
      expectedSummary,
      `${file}: ${field} exact summary`,
    );
    delete expected[field];
    omissions.push({ field, count: summary.count });
  }
  assert.deepEqual(retained, expected, `${file}: every retained raw field`);
  results.push({
    file,
    rawReportPath: evidenceExcerpt.rawReportPath,
    status: raw.status,
    checks: raw.checks?.length,
    omissions,
  });
}
assert.equal(results.length, 15, 'Expected 15 explicitly named excerpts');
console.log(
  JSON.stringify(
    { status: 'passed', excerpts: results.length, results },
    null,
    2,
  ),
);
