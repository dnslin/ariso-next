import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { verifyUploadKey, type KeyAuth } from './fixture.ts';

const createInput = z.strictObject({
  name: z.string().trim().min(1).max(32),
  expiresIn: z
    .number()
    .min(1)
    .refine(
      (seconds) =>
        Number.isFinite(new Date(Date.now() + seconds * 1000).getTime()),
      'Expiry must be a valid future date',
    )
    .optional(),
});
const updateInput = z.strictObject({ enabled: z.boolean() });
const publicFields = (key: {
  id: string;
  name: string | null;
  enabled: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}) => ({
  id: key.id,
  name: key.name,
  enabled: key.enabled,
  createdAt: key.createdAt,
  expiresAt: key.expiresAt,
});

// Only the proposed identity boundary. Probes do not upload or read real images.
export async function handleKeyRequest(auth: KeyAuth, request: Request) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  const authMethods = {
    '/api/auth/sign-in/email': 'POST',
    '/api/auth/sign-out': 'POST',
    '/api/auth/get-session': 'GET',
  };
  if (path.startsWith('/api/auth/')) {
    if (authMethods[path as keyof typeof authMethods] !== method)
      return new Response(null, { status: 404 });
    return auth.handler(request);
  }
  if (path === '/probe/upload' && method === 'POST') {
    const bearer = /^Bearer (\S+)$/.exec(
      request.headers.get('authorization') ?? '',
    );
    if (!bearer || !(await verifyUploadKey(auth, bearer[1])))
      return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    return Response.json({ authorizationAccepted: true });
  }
  const tokenPath = /^\/api\/upload-tokens\/([^/]+)$/.exec(path);
  const collection =
    path === '/api/upload-tokens' && ['GET', 'POST'].includes(method);
  const item = tokenPath && ['PATCH', 'DELETE'].includes(method);
  const ownerProbe =
    path === '/probe/owner' && ['GET', 'PATCH', 'DELETE'].includes(method);
  if (!collection && !item && !ownerProbe)
    return new Response(null, { status: 404 });

  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableRefresh: true },
  });
  if (!session) return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  if (
    method !== 'GET' &&
    request.headers.get('origin') !== auth.options.baseURL
  )
    return Response.json({ code: 'INVALID_ORIGIN' }, { status: 403 });
  if (ownerProbe) return Response.json({ ownerId: session.user.id });

  if (collection && method === 'GET') {
    const result = await auth.api.listApiKeys({ headers: request.headers });
    return Response.json(result.apiKeys.map(publicFields));
  }
  if (collection) {
    const body = createInput.parse(await request.json());
    const created = await auth.api.createApiKey({
      headers: request.headers,
      body,
    });
    return Response.json({ ...publicFields(created), key: created.key });
  }
  const keyId = tokenPath![1];
  if (method === 'PATCH') {
    const body = updateInput.parse(await request.json());
    const updated = await auth.api.updateApiKey({
      headers: request.headers,
      body: { keyId, ...body },
    });
    return Response.json(publicFields(updated));
  }
  return Response.json(
    await auth.api.deleteApiKey({ headers: request.headers, body: { keyId } }),
  );
}

export function keyErrorResponse(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return Response.json({ code: 'INVALID_INPUT' }, { status: 400 });
  if (isAPIError(error))
    return Response.json(error.body, {
      status: error.statusCode,
    });
  return Response.json({ code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
}
