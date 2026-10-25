import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { execa } from 'execa';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing.ts';
import { createEditPreviewRuntime } from '../../../src/server/media/edit-preview.ts';
import * as renderer from '../../../src/server/media/edit-render.ts';
import { readMediaObject } from '../../../src/server/media/storage.ts';
import { resolveLocalUploadStorage } from '../../../src/server/storage/defaults.ts';
import { createWatermarkAsset } from '../../../src/server/media/watermark-assets.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import {
  mediaImages,
  mediaJobs,
  mediaSettings,
  mediaWatermarkPreviewRefs,
} from '../../../src/server/media/schema.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
let previews: ReturnType<typeof createEditPreviewRuntime>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
  app.runtime.watermarksRoot = join(
    app.runtime.temporaryRoot,
    'test-watermarks',
  );
  await mkdir(app.runtime.watermarksRoot);
  previews = createEditPreviewRuntime(app.runtime, (operation, signal) =>
    operation(signal),
  );
  await previews.ready;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await previews?.close();
  await app?.close();
});
async function accept(args: string[], extension = 'png') {
  const path = join(app.runtime.temporaryRoot, `${randomUUID()}.${extension}`);
  await execa('magick', [...args, path]);
  return { ...(await app.accept(path)), path };
}
function original(imageId: string) {
  return app
    .state(imageId)
    .versions.find((version) => version.kind === 'original')!.saved!.object;
}
async function facts(bytes: Buffer) {
  return (
    await execa('magick', ['png:-', '-format', '%w %h', 'info:'], {
      input: bytes,
    })
  ).stdout;
}
function gate<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

