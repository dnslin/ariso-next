import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import type { Logger } from 'pino';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { updateAccessProtectionSettings } from '../../../src/server/access-protection/settings.ts';
import { createAccessProtectionRuntime } from '../../../src/server/access-protection/runtime.ts';
import { patchAccessProtectionSettingsResponse } from '../../../src/server/access-protection/settings-http.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof createAccessProtectionRuntime>;
let now: number;
let logger: { info: Mock<Logger['info']>; warn: Mock<Logger['warn']> };
const request = (
  path = '/i/image?type=original',
  method = 'GET',
  ip: string | null = '192.0.2.1',
) =>
  new Request(`https://images.example${path}`, {
    method,
    headers: ip ? { 'x-ariso-client-ip': ip } : {},
  });
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-access-runtime-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  now = 0;
  logger = { info: vi.fn<Logger['info']>(), warn: vi.fn<Logger['warn']>() };
  runtime = createAccessProtectionRuntime({
    db: connection.db,
    logger,
    now: () => now,
  });
});
afterEach(() => {
  runtime.stop();
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const policy = (mode: 'off' | 'observe' | 'enforce', rate = 10, burst = 200) =>
  updateAccessProtectionSettings(connection.db, { mode, rate, burst });

it('one bucket covers paths, versions, GET and HEAD; owner accesses neither consume nor reset it', async () => {
  policy('enforce');
  for (let index = 0; index < 200; index++)
    expect(
      runtime.check(request(`/i/${index}?type=thumbnail`), false),
    ).toBeNull();
  for (let index = 0; index < 300; index++)
    expect(runtime.check(request(`/i/owner-${index}`), true)).toBeNull();
  const limited = runtime.check(request('/s/image/share-token/media'), false)!;
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('1');
  expect(limited.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(await limited.json()).toMatchObject({ code: 'ACCESS_RATE_LIMITED' });
  const head = runtime.check(request('/i/image?download=1', 'HEAD'), false)!;
  expect(head.status).toBe(429);
  expect(await head.text()).toBe('');
  now = 100;
  expect(
    runtime.check(request('/i/new-version?type=compressed'), false),
  ).toBeNull();
  expect(runtime.check(request(), false)?.status).toBe(429);
});

it('observe mode records a sampled would-block event and never blocks the visitor', () => {
  for (let index = 0; index < 500; index++)
    expect(
      runtime.check(request('/s/image/secret-token/media'), false),
    ).toBeNull();
  expect(logger.info).toHaveBeenCalledTimes(1);
  expect(logger.info.mock.calls[0][0]).toMatchObject({
    event: 'access-protection',
    mode: 'observe',
    outcome: 'would-block',
    ip: '192.0.2.1',
  });
  expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret-token');
  expect(logger.warn).not.toHaveBeenCalled();
});

it('off mode does not consume an allowance or emit limiter diagnostics', () => {
  policy('off', 1, 1);
  for (let index = 0; index < 500; index++)
    expect(runtime.check(request(), false)).toBeNull();
  expect(logger.info).not.toHaveBeenCalled();
  expect(logger.warn).not.toHaveBeenCalled();
  policy('enforce', 1, 1);
  expect(runtime.check(request(), false)).toBeNull();
  expect(runtime.check(request(), false)?.status).toBe(429);
});

it('settings changes apply immediately while a no-op save does not refill a depleted bucket', () => {
  policy('enforce', 1, 1);
  expect(runtime.check(request(), false)).toBeNull();
  policy('enforce', 1, 1);
  expect(runtime.check(request(), false)?.status).toBe(429);
  policy('enforce', 1, 2);
  expect(runtime.check(request(), false)).toBeNull();
  expect(runtime.check(request(), false)).toBeNull();
  expect(runtime.check(request(), false)?.status).toBe(429);
  policy('observe', 1, 1);
  expect(runtime.check(request(), false)).toBeNull();
  expect(runtime.check(request(), false)).toBeNull();
});

it('successful API policy changes reset immediately, including off then enforce without an intervening image request', async () => {
  policy('enforce', 1, 1);
  expect(runtime.check(request(), false)).toBeNull();
  const save = (mode: 'off' | 'enforce') =>
    patchAccessProtectionSettingsResponse(
      connection.db,
      new Request('https://images.example/api/settings/access-protection', {
        method: 'PATCH',
        headers: {
          'x-ariso-client-ip': '192.0.2.1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ mode, rate: 1, burst: 1 }),
      }),
      () => runtime.reset(),
    );
  await save('enforce');
  expect(runtime.check(request(), false)?.status).toBe(429);
  await save('off');
  await save('enforce');
  expect(runtime.check(request(), false)).toBeNull();
  expect(runtime.check(request(), false)?.status).toBe(429);
});

it('a failed settings save does not reset an existing allowance', async () => {
  policy('enforce', 1, 1);
  expect(runtime.check(request(), false)).toBeNull();
  connection.db.$client.exec(
    "CREATE TRIGGER reject_policy_update BEFORE UPDATE ON access_protection_settings BEGIN SELECT RAISE(ABORT, 'write failed'); END",
  );
  await expect(
    patchAccessProtectionSettingsResponse(
      connection.db,
      new Request('https://images.example/api/settings/access-protection', {
        method: 'PATCH',
        headers: {
          'x-ariso-client-ip': '192.0.2.1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ mode: 'off', rate: 1, burst: 1 }),
      }),
      () => runtime.reset(),
    ),
  ).rejects.toThrow();
  expect(runtime.check(request(), false)?.status).toBe(429);
});

it('missing IP never creates a shared unknown bucket; enforcement exposes a configuration failure and exempts owner', async () => {
  for (let index = 0; index < 500; index++)
    expect(runtime.check(request('/i/a', 'GET', null), false)).toBeNull();
  expect(logger.warn).toHaveBeenCalledTimes(1);
  policy('enforce', 1, 1);
  const missing = runtime.check(request('/i/a', 'GET', null), false)!;
  expect(missing.status).toBe(503);
  expect(await missing.json()).toMatchObject({
    code: 'ACCESS_PROTECTION_IP_UNAVAILABLE',
  });
  expect(runtime.check(request('/i/a', 'HEAD', null), true)).toBeNull();
  expect(runtime.check(request(), false)).toBeNull();
});

it('non-media methods do not consume the GET/HEAD allowance', () => {
  policy('enforce', 1, 1);
  expect(runtime.check(request('/api/upload', 'POST'), false)).toBeNull();
  expect(runtime.check(request(), false)).toBeNull();
  expect(runtime.check(request(), false)?.status).toBe(429);
});
