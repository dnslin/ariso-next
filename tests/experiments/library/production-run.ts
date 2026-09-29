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
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import {
  parseLibraryQuery,
  encodeLibraryCursor,
} from '../../../src/server/library/query-schema.ts';
import { readLibraryPage } from '../../../src/server/library/queries.ts';
import { createProductionFixture, epoch } from './production-fixture.ts';

const { values } = parseArgs({
  options: {
    report: { type: 'string', default: 'test-results/library/production.json' },
  },
});
const directory = mkdtempSync(
  join(tmpdir(), 'ariso-library-production-scale-'),
);
const path = join(directory, 'library.db');
const require = createRequire(import.meta.url);
const started = performance.now();
const beforeCpu = process.cpuUsage();
const warmRuns = 25;
const scenarios = [
  ...['uploaded_desc', 'uploaded_asc', 'size_desc', 'size_asc'].map((sort) => ({
    name: sort,
    params: `sort=${sort}`,
  })),
  { name: 'deep-offset-2000', params: 'page=2000' },
  { name: 'deep-cursor-2000', params: '', cursorPage: 1999 },
  { name: 'single-album', params: 'albumId=album-0' },
  { name: 'album-fixed-order', params: 'scope=album&albumId=album-0' },
  { name: 'any-tags', params: 'tagId=tag-1&tagId=tag-14&tagId=tag-27' },
  {
    name: 'failed-disabled-storage',
    params: 'status=failed&storageId=storage-3',
  },
  {
    name: 'literal-substring',
    params: new URLSearchParams({ q: '100%_真实' }).toString(),
  },
  {
    name: 'complex-filters',
    params:
      new URLSearchParams({
        albumId: 'album-0',
        storageId: 'storage-3',
        visibility: 'private',
        status: 'ready',
        format: 'avif',
        uploadedFrom: new Date(epoch + 100000).toISOString(),
        uploadedBefore: new Date(epoch + 12000000).toISOString(),
        sort: 'size_desc',
      }).toString() + '&tagId=tag-3&tagId=tag-5&tagId=tag-7',
  },
  { name: 'trash', params: 'scope=trash&pageSize=80' },
];
let connection: ReturnType<typeof createProductionFixture> | undefined;
try {
  connection = createProductionFixture(path, 100000);
  const db = connection.db.$client;
  db.pragma('wal_checkpoint(TRUNCATE)');
  const filesystem = statfsSync(directory);
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
      databaseBytes: statSync(path).size,
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
  const count = (table: string) =>
    db.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
  const distribution = {
    images: count('media_images'),
    albums: count('albums'),
    tags: count('tags'),
    albumRelations: count('album_images'),
    tagRelations: count('image_tags'),
    versions: count('media_versions'),
    objects: count('media_objects'),
    jobs: count('media_jobs'),
    state: db
      .prepare(
        'SELECT processing_status, trashed_at IS NOT NULL AS trashed, count(*) AS count FROM media_images GROUP BY processing_status, trashed_at IS NOT NULL',
      )
      .all(),
    versionKinds: db
      .prepare(
        'SELECT kind,count(*) AS count FROM media_versions GROUP BY kind',
      )
      .all(),
    jobStates: db
      .prepare(
        'SELECT status,count(*) AS count FROM media_jobs GROUP BY status',
      )
      .all(),
    topAlbums: db
      .prepare(
        'SELECT album_id,count(*) AS count FROM album_images GROUP BY album_id ORDER BY count DESC LIMIT 8',
      )
      .all(),
    topTags: db
      .prepare(
        'SELECT tag_id,count(*) AS count FROM image_tags GROUP BY tag_id ORDER BY count DESC LIMIT 8',
      )
      .all(),
    ties: {
      uploadRowsPerTimestamp: 8,
      sizeBuckets: 2000,
      bytesRange: [1024, 2048000],
    },
    generator:
      'productionImage(i), i=0..99999; 0–3 albums and 0–5 tags per image, hot album and tags; one original per image, ready images have thumbnail; each image has initial job, every seventh ready image has failed reprocessing job. Synthetic, not measured user density.',
  };
  const windows = new Map<string, string[]>();
  const measurements = [];
  for (const scenario of scenarios) {
    const params = new URLSearchParams(scenario.params);
    if ('cursorPage' in scenario) {
      const prior = readLibraryPage(
        connection.db,
        parseLibraryQuery(new URLSearchParams(`page=${scenario.cursorPage}`)),
      );
      const last = prior.items.at(-1);
      assert(last && prior.hasMore, 'Deep page must have a next window');
      params.set(
        'cursor',
        encodeLibraryCursor(
          parseLibraryQuery(params).filters,
          Date.parse(last.createdAt),
          last.id,
        ),
      );
    }
    const query = parseLibraryQuery(params);
    const reader = openRuntimeDatabase(path);
    try {
      // Capture only the first invocation; timed warm requests have no logger cost.
      const captured: { sql: string; parameters: unknown[] }[] = [];
      const instrumented = drizzle(reader.db.$client, {
        logger: {
          logQuery(sql, parameters) {
            captured.push({ sql, parameters });
          },
        },
      });
      const firstStart = performance.now();
      const first = readLibraryPage(instrumented, query);
      const firstNewConnectionMs = performance.now() - firstStart;
      assert(
        first.total > 0,
        `${scenario.name}: fixture must exercise nonempty results`,
      );
      assert.equal(
        new Set(first.items.map((item) => item.id)).size,
        first.items.length,
      );
      assert(
        first.items.every((item) => item.versions.original),
        'Production projection must include saved original versions',
      );
      windows.set(
        scenario.name,
        first.items.map((item) => item.id),
      );
      const timings: number[] = [];
      for (let i = 0; i < warmRuns; i++) {
        const sampleStart = performance.now();
        const result = readLibraryPage(reader.db, query);
        timings.push(performance.now() - sampleStart);
        assert.deepEqual(result, first);
      }
      const statements = captured
        .filter(({ sql }) => /^select\b/i.test(sql))
        .map(({ sql, parameters }) => ({
          sql,
          parameters,
          plan: reader.db.$client
            .prepare(`EXPLAIN QUERY PLAN ${sql}`)
            .all(...parameters),
        }));
      assert(
        statements.length >= 4,
        'Measured request must include total, page, versions and job summaries',
      );
      const warmP95Ms = [...timings].sort((a, b) => a - b)[
        Math.ceil(warmRuns * 0.95) - 1
      ];
      measurements.push({
        name: scenario.name,
        params: params.toString(),
        total: first.total,
        returned: first.items.length,
        firstId: first.items[0]?.id,
        lastId: first.items.at(-1)?.id,
        firstNewConnectionMs,
        warmP95Ms,
        warmSamplesMs: timings,
        targets: { warmP95Ms: 500, firstNewConnectionMs: 2000 },
        observedWithinTargets: warmP95Ms <= 500 && firstNewConnectionMs <= 2000,
        statements,
      });
      console.log(
        `${scenario.name}: first=${firstNewConnectionMs.toFixed(2)}ms warm-p95=${warmP95Ms.toFixed(2)}ms total=${first.total}`,
      );
    } finally {
      reader.close();
    }
  }
  assert.deepEqual(
    windows.get('deep-cursor-2000'),
    windows.get('deep-offset-2000'),
  );
  const report = {
    experiment: 'T-LIB-03 production SQLite query measurement',
    recordedAt: new Date().toISOString(),
    environment,
    distribution,
    schemaBoundary:
      'Only committed runtime migrations and production tables/indexes; queries call the actual readLibraryPage implementation.',
    measurementMethod: {
      rows: 100000,
      warmRuns,
      includes:
        'Production short read transaction, reference checks, count, page, saved versions and job summaries; cursor preparation excluded from timed samples.',
      firstRead:
        'First query on a fresh SQLite connection; SQLite page cache is new, OS cache is already warm from fixture generation/earlier scenarios. NOT an OS cold-cache benchmark. First query includes SQL logger capture overhead.',
      p95: 'Nearest rank ceil(25 × .95), milliseconds',
      limitations: [
        'Synthetic metadata/relationship density, no media bytes or S3',
        'Single-process sequential reads, no concurrent writes or OS cache eviction',
        'No HTTP/network/browser latency; local measurements do not establish container/deployment latency',
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
      deepCursorMatchesOffset: true,
      duplicateIdsAbsentInMeasuredWindows: true,
      savedVersionProjectionPresent: true,
    },
  };
  mkdirSync(dirname(values.report), { recursive: true });
  writeFileSync(values.report, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      report: values.report,
      measurements: measurements.length,
      allObservedWithinTargets: measurements.every(
        (entry) => entry.observedWithinTargets,
      ),
    }),
  );
} finally {
  connection?.close();
  rmSync(directory, { recursive: true, force: true });
}
