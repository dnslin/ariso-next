import { expect, it } from 'vitest';
import { runCollectionsExperiment } from '../../experiments/collections/suite.ts';

it('EV-COLLECTIONS-01: real SQLite preserves names and relationships across duplicate creation and competing renames', async () => {
  const report = await runCollectionsExperiment();
  expect(report.passed).toBe(true);
  expect(report.environment.journalMode).toBe('wal');
  for (const outcomes of Object.values(report.concurrency)) {
    expect(new Set(outcomes.map((outcome) => outcome.pid)).size).toBe(
      outcomes.length,
    );
    expect(
      outcomes.every((outcome) => outcome.lockProbe === 'SQLITE_BUSY'),
    ).toBe(true);
  }
}, 30_000);
