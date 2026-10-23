import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createBrandingService } from '../../../src/server/site/branding.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

it('waits for asynchronous startup branding cleanup and leaves published asset reads available', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'ariso-branding-idle-'));
  const root = join(directory, 'branding');
  await fs.mkdir(root);
  const connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'http://localhost',
      timeZone: 'UTC',
    }),
  );
  const current = `site-logo-${randomUUID()}.png`;
  const stale = join(root, `site-logo-${randomUUID()}.png`);
  await fs.writeFile(join(root, current), 'published bytes');
  await fs.writeFile(stale, 'stale bytes');
  connection.db
    .update(siteSettings)
    .set({ logoKey: current, logoMime: 'image/png' })
    .run();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  vi.mocked(fs.rm).mockImplementation(async (path, options) => {
    if (path === stale) {
      entered.resolve();
      await release.promise;
    }
    return actual.rm(path, options);
  });
  const service = createBrandingService({
    db: connection.db,
    brandingRoot: root,
    logger: { warn() {} },
  });
  try {
    await entered.promise;
    let idle = false;
    const waiting = service.waitForIdle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);
    release.resolve();
    await waiting;
    await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await service.read(current))?.bytes.toString()).toBe(
      'published bytes',
    );
  } finally {
    release.resolve();
    await service.close();
    vi.restoreAllMocks();
    connection.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
