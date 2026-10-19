const assert = require('node:assert/strict');
const { test } = require('node:test');
const plugin = require('../index.cjs');

function ready(id = 'image-1') {
  const url = `https://public.example/i/${id}`;
  return {
    imageId: id,
    status: 'ready',
    url,
    actualVersion: 'compressed',
    defaultResolution: { available: true, code: null },
    versions: {
      original: { url: `${url}?type=original`, mime: 'image/png' },
      compressed: { url: `${url}?type=compressed`, mime: 'image/webp' },
    },
    processing: { status: 'succeeded', warnings: [] },
    requestId: 'request-1',
  };
}

function fixture(request, settings = {}) {
  let uploader;
  const events = [];
  const logs = [];
  const ctx = {
    output: [{ fileName: '旅行 截图.png', buffer: Buffer.from('image-bytes') }],
    getConfig: () => ({
      siteUrl: 'http://localhost:3000/',
      token: 'test-token',
      ...settings,
    }),
    helper: {
      uploader: {
        register: (id, value) => {
          assert.equal(id, 'ariso');
          uploader = value;
        },
      },
    },
    request,
    emit: (...event) => events.push(event),
    log: {
      info: (value) => logs.push(value),
      warn: (value) => logs.push(value),
    },
  };
  const registered = plugin(ctx);
  registered.register();
  assert.equal(registered.uploader, 'ariso');
  return { ctx, uploader, events, logs };
}

test('uploads transformed bytes publicly and returns the server-selected fixed version', async () => {
  let received;
  const f = fixture(async (options) => {
    received = options;
    return { status: 201, data: ready() };
  });
  await f.uploader.handle(f.ctx);
  assert.equal(received.url, 'http://localhost:3000/api/upload');
  assert.equal(received.headers.Authorization, 'Bearer test-token');
  assert.equal(received.formData.visibility, 'public');
  assert.deepEqual(received.formData.file.value, Buffer.from('image-bytes'));
  assert.equal(received.formData.file.options.filename, '旅行 截图.png');
  assert.equal(received.timeout, 3000000);
  assert.equal(received.maxRedirects, 0);
  assert.equal('Content-Type' in received.headers, false);
  assert.equal('storageId' in received.formData, false);
  assert.equal(
    f.ctx.output[0].url,
    'https://public.example/i/image-1?type=compressed',
  );
  assert.equal(f.ctx.output[0].imgUrl, f.ctx.output[0].url);
});

test('does not output a default URL when the image was saved but the selected version is unavailable', async () => {
  const body = ready();
  body.actualVersion = null;
  body.defaultResolution = { available: false, code: 'VERSION_UNAVAILABLE' };
  const f = fixture(async () => ({ status: 201, data: body }));
  await assert.rejects(f.uploader.handle(f.ctx), /已保存.*image-1/);
  assert.deepEqual(f.ctx.output, []);
});

test('stops a partial batch without exposing a short URL list or retrying', async () => {
  let count = 0;
  const f = fixture(async () => {
    count++;
    return count === 1
      ? { status: 201, data: ready() }
      : {
          status: 413,
          data: {
            imageId: null,
            status: 'not_created',
            error: {
              code: 'UPLOAD_FILE_TOO_LARGE',
              stage: 'receiving',
              message: 'too large',
            },
            requestId: 'request-2',
          },
        };
  });
  f.ctx.output.push(
    { fileName: 'second.png', buffer: Buffer.from('2') },
    { fileName: 'third.png', buffer: Buffer.from('3') },
  );
  await assert.rejects(f.uploader.handle(f.ctx), /UPLOAD_FILE_TOO_LARGE/);
  assert.equal(count, 2);
  assert.deepEqual(f.ctx.output, []);
  assert.match(JSON.stringify(f.logs), /image-1/);
  assert.doesNotMatch(JSON.stringify([f.logs, f.events]), /test-token/);
});

