import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { accessProtectionSettings } from '../../../src/server/access-protection/schema.ts';
import {
  requireAccessProtectionSettings,
  updateAccessProtectionSettings,
} from '../../../src/server/access-protection/settings.ts';
import { accessProtectionInputSchema } from '../../../src/server/access-protection/validation.ts';

let directory: string;
let databasePath: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-access-settings-'));
  databasePath = join(directory, 'ariso.db');
  connection = openRuntimeDatabase(databasePath);
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('migration creates one observe-only policy and a repeated migration preserves changes', () => {
  expect(requireAccessProtectionSettings(connection.db)).toMatchObject({
    mode: 'observe',
    rate: 10,
    burst: 200,
    updatedAt: expect.any(Date),
  });
  updateAccessProtectionSettings(connection.db, {
    mode: 'enforce',
    rate: 12,
    burst: 240,
  });
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  expect(requireAccessProtectionSettings(connection.db)).toMatchObject({
    mode: 'enforce',
    rate: 12,
    burst: 240,
  });
  expect(
    connection.db.select().from(accessProtectionSettings).all(),
  ).toHaveLength(1);
});

it('saved settings survive reopening the database', () => {
  const saved = updateAccessProtectionSettings(connection.db, {
    mode: 'off',
    rate: 15,
    burst: 300,
  });
  connection.close();
  connection = openRuntimeDatabase(databasePath);
  expect(requireAccessProtectionSettings(connection.db)).toEqual(saved);
});

it('invalid modes, non-positive/fractional/unsafe numbers and extra fields are rejected', () => {
  const valid = { mode: 'observe', rate: 10, burst: 200 };
  for (const patch of [
    { mode: 'blocked' },
    { rate: 0 },
    { rate: -1 },
    { rate: 1.5 },
    { burst: 0 },
    { burst: Infinity },
    { rate: Number.MAX_SAFE_INTEGER + 1 },
    { burst: '200' },
    { ownerExempt: false },
  ])
    expect(
      accessProtectionInputSchema.safeParse({ ...valid, ...patch }).success,
    ).toBe(false);
  expect(accessProtectionInputSchema.safeParse({}).success).toBe(false);
  expect(accessProtectionInputSchema.parse(valid)).toEqual(valid);
});

it('a database write failure retains the previous complete policy', () => {
  const before = requireAccessProtectionSettings(connection.db);
  connection.db.$client.exec(
    "CREATE TRIGGER reject_access_settings BEFORE UPDATE ON access_protection_settings BEGIN SELECT RAISE(ABORT, 'settings write failed'); END",
  );
  expect(() =>
    updateAccessProtectionSettings(connection.db, {
      mode: 'enforce',
      rate: 50,
      burst: 500,
    }),
  ).toThrow();
  expect(requireAccessProtectionSettings(connection.db)).toEqual(before);
});

it('a missing settings row is an observable error, not a silent default', () => {
  connection.db.delete(accessProtectionSettings).run();
  expect(() => requireAccessProtectionSettings(connection.db)).toThrow(
    '访问防护设置缺失',
  );
});
