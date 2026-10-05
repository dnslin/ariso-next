import { createShare } from '../src/server/sharing/configuration.ts';
import { createAlbum } from '../src/server/collections/records.ts';
import { albumShares, shareGrants } from '../src/server/sharing/schema.ts';
import { launchLocalDelivery } from '../tests/integration/delivery/local-fixture.ts';

/** Isolated production server/database, no product UI or mutable control routes. */
export async function launchSharingProtocol(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const app = await launchLocalDelivery();
  try {
    signal?.throwIfAborted();
    const ids = ['A', 'B'].map(
      (name) =>
        app.db.transaction((tx) =>
          createAlbum(tx, { name: `协议相册 ${name}` }),
        ).id,
    );
    const shares = await Promise.all(
      ids.map((id) =>
        createShare(app.db, id, {
          password: { action: 'set', value: 'sharing-protocol-password' },
        }),
      ),
    );
    return {
      browserInput: {
        origin: app.origin,
        tokens: shares.map((share) => share.token),
      },
      async verify() {
        const grants = app.db.select().from(shareGrants).all();
        if (
          grants.length !== 4 ||
          new Set(grants.map((grant) => grant.grantSecretHash)).size !== 4
        )
          throw new Error(
            'Production browser grants were not four independent persisted records',
          );
        if (app.db.select().from(albumShares).all().length !== 2)
          throw new Error(
            'Production browser share fixture changed unexpectedly',
          );
      },
      logs: app.logs,
      stop: app.close,
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
