import { expect, it } from 'vitest';
import { launchS3Delivery } from './s3-fixture.ts';
import { startProtocolEndpoint } from './s3-endpoint.ts';

it('cancels a genuinely stalled fixture PUT and cleans its recorded key using an independent signal', async () => {
  const controller = new AbortController();
  const endpoint = await startProtocolEndpoint({
    stalledPut: true,
    onPut: () =>
      controller.abort(new Error('Intentional fixture write cancellation')),
  });
  const app = await launchS3Delivery(
    endpoint.target,
    undefined,
    controller.signal,
  );
  try {
    await expect(app.seed()).rejects.toMatchObject({
      code: 'STORAGE_OPERATION_FAILED',
      operation: 'write',
      cause: { name: 'AbortError' },
    });
    expect(controller.signal.aborted).toBe(true);
    expect(app.keys).toHaveLength(1);
  } finally {
    try {
      await app.close();
    } finally {
      await endpoint.close();
    }
  }
  expect(endpoint.requests.some((request) => request.method === 'DELETE')).toBe(
    true,
  );
  expect(endpoint.requests.some((request) => request.method === 'HEAD')).toBe(
    true,
  );
  expect(endpoint.objects.size).toBe(0);
}, 30000);
