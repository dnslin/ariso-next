import { collectionFixture } from '../../integration/collections/helpers.ts';
import {
  readUsage,
  readOverview,
} from '../../../src/server/analytics/usage.ts';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
const f = collectionFixture();
try {
  const c = f.db.$client;
  const image = c.prepare(
    `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,byte_size,processing_status,trashed_at,created_at,updated_at) VALUES (?,?,?,?,'private','PNG','image/png',100,'ready',?,1000,1000)`,
  );
  const object = c.prepare(
    `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,byte_size_confirmed_at,created_at,updated_at) VALUES (?,?,?,?,'original','stored',100,1000,1000,1000)`,
  );
  const version = c.prepare(
    `INSERT INTO media_versions (image_id,kind,object_id,byte_size,format,mime,created_at) VALUES (?,'original',?,100,'PNG','image/png',1000)`,
  );
  c.transaction(() => {
    for (let i = 0; i < 100000; i++) {
      const id = `scale-${i}`;
      image.run(id, f.storage.id, id, id, i % 10 === 0 ? 1000 : null);
      object.run(id, id, f.storage.id, id);
      version.run(id, id);
    }
  })();
  const samples: Record<string, number[]> = { usage: [], overview: [] };
  for (const [label, query] of Object.entries({
    usage: readUsage,
    overview: readOverview,
  })) {
    for (let i = 0; i < 11; i++) {
      const start = performance.now();
      const result = query(f.db);
      const duration = performance.now() - start;
      samples[label].push(duration);
      if (
        label === 'usage' &&
        (result as ReturnType<typeof readUsage>).storages[0].knownBytes !==
          10000000
      )
        throw Error('incorrect usage');
    }
  }
  const report = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0].model,
    memory: os.totalmem(),
    images: 100000,
    objects: 100000,
    distribution:
      '90k normal private ready,10k recycled; originals only; no access rows (report queries belong to #169)',
    cache:
      'first query after seed is not a cold filesystem benchmark; subsequent 10 queries warm',
    samples,
    summary: Object.fromEntries(
      Object.entries(samples).map(([k, v]) => [
        k,
        { firstMs: v[0], warmP95Ms: v.slice(1).sort((a, b) => a - b)[9] },
      ]),
    ),
    rss: process.memoryUsage().rss,
  };
  writeFileSync(
    'test-results/analytics-168/scale.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report.summary));
} finally {
  f.close();
}