test('applies current targets and an explicit version even when the site default is unavailable', async () => {
  const body = ready();
  body.actualVersion = null;
  body.defaultResolution.available = false;
  let received;
  const f = fixture(
    async (options) => {
      received = options;
      return { status: 201, data: body };
    },
    {
      storageId: ' store ',
      albumId: 'album',
      tag: '旅行,日常',
      linkVersion: 'original',
      timeoutSeconds: '12',
    },
  );
  await f.uploader.handle(f.ctx);
  assert.equal(received.formData.storageId, 'store');
  assert.equal(received.formData.albumId, 'album');
  assert.equal(received.formData.tag, '旅行,日常');
  assert.equal(received.timeout, 12000);
  assert.equal(f.ctx.output[0].imgUrl, body.versions.original.url);
});

test('keeps metadata warnings as warnings, without exposing credentials in diagnostic text', async () => {
  const body = ready();
  body.processing.warnings = [
    {
      code: 'METADATA_WARNING',
      stage: 'metadata',
      message: 'metadata unavailable test-token',
    },
  ];
  const f = fixture(async () => ({ status: 201, data: body }));
  await f.uploader.handle(f.ctx);
  assert.equal(f.ctx.output.length, 1);
  assert.match(JSON.stringify(f.logs), /METADATA_WARNING/);
  assert.doesNotMatch(JSON.stringify(f.logs), /test-token/);
});

test('preserves safe network diagnostics without forwarding a raw request or retrying', async () => {
  let count = 0;
  const f = fixture(async () => {
    count++;
    throw {
      message: 'socket hang up',
      config: { headers: { Authorization: 'Bearer test-token' } },
    };
  });
  await assert.rejects(f.uploader.handle(f.ctx), /socket hang up.*结果未确认/);
  assert.equal(count, 1);
  assert.deepEqual(f.ctx.output, []);
  assert.doesNotMatch(JSON.stringify(f.events), /test-token/);
});

test('does not treat HTML, an undefined response, or incomplete success JSON as an image URL', async () => {
  for (const response of [
    undefined,
    { status: 200, data: '<html>login</html>' },
    { status: 201, data: { status: 'ready', url: 'https://example.com' } },
  ]) {
    const f = fixture(async () => response);
    await assert.rejects(f.uploader.handle(f.ctx), /结果未确认/);
    assert.deepEqual(f.ctx.output, []);
  }
});

test('preflights the whole batch before creating an image', async () => {
  let count = 0;
  const f = fixture(async () => {
    count++;
    return { status: 201, data: ready() };
  });
  f.ctx.output.push({ fileName: 'missing.png' });
  await assert.rejects(f.uploader.handle(f.ctx), /非空/);
  assert.equal(count, 0);
  assert.deepEqual(f.ctx.output, []);
});

test('handles base64 input and retains input order only for a complete successful batch', async () => {
  let count = 0;
  const f = fixture(async (options) => {
    count++;
    assert.equal(f.ctx.output.length, 0);
    if (count === 2)
      assert.equal(options.formData.file.value.toString(), 'second-bytes');
    return { status: 201, data: ready(`image-${count}`) };
  });
  f.ctx.output.push({
    fileName: 'second.webp',
    base64Image: Buffer.from('second-bytes').toString('base64'),
  });
  await f.uploader.handle(f.ctx);
  assert.deepEqual(
    f.ctx.output.map((item) => item.imgUrl),
    [
      'https://public.example/i/image-1?type=compressed',
      'https://public.example/i/image-2?type=compressed',
    ],
  );
});

test('rejects invalid configuration before sending a request and discloses public uploads in the config UI', async () => {
  for (const config of [
    { token: '' },
    { token: 'Bearer secret' },
    { siteUrl: 'https://example.com/subpath' },
    { siteUrl: 'https://user:secret@example.com/' },
    { linkVersion: 'missing' },
    { timeoutSeconds: '-1' },
  ]) {
    const f = fixture(async () => {
      assert.fail('invalid config sent a request');
    }, config);
    await assert.rejects(f.uploader.handle(f.ctx));
    assert.deepEqual(f.ctx.output, []);
  }
  const f = fixture(async () => {});
  const fields = f.uploader.config(f.ctx);
  assert.match(
    fields.find((field) => field.name === 'siteUrl').message,
    /将公开/,
  );
  assert.equal(fields.find((field) => field.name === 'token').type, 'password');
});
