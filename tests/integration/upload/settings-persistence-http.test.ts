import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import { uploadSettings } from '../../../src/server/upload/schema.ts';
import { getSubmission } from '../../../src/server/upload/sessions.ts';
import { UPLOAD_MIB_BYTES } from '../../../src/shared/upload-settings.ts';
import { email, password, seedAuthOwner } from '../identity/auth-fixture.ts';
import { launch, stop } from '../runtime/process-helpers.ts';

it('persists HTTP upload limit edits through a process restart and applies them only to new submissions', async () => {
  const directory = mkdtempSync(
    join(tmpdir(), 'ariso-upload-settings-persist-'),
  );
  const data = join(directory, 'data');
  const environment = {
    DATA_DIR: data,
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  let server = await launch(
    resolve('.next/standalone'),
    directory,
    environment,
  );
  let live: ReturnType<typeof openRuntimeDatabase> | undefined;
  const origin = `http://127.0.0.1:${server.port}`;
  async function ready() {
    await vi.waitFor(
      async () => {
        if (server.child.exitCode !== null) throw new Error(server.logs());
        expect((await fetch(`${origin}/api/health`)).status).toBe(200);
      },
      { timeout: 15000 },
    );
  }
  async function login() {
    const response = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(200);
    return {
      origin,
      'content-type': 'application/json',
      cookie: response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; '),
    };
  }
  const input = (requestId: string, count: number, declaredSize: number) => ({
    requestId,
    files: Array.from({ length: count }, (_, index) => ({
      queueItemId: `${requestId}-${index}`,
      originalName: 'photo.png',
      declaredSize,
    })),
  });
  try {
    await ready();
    live = openRuntimeDatabase(join(data, 'ariso.db'));
    await seedAuthOwner(live, origin);
    prepareInitialStorage(live.db, { storage: join(data, 'storage') });
    let headers = await login();
    const oldResponse = await fetch(`${origin}/api/uploads/submissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input('before-edit', 21, 2 * UPLOAD_MIB_BYTES)),
    });
    expect(oldResponse.status).toBe(201);
    const oldSubmission = await oldResponse.json();
    expect(oldSubmission).toMatchObject({
      maxFileBytes: 50 * UPLOAD_MIB_BYTES,
      batchSize: 20,
    });
    expect(
      oldSubmission.sessions.map(
        (item: { groupIndex: number }) => item.groupIndex,
      ),
    ).toEqual([...Array<number>(20).fill(0), 1]);
    const settingsUrl = `${origin}/api/settings/upload`;
    const edit = await fetch(settingsUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ maxFileMiB: 1, batchSize: 1, queueLimit: 100 }),
    });
    expect(edit.status).toBe(200);
    const saved = {
      maxFileMiB: 1,
      maxFileBytes: UPLOAD_MIB_BYTES,
      batchSize: 1,
      queueLimit: 100,
    };
    expect(await edit.json()).toEqual(saved);
    const persistedRow = live.db.select().from(uploadSettings).get();
    expect(persistedRow).toMatchObject({
      id: 1,
      maxFileBytes: UPLOAD_MIB_BYTES,
      batchSize: 1,
      queueLimit: 100,
    });
    for (const [submission, status, code] of [
      [
        input('oversized-after-edit', 1, UPLOAD_MIB_BYTES + 1),
        413,
        'UPLOAD_FILE_TOO_LARGE',
      ],
      [input('over-queue-after-edit', 101, 1), 400, 'UPLOAD_QUEUE_LIMIT'],
    ] as const) {
      const rejected = await fetch(`${origin}/api/uploads/submissions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(submission),
      });
      expect(rejected.status).toBe(status);
      expect(await rejected.json()).toMatchObject({ code });
    }
    const nextResponse = await fetch(`${origin}/api/uploads/submissions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input('after-edit', 2, UPLOAD_MIB_BYTES)),
    });
    expect(nextResponse.status).toBe(201);
    const nextSubmission = await nextResponse.json();
    expect(nextSubmission).toMatchObject({
      maxFileBytes: UPLOAD_MIB_BYTES,
      batchSize: 1,
      sessions: [{ groupIndex: 0 }, { groupIndex: 1 }],
    });
    expect(getSubmission(live.db, oldSubmission.id)).toMatchObject({
      maxFileBytes: 50 * UPLOAD_MIB_BYTES,
      batchSize: 20,
      queueLimit: 500,
    });
    expect(getSubmission(live.db, nextSubmission.id).queueLimit).toBe(100);

    live.close();
    live = undefined;
    await stop(server.child, server.closed);
    server = await launch(resolve('.next/standalone'), directory, {
      ...environment,
      PORT: String(server.port),
    });
    await ready();
    headers = await login();
    const restored = await fetch(settingsUrl, { headers });
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual(saved);
    live = openRuntimeDatabase(join(data, 'ariso.db'));
    expect(live.db.select().from(uploadSettings).all()).toEqual([persistedRow]);
    for (const submission of [oldSubmission, nextSubmission]) {
      const restoredSubmission = await fetch(
        `${origin}/api/uploads/submissions/${submission.id}`,
        { headers },
      );
      expect(restoredSubmission.status).toBe(200);
      expect(await restoredSubmission.json()).toEqual(submission);
    }
    expect(getSubmission(live.db, oldSubmission.id).queueLimit).toBe(500);
    expect(getSubmission(live.db, nextSubmission.id).queueLimit).toBe(100);
  } finally {
    live?.close();
    await stop(server.child, server.closed);
    rmSync(directory, { recursive: true, force: true });
  }
}, 45000);