describe('owner image edit preview runtime', () => {
  it('renders an original preview without reading site watermark settings', async () => {
    const source = await accept(['-size', '100x80', 'xc:white']);
    app.db.delete(mediaSettings).run();
    const png = await previews.render(
      source.imageId,
      { sourceObjectId: source.objectId, recipe: emptyImageEditRecipe() },
      new AbortController().signal,
    );
    expect(await facts(png)).toBe('100 80');
  });
  it('returns a transparent PNG preview after encoding the actual WebP mother image', async () => {
    const input = join(app.runtime.temporaryRoot, 'transparent.webp');
    await execa('magick', [
      '-size',
      '60x40',
      'xc:none',
      '-fill',
      'red',
      '-draw',
      'rectangle 0,0 10,10',
      '-define',
      'webp:lossless=true',
      `webp:${input}`,
    ]);
    const source = await app.accept(input);
    const result = await previews.render(
      source.imageId,
      { sourceObjectId: source.objectId, recipe: emptyImageEditRecipe() },
      new AbortController().signal,
    );
    expect(result.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    const output = join(app.runtime.temporaryRoot, 'transparent-preview.png');
    await writeFile(output, result);
    expect(
      Number(
        (
          await execa('magick', [
            `png:${output}`,
            '-format',
            '%[fx:p{30,30}.a]',
            'info:',
          ])
        ).stdout,
      ),
    ).toBe(0);
    expect(app.state(source.imageId).image.format).toBe('WEBP');
  });
  it('returns actual masked PNG at no more than 1280 pixels without changing the library', async () => {
    const source = await accept(['-size', '1600x1000', 'xc:red']);
    const before = {
      images: app.db.select().from(mediaImages).all(),
      jobs: app.db.select().from(mediaJobs).all(),
      state: app.state(source.imageId),
    };
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'private',
      x: 0.2,
      y: 0.2,
      width: 0.2,
      height: 0.2,
      mode: 'solid',
      strength: 20,
      color: '#000000',
    });
    const png = await previews.render(
      source.imageId,
      { sourceObjectId: original(source.imageId).id, recipe },
      new AbortController().signal,
    );
    expect(await facts(png)).toBe('1280 800');
    const pixel = (
      await execa(
        'magick',
        ['png:-', '-format', '%[pixel:p{350,220}]', 'info:'],
        { input: png },
      )
    ).stdout;
    expect(pixel).toMatch(/(?:0,0,0|gray\(0\))/);
    expect({
      images: app.db.select().from(mediaImages).all(),
      jobs: app.db.select().from(mediaJobs).all(),
      state: app.state(source.imageId),
    }).toEqual(before);
    expect(
      await readdir(join(app.runtime.temporaryRoot, 'media-edit-previews')),
    ).toEqual([]);
  });
  it('corrects the JPEG display direction before rendering normalized masks', async () => {
    const path = join(app.runtime.temporaryRoot, 'oriented.jpg');
    await execa('magick', ['-size', '80x40', 'xc:white', path]);
    await execa('exiftool', ['-overwrite_original', '-Orientation#=6', path]);
    const image = await app.accept(path);
    const png = await previews.render(
      image.imageId,
      {
        sourceObjectId: original(image.imageId).id,
        recipe: emptyImageEditRecipe(),
      },
      new AbortController().signal,
    );
    expect(await facts(png)).toBe('40 80');
  });
  it('previews the decoded JPEG mother image including the actual quality-95 encoding step', async () => {
    const source = await accept(
      [
        '-size',
        '100x80',
        'gradient:red-blue',
        '-fill',
        'yellow',
        '-draw',
        'rectangle 10,10 70,70',
      ],
      'jpg',
    );
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'private',
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.3,
      mode: 'solid',
      strength: 20,
      color: '#272343',
    });
    const workspace = join(app.runtime.temporaryRoot, 'expected-jpeg-edit');
    await mkdir(workspace);
    const mother = await renderer.renderEditedFile({
      sourcePath: source.path,
      format: 'JPEG',
      recipe,
      workspace,
      outputPath: join(workspace, 'mother.jpg'),
      signal: new AbortController().signal,
      diskLimitBytes: 256 * 1024 * 1024,
    });
    const expected = (
      await execa('magick', [`jpeg:${mother.path}`, '-depth', '8', 'rgb:-'], {
        encoding: 'buffer',
      })
    ).stdout;
    const png = await previews.render(
      source.imageId,
      { sourceObjectId: original(source.imageId).id, recipe },
      new AbortController().signal,
    );
    const actual = (
      await execa('magick', ['png:-', '-depth', '8', 'rgb:-'], {
        input: png,
        encoding: 'buffer',
      })
    ).stdout;
    expect(Buffer.compare(actual, expected)).toBe(0);
  });
  it('previews custom edits followed by the current copy or historical overwrite watermark recipe', async () => {
    patchMediaSettings(app.db, {
      defaultLinkVersion: 'original',
      watermarkMode: 'text',
      watermarkText: 'HISTORY',
      watermarkFont: 'latin',
      watermarkFontSize: 10,
      watermarkOpacity: 100,
      watermarkPosition: 'center',
      watermarkMargin: 0,
      watermarkColor: '#FF0000',
      compressionEnabled: true,
      quality: 100,
    });
    const source = await accept(['-size', '240x160', 'xc:white']);
    patchMediaSettings(app.db, {
      defaultLinkVersion: 'original',
      watermarkText: 'CURRENT',
      watermarkColor: '#0000FF',
      compressionEnabled: false,
    });
    const recipe = emptyImageEditRecipe();
    recipe.regions.push({
      id: 'mask',
      x: 0.2,
      y: 0.25,
      width: 0.6,
      height: 0.5,
      mode: 'solid',
      strength: 20,
      color: '#000000',
    });
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      text: 'EDIT',
      font: 'latin',
      color: '#ffffff',
      x: 0.5,
      y: 0.5,
      fontSize: 0.12,
      opacity: 1,
    };
    const input = { sourceObjectId: original(source.imageId).id, recipe };
    const originalPreview = await previews.render(
      source.imageId,
      input,
      new AbortController().signal,
    );
    const copyPreview = await previews.render(
      source.imageId,
      { ...input, target: 'watermark', mode: 'copy' },
      new AbortController().signal,
    );
    const overwritePreview = await previews.render(
      source.imageId,
      { ...input, target: 'watermark', mode: 'overwrite' },
      new AbortController().signal,
    );
    async function colored(bytes: Buffer) {
      const rgb = (
        await execa('magick', ['png:-', '-depth', '8', 'rgb:-'], {
          input: bytes,
          encoding: 'buffer',
        })
      ).stdout;
      let red = 0,
        blue = 0;
      for (let i = 0; i < rgb.length; i += 3) {
        if (rgb[i] > 180 && rgb[i + 1] < 80 && rgb[i + 2] < 80) red++;
        if (rgb[i + 2] > 180 && rgb[i] < 80 && rgb[i + 1] < 80) blue++;
      }
      return { red, blue };
    }
    expect(await colored(originalPreview)).toEqual({ red: 0, blue: 0 });
    const copyColor = await colored(copyPreview),
      overwriteColor = await colored(overwritePreview);
    expect(copyColor.red).toBe(0);
    expect(copyColor.blue).toBeGreaterThan(20);
    expect(overwriteColor.red).toBeGreaterThan(20);
    expect(overwriteColor.blue).toBe(0);
  });
  it('reports unavailable watermark versions instead of returning an original as a fallback', async () => {
    const source = await accept(['-size', '100x80', 'xc:white']);
    const input = {
      sourceObjectId: original(source.imageId).id,
      recipe: emptyImageEditRecipe(),
      target: 'watermark' as const,
    };
    await expect(
      previews.render(
        source.imageId,
        { ...input, mode: 'copy' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: 'MEDIA_EDIT_WATERMARK_UNAVAILABLE',
      status: 409,
    });
    await expect(
      previews.render(
        source.imageId,
        { ...input, mode: 'overwrite' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: 'MEDIA_EDIT_WATERMARK_UNAVAILABLE',
      status: 409,
    });
  });
  it('rejects a stale source object and reports rendering errors without changing the asset', async () => {
    const source = await accept(['-size', '100x80', 'xc:white']);
    const before = app.state(source.imageId);
    await expect(
      previews.render(
        source.imageId,
        { sourceObjectId: randomUUID(), recipe: emptyImageEditRecipe() },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_EDIT_SOURCE_CHANGED' });
    const recipe = emptyImageEditRecipe();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      text: 'W'.repeat(100),
      fontSize: 0.2,
    };
    await expect(
      previews.render(
        source.imageId,
        { sourceObjectId: original(source.imageId).id, recipe },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_WATERMARK_TOO_LARGE' });
    expect(app.state(source.imageId)).toEqual(before);
  });
  it('finishes from its private source copy even when the published source file disappears', async () => {
    const source = await accept(['-size', '100x80', 'xc:red']);
    const object = original(source.imageId);
    const read = await readMediaObject(
      app.runtime,
      resolveLocalUploadStorage(app.db),
      object.key,
      'image/png',
    );
    const closed = once(read.stream, 'close');
    read.stream.destroy();
    await closed;
    const entered = gate<Parameters<typeof renderer.renderEditedFile>[0]>(),
      release = gate();
    const render = renderer.renderEditedFile;
    vi.spyOn(renderer, 'renderEditedFile').mockImplementationOnce(
      async (options) => {
        entered.resolve(options);
        await release.promise;
        return render(options);
      },
    );
    const pending = previews.render(
      source.imageId,
      { sourceObjectId: object.id, recipe: emptyImageEditRecipe() },
      new AbortController().signal,
    );
    const options = await entered.promise;
    expect(options.sourcePath).toContain('media-edit-previews');
    expect(await readFile(options.sourcePath)).toEqual(
      await readFile(read.path!),
    );
    await rm(read.path!);
    release.resolve();
    expect(await facts(await pending)).toBe('100 80');
  });
  it('retains Logo references while active and close waits for cancellation cleanup', async () => {
    const source = await accept(['-size', '100x80', 'xc:white']);
    const logoPath = join(app.runtime.temporaryRoot, 'logo.png');
    await execa('magick', ['-size', '20x10', 'xc:blue', logoPath]);
    const logo = await createWatermarkAsset(
      {
        db: app.db,
        watermarksRoot: app.runtime.watermarksRoot!,
        hasUploadReference: () => false,
      },
      await readFile(logoPath),
      new AbortController().signal,
    );
    const recipe = emptyImageEditRecipe();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      kind: 'image',
      assetId: logo.id,
      x: 0.5,
      y: 0.5,
    };
    const entered = gate(),
      release = gate();
    const render = renderer.renderEditedFile;
    vi.spyOn(renderer, 'renderEditedFile').mockImplementationOnce(
      async (options) => {
        entered.resolve();
        await release.promise;
        return render(options);
      },
    );
    const pending = previews.render(
      source.imageId,
      { sourceObjectId: original(source.imageId).id, recipe },
      new AbortController().signal,
    );
    const failure = expect(pending).rejects.toBeInstanceOf(Error);
    await entered.promise;
    expect(app.db.select().from(mediaWatermarkPreviewRefs).all()).toHaveLength(
      1,
    );
    let closed = false;
    const closing = previews.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release.resolve();
    await failure;
    await closing;
    expect(app.db.select().from(mediaWatermarkPreviewRefs).all()).toHaveLength(
      0,
    );
    expect(
      await readdir(join(app.runtime.temporaryRoot, 'media-edit-previews')),
    ).toEqual([]);
  });
  it('recovers only its own temporary directories and Logo references', async () => {
    await previews.close();
    const logoPath = join(app.runtime.temporaryRoot, 'recovery-logo.png');
    await execa('magick', ['-size', '20x10', 'xc:blue', logoPath]);
    const logo = await createWatermarkAsset(
      {
        db: app.db,
        watermarksRoot: app.runtime.watermarksRoot!,
        hasUploadReference: () => false,
      },
      await readFile(logoPath),
      new AbortController().signal,
    );
    const stale = join(
      app.runtime.temporaryRoot,
      'media-edit-previews',
      randomUUID(),
    );
    const other = join(app.runtime.temporaryRoot, 'media-another-job');
    await mkdir(stale);
    await mkdir(other);
    await writeFile(join(stale, 'partial'), 'preview');
    await writeFile(join(other, 'keep'), 'persistent job');
    app.db
      .insert(mediaWatermarkPreviewRefs)
      .values([
        { previewId: `edit-preview-${randomUUID()}`, assetId: logo.id },
        { previewId: 'another-preview', assetId: logo.id },
      ])
      .run();
    previews = createEditPreviewRuntime(app.runtime, (operation, signal) =>
      operation(signal),
    );
    await previews.ready;
    await expect(access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(other, 'keep'), 'utf8')).toBe('persistent job');
    expect(
      app.db
        .select()
        .from(mediaWatermarkPreviewRefs)
        .where(
          and(
            eq(mediaWatermarkPreviewRefs.previewId, 'another-preview'),
            eq(mediaWatermarkPreviewRefs.assetId, logo.id),
          ),
        )
        .all(),
    ).toHaveLength(1);
  });
  it('retains unfinished tool work and Logo references until a later cleanup can settle it', async () => {
    const source = await accept(['-size', '100x80', 'xc:white']);
    const logoPath = join(app.runtime.temporaryRoot, 'failed-tool-logo.png');
    await execa('magick', ['-size', '20x10', 'xc:blue', logoPath]);
    const logo = await createWatermarkAsset(
      {
        db: app.db,
        watermarksRoot: app.runtime.watermarksRoot!,
        hasUploadReference: () => false,
      },
      await readFile(logoPath),
      new AbortController().signal,
    );
    const recipe = emptyImageEditRecipe();
    recipe.watermark = {
      ...recipe.watermark,
      enabled: true,
      kind: 'image',
      assetId: logo.id,
      x: 0.5,
      y: 0.5,
    };
    let workspace = '';
    vi.spyOn(renderer, 'renderEditedFile').mockImplementationOnce(
      async (options) => {
        workspace = options.workspace;
        throw Object.assign(new Error('native tool could not settle'), {
          code: 'MEDIA_TOOL_SHUTDOWN_FAILED',
        });
      },
    );
    await expect(
      previews.render(
        source.imageId,
        { sourceObjectId: original(source.imageId).id, recipe },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_TOOL_SHUTDOWN_FAILED' });
    await expect(access(join(workspace, 'source'))).resolves.toBeUndefined();
    expect(app.db.select().from(mediaWatermarkPreviewRefs).all()).toHaveLength(
      1,
    );
    await previews.close();
    expect(app.db.select().from(mediaWatermarkPreviewRefs).all()).toHaveLength(
      0,
    );
  });
});
