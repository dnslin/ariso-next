import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server.js';
import { z } from 'zod';
import { createFixtureAuth } from '../identity/fixture.ts';
import { openSharingFixture, type Share } from './fixture.ts';

const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};
const kindSchema = z.enum(['unlock', 'items', 'refresh', 'neighbors']);
const patchSchema = z.strictObject({
  password: z
    .string()
    .min(1)
    .refine((value) => [...value].length <= 128)
    .nullable()
    .optional(),
  expiresAt: z.number().int().nullable().optional(),
  enabled: z.boolean().optional(),
  layout: z.enum(['grid', 'masonry']).optional(),
  showName: z.boolean().optional(),
  rotate: z.boolean().optional(),
  deleted: z.boolean().optional(),
});
const controlSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('seed'),
    id: z.string(),
    password: z.string().nullable(),
  }),
  z.strictObject({
    action: z.literal('change'),
    id: z.string(),
    patch: patchSchema,
  }),
  z.strictObject({ action: z.literal('clock'), now: z.number().int() }),
  z.strictObject({
    action: z.literal('gate'),
    id: z.string(),
    kind: kindSchema,
    enabled: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('release'),
    id: z.string(),
    kind: kindSchema,
  }),
  z.strictObject({
    action: z.literal('member'),
    id: z.string(),
    imageId: z.string(),
    public: z.boolean(),
    trashed: z.boolean().default(false),
  }),
]);
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}
function publicConfig(share: Share | null) {
  if (!share) return null;
  return {
    id: share.id,
    token: share.token,
    revision: share.revision,
    enabled: Boolean(share.enabled),
    expiresAt: share.expiresAt,
    hasPassword: Boolean(share.passwordHash),
    layout: share.layout,
    showName: Boolean(share.showName),
  };
}

export function createSharingHttp(
  database: string,
  configPath: string,
  authSecret: string,
) {
  const config = () =>
    JSON.parse(readFileSync(configPath, 'utf8')) as {
      origin: string;
      now: number;
    };
  const fixture = openSharingFixture(database, () => config().now);
  let auth: { origin: string; instance: ReturnType<typeof createFixtureAuth> };
  function getAuth() {
    const { origin } = config();
    if (!auth || auth.origin !== origin)
      auth = {
        origin,
        instance: createFixtureAuth(fixture.connection.db, origin, authSecret),
      };
    return auth.instance;
  }
  async function handle(request: NextRequest) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api' && parts[1] === 'auth')
      return getAuth().handler(request);
    // Loopback-only controls intentionally bypass owner authentication.
    if (parts[0] === 'control') {
      if (request.method === 'GET') return json(fixture.probe());
      const input = controlSchema.parse(await request.json());
      switch (input.action) {
        case 'seed':
          return json(
            publicConfig(await fixture.seed(input.id, input.password)),
          );
        case 'change':
          return json(
            publicConfig(await fixture.change(input.id, input.patch)),
          );
        case 'clock':
          writeFileSync(
            configPath,
            JSON.stringify({ ...config(), now: input.now }),
          );
          break;
        case 'gate':
          fixture.gate(input.id, input.kind, input.enabled);
          break;
        case 'release':
          fixture.release(input.id, input.kind);
          break;
        case 'member':
          fixture.member(input.id, input.imageId, input.public, input.trashed);
          break;
      }
      return json(fixture.probe());
    }
    if (parts[0] === 'owner') {
      const owner = await getAuth().api.getSession({
        headers: request.headers,
      });
      return json({ status: owner ? 200 : 401 }, owner ? 200 : 401);
    }
    if (parts[0] === 'client.js')
      return new Response(
        readFileSync(resolve('tests/experiments/sharing/client.js'), 'utf8'),
        { headers: { ...headers, 'Content-Type': 'text/javascript' } },
      );
    if (parts[0] !== 's' || !parts[1]) return json({ status: 200 });
    const token = parts[1];
    const kind = parts[2];
    if (
      request.method === 'POST' &&
      request.headers.get('origin') !== config().origin
    )
      return json({ status: 403 }, 403);
    if (kind === 'unlock' && request.method === 'POST') {
      const { password } = z
        .strictObject({
          password: z
            .string()
            .min(1)
            .refine((value) => [...value].length <= 128),
        })
        .parse(await request.json());
      const result = await fixture.unlock(token, password);
      const response = json({ status: result.status }, result.status);
      if (result.grantSecret)
        response.cookies.set('ariso_share_grant', result.grantSecret, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config().origin.startsWith('https:'),
          path: `/s/${token}`,
          maxAge: 86400,
        });
      return response;
    }
    if (kind && !['items', 'neighbors', 'refresh'].includes(kind))
      return json({ status: 404 }, 404);
    const ids =
      kind === 'refresh'
        ? z
            .strictObject({ ids: z.array(z.string()).max(80) })
            .parse(await request.json()).ids
        : undefined;
    const grant = request.cookies.get('ariso_share_grant')?.value;
    const result = fixture.read(token, grant, kind ?? 'html', ids);
    if (kind) {
      const share = fixture.readToken(token);
      if (share)
        await fixture.wait(share.id, kind as 'items' | 'refresh' | 'neighbors');
      return json(result.body, result.status);
    }
    // A protocol probe, not the product share page or an approved UI prototype.
    const initial = JSON.stringify({
      ...result.body,
      token,
      status: result.status,
    }).replaceAll('<', '\\u003c');
    return new Response(
      `<!doctype html><html><head><meta name="robots" content="noindex"><title>Sharing protocol experiment</title></head><body><pre id="status">${result.status}</pre><script>window.sharingInitial=${initial}</script><script src="/client.js"></script></body></html>`,
      {
        status: result.status,
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
  return {
    fixture,
    async handle(request: NextRequest) {
      try {
        return await handle(request);
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError)
          return json({ status: 400 }, 400);
        throw error;
      }
    },
  };
}
