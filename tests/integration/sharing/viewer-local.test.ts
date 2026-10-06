import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { launchLocalDelivery } from '../delivery/local-fixture.ts';
import { verifyViewerRevocations } from './viewer-revocation-fixture.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>>;
beforeAll(async () => {
  app = await launchLocalDelivery();
}, 30000);
afterAll(async () => {
  await app?.close();
});

it('Local anonymous neighbors enforce all revocations while album deletion preserves public image bytes', async () => {
  const asset = await app.seed();
  const original = app.db
    .select()
    .from(mediaVersions)
    .where(
      and(
        eq(mediaVersions.imageId, asset.imageId),
        eq(mediaVersions.kind, 'original'),
      ),
    )
    .get()!;
  const object = app.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, original.objectId))
    .get()!;
  const objectId = randomUUID();
  const key = `${object.key}.thumbnail`;
  // Register the owned key before real bytes enter the maintenance namespace.
  app.db
    .insert(mediaObjects)
    .values({ ...object, id: objectId, key, purpose: 'thumbnail' })
    .run();
  await copyFile(asset.path, `${asset.path}.thumbnail`);
  app.db
    .insert(mediaVersions)
    .values({ ...original, kind: 'thumbnail', objectId })
    .run();
  const evidence = await verifyViewerRevocations(
    app,
    asset,
    app.storage.id,
    'local',
  );
  expect(evidence).toHaveLength(9);
}, 60000);
