import { afterAll, beforeAll, expect, it } from 'vitest';
import { launchProtocolDelivery } from '../delivery/s3-fixture.ts';
import { verifyViewerRevocations } from './viewer-revocation-fixture.ts';

let app: Awaited<ReturnType<typeof launchProtocolDelivery>>;
beforeAll(async () => {
  app = await launchProtocolDelivery();
}, 30000);
afterAll(async () => {
  await app?.close();
});

it('S3 protocol anonymous neighbors stop new access but retain already issued signatures within 300 seconds', async () => {
  const evidence = await verifyViewerRevocations(
    app,
    app.publicAsset,
    app.storageId,
    's3',
  );
  expect(evidence).toHaveLength(9);
  expect(
    evidence.filter((row) => row.previousSignedStatus === 200),
  ).toHaveLength(4);
}, 60000);
