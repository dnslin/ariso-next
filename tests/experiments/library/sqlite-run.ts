import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import {
  arch,
  cpus,
  freemem,
  platform,
  release,
  tmpdir,
  totalmem,
} from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import {
  candidateIndexes,
  createSqliteFixture,
  epoch,
  installCandidateIndexes,
} from './sqlite-fixture.ts';
import { compileQuery, executeQuery, type Query } from './sqlite-query.ts';

const { values } = parseArgs({
  options: {
    report: { type: 'string', default: 'test-results/library/sqlite.json' },
  },
});
const directory = mkdtempSync(join(tmpdir(), 'ariso-library-scale-'));
const path = join(directory, 'library.db');
const require = createRequire(import.meta.url);
const started = performance.now();
const beforeCpu = process.cpuUsage();
const warmRuns = 25;
const scenarios: {
  name: string;
  query: Query;
  page?: number;
  cursorPage?: number;
}[] = [
  ...(['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'] as const).map(
    (sort) => ({ name: sort, query: { sort } }),
  ),
  { name: 'deep-offset-2000', query: {}, page: 2000 },
  { name: 'deep-cursor-2000', query: {}, cursorPage: 1999 },
  { name: 'single-album', query: { albumId: 'album-0' } },
  { name: 'album-fixed-order', query: { scope: 'album', albumId: 'album-0' } },
  { name: 'any-tags', query: { tagIds: ['tag-1', 'tag-14', 'tag-27'] } },
  {
    name: 'failed-disabled-storage',
    query: { status: 'failed', storageId: 'storage-3' },
  },
  { name: 'literal-substring', query: { q: '100%_真实' } },
  {
    name: 'complex-filters',
    query: {
      albumId: 'album-0',
      tagIds: ['tag-3', 'tag-5', 'tag-7'],
      storageId: 'storage-3',
      visibility: 'private',
      status: 'ready',
      format: 'avif',
      uploadedFrom: epoch + 100000,
      uploadedBefore: epoch + 12000000,
      sort: 'size_desc',
    },
  },
  { name: 'trash', query: { scope: 'trash' } },
];
const connection = createSqliteFixture(path, 100_000);
try {
  const db = connection.db.$client;
  const filesystem = statfsSync(directory);
  const distribution = {
    images: db.prepare('SELECT count(*) AS count FROM media_images').get(),
    states: db
      .prepare(
        'SELECT processing_status, count(*) AS count FROM media_images GROUP BY processing_status',
      )
      .all(),
    storage: db
      .prepare(
        'SELECT storage_id, visibility, count(*) AS count FROM media_images GROUP BY storage_id, visibility',
      )
      .all(),
    trash: db
      .prepare(
        'SELECT trashed_at IS NOT NULL AS trashed, count(*) AS count FROM media_images GROUP BY trashed',
      )
      .all(),
    albumMemberships: db
      .prepare('SELECT count(*) AS count FROM experiment_image_albums')
      .get(),
    tagMemberships: db
      .prepare('SELECT count(*) AS count FROM experiment_image_tags')
      .get(),
    topAlbums: db
      .prepare(
        'SELECT album_id, count(*) AS count FROM experiment_image_albums GROUP BY album_id ORDER BY count DESC LIMIT 8',
      )
      .all(),
    topTags: db
      .prepare(
        'SELECT tag_id, count(*) AS count FROM experiment_image_tags GROUP BY tag_id ORDER BY count DESC LIMIT 8',
      )
      .all(),
    ties: {
      uploadRowsPerTimestamp: 8,
      sizeBuckets: 2000,
      bytesRange: [1024, 2048000],
    },
    generator:
      'fixtureImage(i), i=0..99999; 0–3 albums and 0–5 tags per image; hot album and tags; deterministic synthetic data, not measured user density',
  };
  const environment = {
    node: process.version,
    configuredPackageManager: require('../../../package.json').packageManager,
    betterSqlite3: require('better-sqlite3/package.json').version,
    sqlite: db.prepare('SELECT sqlite_version()').pluck().get(),
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: { model: cpus()[0]?.model, logicalCores: cpus().length },
    memory: { totalBytes: totalmem(), freeBytesAtStart: freemem() },
    disk: {
      temporaryDatabasePath: path,
      filesystemType: filesystem.type,
      capacityBytes: filesystem.blocks * filesystem.bsize,
      availableBytes: filesystem.bavail * filesystem.bsize,
      medium:
        'Not detected; filesystem capacity is not a disk throughput measurement',
    },
    sqlitePragmas: Object.fromEntries(
      [
        'journal_mode',
        'page_size',
        'cache_size',
        'mmap_size',
        'synchronous',
      ].map((name) => [name, db.pragma(name, { simple: true })]),
    ),
  };
  const expected = new Map<string, ReturnType<typeof executeQuery>>();
  const measurements = [];
  for (const mode of [
    'existing-media-indexes',
    'candidate-media-indexes',
  ] as const) {
    if (mode === 'candidate-media-indexes') installCandidateIndexes(db);
    db.pragma('wal_checkpoint(TRUNCATE)');
    const databaseBytes = statSync(path).size;
    for (const scenario of scenarios) {
      const options = scenario.cursorPage
        ? {
            cursor: executeQuery(db, scenario.query, {
              page: scenario.cursorPage,
            }).nextCursor!,
          }
        : { page: scenario.page };
      const readConnection = openRuntimeDatabase(path);
      try {
        const readDb = readConnection.db.$client;
        const start = performance.now();
        const first = executeQuery(readDb, scenario.query, options);
        const firstNewConnectionMs = performance.now() - start;
        if (mode === 'existing-media-indexes')
          expected.set(scenario.name, first);
        else
          assert.deepEqual(
            first,
            expected.get(scenario.name),
            `${scenario.name}: candidate indexes changed results`,
          );
        assert.equal(
          new Set(first.items.map((item) => item.id)).size,
          first.items.length,
        );
        assert(
          first.total > 0,
          `${scenario.name}: fixture must exercise a nonempty result`,
        );
        const timings = [];
        for (let i = 0; i < warmRuns; i++) {
          const sampleStart = performance.now();
          const result = executeQuery(readDb, scenario.query, options);
          timings.push(performance.now() - sampleStart);
          assert.deepEqual(result, first);
        }
        const compiled = compileQuery(scenario.query, options);
        const plan = (sql: string, parameters: (number | string)[]) =>
          readDb.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters);
        const ordered = [...timings].sort((a, b) => a - b);
        const warmP95Ms = ordered[Math.ceil(warmRuns * 0.95) - 1];
        measurements.push({
          mode,
          name: scenario.name,
          query: scenario.query,
          options,
          total: first.total,
          returned: first.items.length,
          firstId: first.items[0]?.id,
          lastId: first.items.at(-1)?.id,
          firstNewConnectionMs,
          warmP95Ms,
          warmSamplesMs: timings,
          targets: { warmP95Ms: 500, firstNewConnectionMs: 2000 },
          observedWithinTargets:
            warmP95Ms <= 500 && firstNewConnectionMs <= 2000,
          databaseBytes,
          sql: compiled.sql,
          parameters: compiled.parameters,
          countSql: compiled.countSql,
          countParameters: compiled.countParameters,
          listPlan: plan(compiled.sql, compiled.parameters),
          countPlan: plan(compiled.countSql, compiled.countParameters),
        });
        console.log(
          `${mode} ${scenario.name}: first=${firstNewConnectionMs.toFixed(2)}ms warm-p95=${warmP95Ms.toFixed(2)}ms total=${first.total}`,
        );
      } finally {
        readConnection.close();
      }
    }
  }
  const deepOffset = expected.get('deep-offset-2000')!;
  const deepCursor = expected.get('deep-cursor-2000')!;
  assert.deepEqual(
    deepCursor,
    deepOffset,
    'Deep cursor and offset must return the same window',
  );
  const report = {
    experiment: 'EV-LIBRARY-01 SQLite scale starting test',
    recordedAt: new Date().toISOString(),
    environment,
    distribution,
    schemaBoundary:
      'Actual runtime migrations for media/storage. Candidate collections relation tables and candidate media indexes exist only in this disposable database. No production library API or migration.',
    candidateIndexes,
    measurementMethod: {
      rows: 100000,
      warmRuns,
      includes:
        'Prepare statements, items, total count, and short read transaction per request; cursor preparation is outside timed samples',
      firstRead:
        'First query on a fresh SQLite connection; SQLite page cache is new, but fixture generation and previous scenarios warm the OS filesystem cache. NOT an OS cold-cache benchmark.',
      p95: 'Nearest rank ceil(25 × .95), warm samples in milliseconds',
      targetMeaning:
        'Engineering targets are comparisons, not predetermined pass results. Local and CI host results do not establish container or deployment latency.',
      limitations: [
        'Synthetic metadata and relationship distribution; no media bytes or S3',
        'Projection covers sort/filter metadata and storage state; no production version/job summary aggregation',
        'Sequential single-process reads; no concurrent writes or OS cache eviction',
        'No HTTP/network/browser latency in these measurements',
      ],
    },
    measurements,
    resources: {
      wallMs: performance.now() - started,
      cpuMicroseconds: process.cpuUsage(beforeCpu),
      processMemoryBytes: process.memoryUsage(),
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
    },
    correctness: {
      baselineAndCandidateResultsIdentical: true,
      deepCursorMatchesOffset: true,
      duplicateIdsAbsentInMeasuredWindows: true,
    },
  };
  mkdirSync(dirname(values.report), { recursive: true });
  writeFileSync(values.report, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      report: values.report,
      arch: environment.arch,
      measurements: measurements.length,
      allObservedWithinTargets: measurements.every(
        (entry) => entry.observedWithinTargets,
      ),
    }),
  );
} finally {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
}
