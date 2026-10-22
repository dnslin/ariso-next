import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { launchAccessProtectionFixture } from './access-protection-fixture.ts';
import { launchLocalDelivery } from './local-fixture.ts';

const execute = promisify(execFile);
type Asset = { imageId: string; bytes: Buffer };
let app: Awaited<ReturnType<typeof launchAccessProtectionFixture>>;
let local: Asset;
beforeAll(async () => {
  app = await launchAccessProtectionFixture();
  local = await app.seedLocal(0);
}, 30000);
afterAll(async () => {
  await app?.close();
});

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${app.origin}${path}`, {
    ...init,
    redirect: 'manual',
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
}
async function owner(path: string, init: RequestInit = {}) {
  return request(path, {
    ...init,
    headers: { cookie: app.cookie, origin: app.origin, ...init.headers },
  });
}
async function configure(
  mode: 'off' | 'observe' | 'enforce',
  rate = 10,
  burst = 200,
) {
  const response = await owner('/api/settings/access-protection', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, rate, burst }),
  });
  const value = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(200);
  expect(value).toMatchObject({ mode, rate, burst, clientIp: { ready: true } });
  return value;
}
async function reset(rate = 10, burst = 200) {
  await configure('off', rate, burst);
  await configure('enforce', rate, burst);
}
const image = (id: string, query = 'type=original') => `/i/${id}?${query}`;
async function discard(response: Response) {
  await response.arrayBuffer();
  return response.status;
}
async function exhaust() {
  await reset(1, 1);
  expect(await discard(await request(image(local.imageId)))).toBe(200);
  const denied = await request(image(local.imageId));
  expect(denied.status).toBe(429);
  expect(denied.headers.get('retry-after')).toBe('1');
  expect(denied.headers.get('cache-control')).toContain('no-store');
  await denied.arrayBuffer();
}

it('admits the normal 41/160/164-request media bursts under the accepted defaults', async () => {
  for (const [label, count] of [
    ['one public album with cover', 41],
    ['two external pages with 80 embeds each', 160],
    ['four visitors sharing an IP and opening 40-image albums', 164],
  ] as const) {
    await reset();
    const statuses = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const id = index % 2 ? local.imageId : app.publicAsset.imageId;
        const response = await request(
          image(id, `type=original&embed=${index}`),
          {
            headers:
              index % 3 ? { referer: 'https://blog.example.test/post' } : {},
          },
        );
        return discard(response);
      }),
    );
    expect(
      statuses.every((status) => status === 200 || status === 302),
      label,
    ).toBe(true);
  }
}, 30000);

it('shares one anonymous budget across GET, HEAD, image variants and private share media', async () => {
  const shared = await owner(`/api/images/${app.privateAsset.imageId}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hours: 1, sourceVersion: 'compressed' }),
  });
  expect(shared.status).toBe(200);
  const share = (await shared.json()).share as { token: string };
  await exhaust();
  for (const path of [
    image(local.imageId, 'type=original&download=1'),
    image(app.publicAsset.imageId, 'type=thumbnail'),
    `/s/image/${share.token}/media`,
  ]) {
    const response = await request(path, { method: 'HEAD' });
    expect(response.status).toBe(429);
    expect(await response.text()).toBe('');
  }
  // Rate exemption does not turn an owner into an anonymous share grant or weaken revocation.
  expect(
    (
      await owner(`/api/images/${app.privateAsset.imageId}/share`, {
        method: 'DELETE',
      })
    ).status,
  ).toBe(200);
  const revoked = await owner(`/s/image/${share.token}/media`);
  expect(revoked.status).toBe(410);
  expect(await revoked.json()).toMatchObject({ code: 'SHARING_UNAVAILABLE' });
}, 15000);

it('exempts real owner browsing and HEAD/GET downloads even after the same IP is limited', async () => {
  await exhaust();
  const list = await owner('/api/images?pageSize=80&page=1');
  expect(list.status).toBe(200);
  await list.arrayBuffer();
  const results = await Promise.all(
    Array.from({ length: 80 }, async (_, index) => {
      const id = index % 2 ? local.imageId : app.publicAsset.imageId;
      return discard(
        await owner(image(id), { method: index % 3 ? 'GET' : 'HEAD' }),
      );
    }),
  );
  expect(results.every((status) => status === 200 || status === 302)).toBe(
    true,
  );
  await reset(1, 1);
  for (const method of ['HEAD', 'GET']) {
    expect(
      await discard(
        await owner(
          image(app.privateAsset.imageId, 'type=original&download=1'),
          { method },
        ),
      ),
    ).toBe(302);
  }
  // The owner's requests do not consume even one anonymous allowance.
  expect(await discard(await request(image(local.imageId)))).toBe(200);
  expect(await discard(await request(image(local.imageId)))).toBe(429);
}, 15000);

