import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
export async function waitForImageWorkflow(
  read,
  predicate,
  label,
  timeout = 120000,
) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(value)}`);
    await delay(100);
  } while (true);
}

/** All assets traverse owner submission, file reception and the real media worker. */
export async function createImageWorkflowFixture(page, config, report) {
  const { cookies } = await page.cdp('Network.getCookies', {
    urls: [config.origin],
  });
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  assert.ok(cookie, 'Real UI sign-in supplies the owner Cookie');
  const prefix = `image-workflows-${randomUUID().slice(0, 8)}`;
  const directory = join(config.output, prefix);
  await mkdir(directory, { recursive: true });
  const images = [];
  let previousSettings, album, tag;
  const patch = {
    compressionEnabled: true,
    outputFormat: 'webp',
    quality: 88,
    maxEdge: null,
    watermarkMode: 'text',
    watermarkText: 'ARISO WORKFLOW',
    watermarkFont: 'latin',
    defaultLinkVersion: 'compressed',
    concurrency: 1,
  };
  async function response(path, init = {}) {
    return fetch(new URL(path, config.origin), {
      ...init,
      headers: { cookie, origin: config.origin, ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(120000),
    });
  }
  async function json(path, method = 'GET', body, status = 200) {
    const result = await response(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    const text = await result.text();
    assert.equal(result.status, status, `${method} ${path}: ${text}`);
    return JSON.parse(text);
  }
  const detail = (id) => json(`/api/images/${id}`);
  async function upload(name, path, visibility, relations = false) {
    const bytes = await readFile(path);
    const submission = await json(
      '/api/uploads/submissions',
      'POST',
      {
        requestId: randomUUID(),
        files: [
          {
            queueItemId: randomUUID(),
            originalName: name,
            declaredSize: bytes.length,
            declaredMime: name.endsWith('.gif') ? 'image/gif' : 'image/png',
          },
        ],
        visibility,
        albumIds: relations ? [album.id] : [],
        tagIds: relations ? [tag.id] : [],
      },
      201,
    );
    const body = new FormData();
    body.set('file', new Blob([bytes]), name);
    const received = await response(
      `/api/uploads/sessions/${submission.sessions[0].id}/content`,
      { method: 'POST', body },
    );
    const accepted = await received.json();
    assert.equal(received.status, 202, JSON.stringify(accepted));
    assert.ok(accepted.imageId);
    images.push(accepted.imageId);
    const ready = await waitForImageWorkflow(
      () => detail(accepted.imageId),
      (value) => {
        assert.notEqual(
          value.processingStatus,
          'failed',
          JSON.stringify(value.latestFailedJob),
        );
        return value.processingStatus === 'ready';
      },
      'Real upload completes its media worker',
    );
    assert.equal(ready.visibility, visibility);
    report.checks.push({
      scenario: 'formal-upload',
      imageId: ready.id,
      originalName: ready.originalName,
      width: ready.width,
      height: ready.height,
      visibility,
      versions: ready.versions
        .filter((version) => version.saved)
        .map((version) => version.kind),
    });
    return ready;
  }
  async function bytes(url) {
    const result = await response(url);
    assert.equal(
      result.status,
      200,
      `Owner reads ${new URL(url, config.origin).pathname}`,
    );
    const value = Buffer.from(await result.arrayBuffer());
    return { value, hash: createHash('sha256').update(value).digest('hex') };
  }
  async function dimensions(url, label) {
    const content = await bytes(url);
    const path = join(directory, `${label}.webp`);
    await writeFile(path, content.value);
    const identified = await run('magick', [
      'identify',
      '-format',
      '%w %h',
      path,
    ]);
    const [width, height] = identified.stdout.trim().split(/\s+/).map(Number);
    return {
      width,
      height,
      hash: content.hash,
      byteSize: content.value.length,
    };
  }
  async function dispose() {
    for (const id of images) {
      const current = await response(`/api/images/${id}`);
      if (current.status === 404) continue;
      assert.equal(current.status, 200);
      if (!(await current.json()).trashedAt)
        await json(`/api/images/${id}/trash`, 'POST');
      const removal = await response(`/api/images/${id}`, { method: 'DELETE' });
      assert.ok([200, 202].includes(removal.status), await removal.text());
      await waitForImageWorkflow(
        () => json(`/api/images/${id}/cleanup`),
        (state) => {
          assert.notEqual(state.status, 'failed', JSON.stringify(state));
          return state.status === 'succeeded';
        },
        'Formal permanent deletion removes the fixture',
      );
    }
    if (album) {
      const result = await response(`/api/albums/${album.id}`, {
        method: 'DELETE',
      });
      assert.equal(result.status, 200);
    }
    if (tag) {
      const result = await response(`/api/tags/${tag.id}`, {
        method: 'DELETE',
      });
      assert.equal(result.status, 200);
    }
    if (previousSettings)
      await json(
        '/api/settings/media',
        'PATCH',
        Object.fromEntries(
          Object.keys(patch).map((key) => [key, previousSettings[key]]),
        ),
      );
  }
  try {
    previousSettings = await json('/api/settings/media');
    await json('/api/settings/media', 'PATCH', patch);
    album = (
      await json(
        '/api/albums',
        'POST',
        { name: `${prefix} 相册`, description: '真实四项图片流程回归' },
        201,
      )
    ).album;
    tag = (await json('/api/tags', 'POST', { name: `${prefix} 标签` }, 201))
      .tag;
    const paths = Object.fromEntries(
      ['public', 'private', 'small', 'gif', 'replacement', 'held'].map(
        (name) => [
          name,
          join(directory, `${name}.${name === 'gif' ? 'gif' : 'png'}`),
        ],
      ),
    );
    for (const [name, size, colors] of [
      ['public', '1600x1000', 'gradient:#8FC6BA-#F3DB97'],
      ['private', '1000x1600', 'gradient:#4A426A-#ABCBD9'],
      ['small', '300x200', 'gradient:#91C8A0-#F7E0A4'],
      ['gif', '320x200', 'xc:#97BFA3'],
      ['replacement', '1600x1000', 'gradient:#E0A2A7-#6C88A7'],
      ['held', '1600x1000', 'gradient:#D1C38A-#63828E'],
    ])
      await run('magick', [
        '-size',
        size,
        colors,
        '-fill',
        '#263A4060',
        '-draw',
        'rectangle 40,40 220,140',
        paths[name],
      ]);
    const publicImage = await upload(
      `${prefix}-public.png`,
      paths.public,
      'public',
    );
    const privateImage = await upload(
      `${prefix}-private.png`,
      paths.private,
      'private',
      true,
    );
    const smallImage = await upload(
      `${prefix}-small.png`,
      paths.small,
      'public',
    );
    const gifImage = await upload(`${prefix}-preview.gif`, paths.gif, 'public');
    return {
      prefix,
      directory,
      paths,
      publicImage,
      privateImage,
      smallImage,
      gifImage,
      json,
      response,
      detail,
      bytes,
      dimensions,
      dispose,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      report.fixtureCleanupError = cleanup.stack ?? String(cleanup);
    }
    throw error;
  }
}

export async function inspectWorkflowZip(path, expected) {
  const code =
    'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps([{"name":i.filename,"bytes":i.file_size} for i in z.infolist() if not i.is_dir()],ensure_ascii=False))';
  const result = await run('/usr/bin/python3', ['-c', code, path]);
  const entries = JSON.parse(result.stdout);
  assert.equal(
    entries.length,
    expected,
    'Saved browser ZIP unpacks to the explicit file count',
  );
  assert.ok(entries.every((entry) => entry.bytes > 0));
  return entries;
}
