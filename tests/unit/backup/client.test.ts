import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBackup,
  deleteBackup,
  uploadRestoreFile,
} from '../../../src/components/backup/client';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const job = (receivedBytes: number, uploadBytes: number) => ({
  id: 'restore-one',
  kind: 'restore',
  status: receivedBytes === uploadBytes ? 'received' : 'receiving',
  receivedBytes,
  uploadBytes,
  createdAt: 1,
  updatedAt: 1,
});
afterEach(() => vi.unstubAllGlobals());

describe('backup client request outcomes', () => {
  it('queries the same creation ID after a lost response without creating another backup', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(
        response({
          job: { id: 'intent-one', kind: 'backup', status: 'copying' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await createBackup('intent-one', ' password ')).job.id).toBe(
      'intent-one',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('/api/backups/intent-one');
    expect(fetch.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[0][1].body).password).toBe(' password ');
    expect(fetch.mock.calls[1][0]).toBe('/api/backups/intent-one');
    expect(fetch.mock.calls[1][1].method).toBeUndefined();
  });

  it('leaves a creation result unknown when the follow-up read cannot confirm it', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(
        response({ code: 'BACKUP_NOT_FOUND', message: '未找到任务' }, 404),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(createBackup('same-intent', 'password')).rejects.toMatchObject(
      { uncertain: true },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sends ordered chunks and checks server offset after an accepted chunk loses its response', async () => {
    const size = 16 * 1024 * 1024 + 7;
    const file = new File([new Uint8Array(size)], 'backup.zip.age');
    let offset = 0;
    let lost = false;
    const offsets: number[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).not.toContain('setup-code');
      expect(new Headers(init.headers).get('X-Ariso-Setup-Code')).toBe(
        'setup-code',
      );
      if (!init.method) return response({ job: job(offset, size) });
      expect(init.method).toBe('PUT');
      const headers = new Headers(init.headers);
      const requestOffset = Number(headers.get('Upload-Offset'));
      expect(requestOffset).toBe(offset);
      expect(Number(headers.get('Upload-Length'))).toBe(size);
      const blob = init.body as Blob;
      expect(blob.size).toBeLessThanOrEqual(8 * 1024 * 1024);
      offsets.push(requestOffset);
      offset += blob.size;
      if (offset === 16 * 1024 * 1024 && !lost) {
        lost = true;
        throw new TypeError('lost response');
      }
      return response({ job: job(offset, size) });
    });
    vi.stubGlobal('fetch', fetch);
    const result = await uploadRestoreFile({
      id: 'restore-one',
      setupCode: 'setup-code',
      file,
    });
    expect(result.receivedBytes).toBe(size);
    expect(offsets).toEqual([0, 8 * 1024 * 1024, 16 * 1024 * 1024]);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('does not retry an unauthorized restore request or continue reading file slices', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response(
          { code: 'INVALID_SETUP_CODE', message: '初始化码已失效' },
          401,
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      uploadRestoreFile({
        id: 'restore-one',
        setupCode: 'old-code',
        file: new File(['bytes'], 'backup.zip.age'),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_SETUP_CODE' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it('reconciles an ambiguous delete by reading the same ID without repeating DELETE', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('lost response'))
    .mockResolvedValueOnce(
      response({ code: 'BACKUP_NOT_FOUND', message: '未找到' }, 404),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(deleteBackup('deleted-one')).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  expect(fetch.mock.calls[1][0]).toBe('/api/backups/deleted-one');
  expect(fetch.mock.calls[1][1].method).toBeUndefined();
});

it('treats a malformed successful creation response as unknown and reads the same task', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({}))
    .mockResolvedValueOnce(
      response({
        job: { id: 'malformed-one', kind: 'backup', status: 'copying' },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  expect((await createBackup('malformed-one', 'password')).job.id).toBe(
    'malformed-one',
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe('/api/backups/malformed-one');
  expect(fetch.mock.calls[1][1].method).toBeUndefined();
});
