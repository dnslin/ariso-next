import assert from 'node:assert/strict';
import {
  imageSample,
  trendSample,
  rankingCounts,
} from './app/analytics/sample.ts';
const full = trendSample(90);
for (const [index, days] of [7, 30, 90].entries()) {
  const rows = trendSample(days);
  assert.deepEqual(rows, full.slice(-days));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const top = rankingCounts.reduce(
    (sum, _, i) => sum + imageSample(i).periods[index],
    0,
  );
  assert.ok(total >= top && total <= 24816);
  console.log({ days, total, top });
}
