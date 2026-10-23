import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  saveAndTestRestoreTarget,
  repairRestoreTargetCredentials,
} from '../../../src/components/backup/restore-target-client';
const target = { storageId: 'remote', revision: 3 };
const job = { id: 'restore', targets: [target] };
const input = {
  endpoint: 'https://s3.example.test',
  region: 'auto',
  bucket: 'new',
  pathPrefix: 'restore',
  forcePathStyle: true,
  accessKey: ' access ',
  secretKey: ' secret ',
};
const options = {
  id: 'restore',
  storageId: 'remote',
  setupCode: 'current-code',
  input,
  revision: 2,
};
const response = () => Response.json({ job });
afterEach(() => vi.unstubAllGlobals());
describe('restore target requests', () => {
  it('treats a malformed save response as unknown and never tests it', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetch);
    const onJob = vi.fn();
    await expect(
      saveAndTestRestoreTarget({ ...options, onJob }),
    ).rejects.toMatchObject({ uncertain: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onJob).not.toHaveBeenCalled();
  });
  it('acknowledges the saved credentials even if the later test response is lost', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new TypeError('lost test response'));
    vi.stubGlobal('fetch', fetch);
    const onSaved = vi.fn();
    await expect(
      saveAndTestRestoreTarget({ ...options, onSaved }),
    ).rejects.toMatchObject({ uncertain: true });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('tests the returned saved revision and sends explicit R2 confirmation only when given', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    await saveAndTestRestoreTarget({
      ...options,
      wholeBucketHasNoLockRules: true,
    });
    expect(fetch.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/setup/restore/restore/targets/remote', 'PUT'],
      ['/api/setup/restore/restore/targets/remote/test', 'POST'],
    ]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      revision: 3,
      wholeBucketHasNoLockRules: true,
    });
    expect(
      new Headers(fetch.mock.calls[0][1].headers).get('X-Ariso-Setup-Code'),
    ).toBe('current-code');
  });
  it('retests a saved revision without rewriting configuration or inventing owner confirmation', async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetch);
    await saveAndTestRestoreTarget({ ...options, input: undefined });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ revision: 2 });
  });
  it('does not start a test or cleanup after an ambiguous save', async () => {
    for (const action of [
      saveAndTestRestoreTarget,
      repairRestoreTargetCredentials,
    ]) {
      const fetch = vi.fn().mockRejectedValue(new TypeError('lost response'));
      vi.stubGlobal('fetch', fetch);
      await expect(action(options)).rejects.toMatchObject({ uncertain: true });
      expect(fetch).toHaveBeenCalledOnce();
    }
  });
  it('continues cleanup only after the credential update has succeeded', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    await repairRestoreTargetCredentials(options);
    expect(fetch.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/setup/restore/restore/targets/remote', 'PUT'],
      ['/api/setup/restore/restore/cancel', 'POST'],
    ]);
  });
});
