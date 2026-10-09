import { join } from 'node:path';
import { it } from 'vitest';
import { inspectObject } from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { publicUploadFixture } from './api-fixture.ts';
import { verifyUploadCurlExamples } from './usage-examples.ts';

it('executes the published minimal/full/error curl examples against standalone Local storage', async () => {
  const fixture = await publicUploadFixture();
  try {
    const storage = fixture.connection.db.select().from(storageConfigs).get()!;
    await verifyUploadCurlExamples(fixture, storage.id, (key) =>
      inspectObject(
        join(fixture.dataDir, 'storage'),
        {
          id: storage.id,
          enabled: storage.enabled,
          localPath: storage.localPath!,
        },
        key,
      ),
    );
  } finally {
    await fixture.close();
  }
}, 90000);