it('does not accept forged owner cookies or client-IP headers as an exemption', async () => {
  await exhaust();
  const attempts: Record<string, string>[] = [
    {
      'x-forwarded-for': '198.51.100.22',
      'x-ariso-client-ip': '198.51.100.23',
    },
    { cookie: 'better-auth.session_token=forged' },
    { authorization: `Bearer ${app.token}` },
  ];
  for (const headers of attempts) {
    expect(
      await discard(await request(image(app.publicAsset.imageId), { headers })),
    ).toBe(429);
  }
});

it('keeps observation non-blocking and S3 signatures direct and reusable', async () => {
  await configure('observe', 1, 1);
  const observed = await Promise.all(
    Array.from({ length: 12 }, () =>
      request(image(app.publicAsset.imageId)).then(discard),
    ),
  );
  expect(observed).toEqual(Array(12).fill(302));
  await reset(1, 1);
  const signed = await request(image(app.publicAsset.imageId));
  expect(signed.status).toBe(302);
  const location = signed.headers.get('location')!;
  expect(new URL(location).origin).toBe(app.endpoint.target.endpoint);
  expect(new URL(location).searchParams.get('X-Amz-Expires')).toBe('300');
  expect(await discard(await request(image(app.publicAsset.imageId)))).toBe(
    429,
  );
  for (let index = 0; index < 3; index++) {
    const direct = await fetch(location);
    expect(direct.status).toBe(200);
    expect(Buffer.from(await direct.arrayBuffer())).toEqual(
      app.publicAsset.bytes,
    );
  }
});

it('downloads complete 200-image Local, S3 and mixed ZIPs while anonymous requests are limited', async () => {
  const locals: Asset[] = [local];
  const remotes: Asset[] = [app.publicAsset];
  for (let index = 1; index < 200; index++) {
    locals.push(await app.seedLocal(index));
    remotes.push(
      await app.seed({ visibility: index % 2 ? 'private' : 'public' }),
    );
  }
  for (const [label, assets] of [
    ['local', locals],
    ['s3', remotes],
    ['mixed', [...locals.slice(0, 100), ...remotes.slice(0, 100)]],
  ] as const) {
    await exhaust();
    const prepared = await owner('/api/images/archives', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ids: assets.map((asset) => asset.imageId),
        query: '',
        version: 'original',
      }),
      signal: AbortSignal.timeout(60000),
    });
    expect(prepared.status).toBe(200);
    const { downloadUrl } = await prepared.json();
    const zip = await owner(downloadUrl, {
      signal: AbortSignal.timeout(60000),
    });
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    const path = join(app.directory, `access-${label}.zip`);
    await writeFile(path, Buffer.from(await zip.arrayBuffer()));
    const inspected = await execute('/usr/bin/python3', [
      '-c',
      'import hashlib,json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps([hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()]))',
      path,
    ]);
    const hashes = JSON.parse(inspected.stdout) as string[];
    expect(hashes).toHaveLength(200);
    expect(hashes.sort()).toEqual(
      assets
        .map((asset) => createHash('sha256').update(asset.bytes).digest('hex'))
        .sort(),
    );
  }
}, 180000);

it('uses trusted proxy chains to isolate real visitors without trusting the leftmost spoof', async () => {
  const proxied = await launchLocalDelivery({
    ARISO_TRUSTED_PROXIES: '127.0.0.1/32,::1/128',
  });
  try {
    const asset = await proxied.seed();
    const response = await fetch(
      `${proxied.origin}/api/settings/access-protection`,
      {
        method: 'PATCH',
        headers: {
          cookie: proxied.cookie,
          origin: proxied.origin,
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.5',
        },
        body: JSON.stringify({ mode: 'enforce', rate: 1, burst: 1 }),
      },
    );
    expect(response.status).toBe(200);
    const get = (chain: string) =>
      fetch(`${proxied.origin}/i/${asset.imageId}?type=original`, {
        headers: { 'x-forwarded-for': chain },
      }).then(discard);
    expect(await get('198.51.100.10')).toBe(200);
    expect(await get('192.0.2.99, 198.51.100.10')).toBe(429);
    expect(await get('198.51.100.11')).toBe(200);
  } finally {
    await proxied.close();
  }
}, 30000);
