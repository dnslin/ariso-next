import { afterEach, beforeEach, expect, it } from 'vitest';
import { resultText } from '../../../integrations/browser-extension/lib/output.ts';
import {
  parseCapabilities,
  parseUploadResponse,
} from '../../../integrations/browser-extension/lib/result.ts';
import type { UploadItem } from '../../../integrations/browser-extension/lib/types.ts';
import { publicUploadFixture } from './api-fixture.ts';

let fixture: Awaited<ReturnType<typeof publicUploadFixture>>;
let key: string;

beforeEach(async () => {
  fixture = await publicUploadFixture();
  key = (await fixture.createToken({ name: 'Browser extension contract' })).key;
  const settings = await fixture.ownerJson('/api/settings/media', 'PATCH', {
    defaultVisibility: 'public',
    defaultLinkVersion: 'original',
    compressionEnabled: true,
    watermarkMode: 'off',
  });
  expect(settings.status, await settings.clone().text()).toBe(200);
}, 30000);

afterEach(async () => {
  await fixture?.close();
});

async function readCapabilities() {
  const response = await fixture.request('/api/upload/capabilities', {
    headers: { authorization: `Bearer ${key}` },
  });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return parseCapabilities(await response.json());
}

function queueItem(parsed: Partial<UploadItem>): UploadItem {
  return {
    id: 'browser-contract-row',
    name: '旅行.fake',
    bytes: fixture.bytes.length,
    previewUrl: '',
    source: 'local',
    state: 'queued',
    progress: 0,
    ...parsed,
  };
}

function linkPath(value: string) {
  const url = new URL(value);
  expect(url.origin).toBe(fixture.origin);
  return `${url.pathname}${url.search}`;
}

it('the browser client accepts real capabilities and keeps the saved version URL fixed after the site default changes', async () => {
  const capabilities = await readCapabilities();
  expect(capabilities).toMatchObject({
    defaultVisibility: 'public',
    defaultLinkVersion: 'original',
    defaultStorageAvailable: true,
    maxFileBytes: expect.any(Number),
    queueLimit: expect.any(Number),
    requestId: expect.any(String),
  });
  expect(capabilities.maxFileBytes).toBeGreaterThanOrEqual(
    fixture.bytes.length,
  );

  const response = await fixture.upload(
    key,
    fixture.form([['visibility', 'public']]),
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const parsed = parseUploadResponse(
    response.status,
    await response.json(),
    'site',
    'public',
  );
  expect(parsed).toMatchObject({
    state: 'ready',
    selectedVersion: 'original',
    imageId: expect.any(String),
    requestId: expect.any(String),
  });
  const item = queueItem(parsed);
  const link = resultText(item, 'url');
  expect(link).toEqual(expect.any(String));
  expect(link).toBe(parsed.versions?.original?.url);
  expect(new URL(link!).searchParams.get('type')).toBe('original');

  const delivered = await fixture.request(linkPath(link!));
  expect(delivered.status).toBe(200);
  expect(Buffer.from(await delivered.arrayBuffer())).toEqual(fixture.bytes);

  const changed = await fixture.ownerJson('/api/settings/media', 'PATCH', {
    defaultLinkVersion: 'compressed',
  });
  expect(changed.status, await changed.clone().text()).toBe(200);
  expect((await readCapabilities()).defaultLinkVersion).toBe('compressed');
  expect(resultText(item, 'url')).toBe(link);
  const fixed = await fixture.request(linkPath(link!));
  expect(fixed.status).toBe(200);
  expect(Buffer.from(await fixed.arrayBuffer())).toEqual(fixture.bytes);
}, 30000);

it('a missing version in a real successful upload becomes unavailable instead of silently copying the original', async () => {
  const response = await fixture.upload(
    key,
    fixture.form([['visibility', 'public']]),
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const body: unknown = await response.json();
  const original = parseUploadResponse(
    response.status,
    body,
    'original',
    'public',
  );
  expect(original.state).toBe('ready');
  expect(original.versions?.original?.url).toEqual(expect.any(String));
  expect(original.versions).not.toHaveProperty('watermark');

  const unavailable = parseUploadResponse(
    response.status,
    body,
    'watermark',
    'public',
  );
  expect(unavailable).toMatchObject({
    state: 'version-unavailable',
    imageId: original.imageId,
    requestId: original.requestId,
  });
  expect(unavailable).not.toHaveProperty('url');
  expect(unavailable.versions?.original?.url).toBe(original.url);
  expect(resultText(queueItem(unavailable), 'url')).toBeNull();
}, 30000);

it('private HTTP uploads stay non-copyable in the browser client and an upload Token cannot read their bytes', async () => {
  const response = await fixture.upload(
    key,
    fixture.form([['visibility', 'private']]),
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const parsed = parseUploadResponse(
    response.status,
    await response.json(),
    'original',
    'private',
  );
  expect(parsed).toMatchObject({
    state: 'ready',
    visibility: 'private',
    imageId: expect.any(String),
    url: expect.any(String),
  });
  const item = queueItem(parsed);
  for (const format of ['url', 'markdown', 'html'] as const)
    expect(resultText(item, format)).toBeNull();

  const path = linkPath(parsed.url!);
  expect((await fixture.request(path)).status).toBe(401);
  expect(
    (
      await fixture.request(path, {
        headers: { authorization: `Bearer ${key}` },
      })
    ).status,
  ).toBe(401);
  const owner = await fixture.owner(path);
  expect(owner.status).toBe(200);
  expect(Buffer.from(await owner.arrayBuffer())).toEqual(fixture.bytes);
}, 30000);
