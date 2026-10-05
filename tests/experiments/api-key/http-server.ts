import { once } from 'node:events';
import { createServer } from 'node:http';
import type { BetterAuthOptions } from 'better-auth';
import { createKeyAuth, type openKeyFixture } from './fixture.ts';
import { handleKeyRequest, keyErrorResponse } from './http.ts';

export async function startKeyHttp(
  db: ReturnType<typeof openKeyFixture>['db'],
  secret: string,
  logger: NonNullable<BetterAuthOptions['logger']>,
) {
  let auth: ReturnType<typeof createKeyAuth>;
  let origin: string;
  const server = createServer(async (incoming, outgoing) => {
    let response: Response;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = incoming.method!;
      const request = new Request(`${origin}${incoming.url}`, {
        method,
        headers,
        ...(!['GET', 'HEAD'].includes(method) && {
          body: Buffer.concat(chunks),
        }),
      });
      response = await handleKeyRequest(auth, request);
    } catch (error) {
      logger.log?.('error', 'API Key HTTP experiment request failed', error);
      response = keyErrorResponse(error);
    }
    response.headers.set('cache-control', 'no-store');
    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers)
      if (name !== 'set-cookie') outgoing.setHeader(name, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader('set-cookie', cookies);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  async function close() {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing experiment port');
    origin = `http://127.0.0.1:${address.port}`;
    auth = createKeyAuth(db, origin, secret, logger);
    return { auth, origin, close };
  } catch (error) {
    await close();
    throw error;
  }
}
