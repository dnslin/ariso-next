import { expect, it } from 'vitest';
import { startUploadEndpoint } from './s3-endpoint.ts';

it('serves CORS preflight and lets browser fixtures pause writes and retry delete errors through HTTP', async () => {
  const endpoint = await startUploadEndpoint({
    corsOrigin: 'http://ariso.test',
    control: true,
  });
  const control = (body: Record<string, unknown>) =>
    fetch(`${endpoint.target.endpoint}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const snapshot = async () =>
    (await fetch(`${endpoint.target.endpoint}/control`)).json();
  try {
    const path = `${endpoint.target.endpoint}/upload-fixture/ariso/control/uploads/session/source`;
    const preflight = await fetch(path, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://ariso.test',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'http://ariso.test',
    );
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'PUT',
    );
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'content-type',
    );
    await control({ putGate: true });
    const writing = fetch(path, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: 'fixture bytes',
    });
    await expect.poll(snapshot).toMatchObject({
      gates: { put: true },
      entered: { put: 1 },
      objects: [],
    });
    await control({ putGate: false, delete: true });
    expect((await writing).status).toBe(200);
    expect((await fetch(path, { method: 'DELETE' })).status).toBe(403);
    expect(await snapshot()).toMatchObject({
      objects: [{ size: 13, contentType: 'image/png' }],
    });
    await control({ delete: false });
    expect((await fetch(path, { method: 'DELETE' })).status).toBe(204);
    expect(await snapshot()).toMatchObject({ objects: [] });
  } finally {
    await endpoint.close();
  }
});
