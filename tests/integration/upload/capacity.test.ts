import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import {
  newReport,
  probe,
  type Target,
} from '../../experiments/upload-capacity/probe.ts';

async function withStorage(
  corrupt: boolean | 'length' | 'stalled' | 'versioned',
  run: (
    target: Target,
    objects: Map<string, Buffer>,
    observed: { getClosedBeforeDelete: boolean },
  ) => Promise<void>,
) {
  const objects = new Map<string, Buffer>();
  const observed = { getClosedBeforeDelete: false };
  let bodyClosed: Promise<void> | undefined;
  const server = createServer(async (request, response) => {
    const key = request.url!.split('?')[0];
    response.setHeader('content-type', 'application/xml');
    if (request.method === 'DELETE') {
      if (bodyClosed) {
        observed.getClosedBeforeDelete = await Promise.race([
          bodyClosed.then(() => true),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 200),
          ),
        ]);
      }
      if (corrupt === 'versioned') {
        response.setHeader('x-amz-delete-marker', 'true');
        response.setHeader('x-amz-version-id', 'retained-version');
        response.writeHead(204).end();
        return;
      }
      objects.delete(key);
      response.writeHead(204).end();
      return;
    }
    if (request.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const source = request.headers['x-amz-copy-source'];
      if (source) {
        const body = objects.get(`/${source}`)!;
        objects.set(key, corrupt ? Buffer.alloc(body.length) : body);
        response.end(
          '<CopyObjectResult><ETag>"fixture"</ETag></CopyObjectResult>',
        );
      } else {
        const body = Buffer.concat(chunks);
        if (body.length > 1024) {
          response
            .writeHead(400)
            .end(
              '<Error><Code>EntityTooLarge</Code><Message>Fixture size limit</Message></Error>',
            );
          return;
        }
        objects.set(key, body);
        response.setHeader('etag', '"fixture"');
        response.end();
      }
      return;
    }
    const body = objects.get(key);
    if (!body) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      'content-length',
      body.length + (corrupt === 'length' && request.method === 'GET' ? 1 : 0),
    );
    response.setHeader('etag', '"fixture"');
    if (corrupt === 'length' && request.method === 'GET') {
      bodyClosed = new Promise((resolve) => response.once('close', resolve));
      response.write(body);
      return;
    }
    if (corrupt === 'stalled' && request.method === 'GET') {
      response.flushHeaders();
      return;
    }
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  try {
    await run(
      {
        service: 'aws',
        endpoint: `http://127.0.0.1:${address.port}`,
        bucket: 'fixture',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' },
      },
      objects,
      observed,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

it('measures real SDK PUT/Copy bytes, an adjacent rejection, and deletes only probe objects', async () => {
  await withStorage(false, async (target, objects) => {
    objects.set('/fixture/existing', Buffer.from('keep'));
    const report = newReport({
      service: target.service,
      endpoint: target.endpoint,
      bucket: target.bucket,
    });
    const checkpoints: string[] = [];
    await probe(
      target,
      [1024, 1025],
      report,
      async () => {
        checkpoints.push(JSON.stringify(report));
      },
      5000,
    );
    expect(report.boundary).toEqual({
      maximumSuccessfulBytes: 1024,
      firstRejectedBytes: 1025,
      exactBytes: 1024,
    });
    expect(
      report.samples[0].operations.find(
        (value) => value.stage === 'copied-bytes',
      )?.status,
    ).toBe('passed');
    expect(JSON.parse(checkpoints[0]).samples[0].keys).toHaveLength(2);
    expect([...objects.keys()]).toEqual(['/fixture/existing']);
    expect(JSON.stringify(report)).not.toContain('secretAccessKey');
  });
});

it('does not accept a successful Copy response whose actual bytes differ', async () => {
  await withStorage(true, async (target) => {
    const report = newReport({
      service: target.service,
      endpoint: target.endpoint,
      bucket: target.bucket,
    });
    await probe(target, [1024, 1025], report, async () => {}, 5000);
    expect(report.samples[0].copy).toBe('failed');
    expect(report.boundary.exactBytes).toBeNull();
    expect(report.boundary.maximumSuccessfulBytes).toBeNull();
  });
});

it('attempts remote cleanup even when saving the PUT result fails', async () => {
  await withStorage(false, async (target, objects) => {
    const report = newReport({
      service: target.service,
      endpoint: target.endpoint,
      bucket: target.bucket,
    });
    let saves = 0;
    await expect(
      probe(
        target,
        [1024],
        report,
        async () => {
          if (++saves >= 2) throw new Error('report disk full');
        },
        5000,
      ),
    ).rejects.toThrow('report disk full');
    expect(objects.size).toBe(0);
  });
});

it('rejects a wrong GET length and closes its unfinished response before continuing cleanup', async () => {
  await withStorage('length', async (target, objects, observed) => {
    const report = newReport({
      service: target.service,
      endpoint: target.endpoint,
      bucket: target.bucket,
    });
    await probe(target, [1024], report, async () => {}, 1000);
    expect(report.samples[0].copy).toBe('failed');
    expect(
      report.samples[0].operations.find(
        (value) => value.stage === 'copied-bytes',
      )?.evidence,
    ).toMatchObject({ name: 'AssertionError' });
    expect(objects.size).toBe(0);
    expect(observed.getClosedBeforeDelete).toBe(true);
  });
});

it('terminates a GET body stalled after headers without claiming a capacity rejection', async () => {
  await withStorage('stalled', async (target, objects) => {
    const report = newReport({
      service: target.service,
      endpoint: target.endpoint,
      bucket: target.bucket,
    });
    await probe(target, [1024], report, async () => {}, 100);
    expect(report.samples[0].copy).toBe('failed');
    expect(
      report.samples[0].operations.find(
        (value) => value.stage === 'copied-bytes',
      )?.evidence,
    ).toMatchObject({ name: 'AbortError' });
    expect(report.boundary.firstRejectedBytes).toBeNull();
    expect(objects.size).toBe(0);
  });
});

it('records version-retaining DELETE instead of claiming physical cleanup', async () => {
  await withStorage('versioned', async (target) => {
    const report = newReport({
      service: target.service,
      endpoint: target.endpoint,
      bucket: target.bucket,
    });
    await probe(target, [1024], report, async () => {}, 1000);
    expect(report.samples[0].cleanup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'version-retained',
          deleteMarker: true,
          versionId: 'retained-version',
        }),
      ]),
    );
  });
});
