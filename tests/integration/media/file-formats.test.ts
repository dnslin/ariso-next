import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { execa } from 'execa';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  identifyImageFile,
  inspectImageFile,
} from '../../../src/server/media/file-formats.ts';

const fixtures = resolve('tests/fixtures/media-formats');
const { samples } = JSON.parse(
  await readFile(join(fixtures, 'manifest.json'), 'utf8'),
);
let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ariso-file-formats-'));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('real image container classification', () => {
  for (const sample of samples) {
    it(sample.id, async () => {
      const path = join(fixtures, sample.file);
      const before = await readFile(path);
      const facts = await inspectImageFile(path, workspace);
      expect(facts).toMatchObject({
        format: sample.expected.format,
        width: sample.expected.width,
        height: sample.expected.height,
        classification: {
          static: 'static',
          animation: 'animated',
          container: 'preview_only',
        }[
          sample.expected.classification as 'static' | 'animation' | 'container'
        ],
        animated: sample.expected.classification === 'animation',
        pageCount: sample.expected.pages ?? sample.expected.frames ?? 1,
      });
      expect(await readFile(path)).toEqual(before);
    });
  }
  it('ignores misleading extensions', async () => {
    const path = join(workspace, 'video.mp4');
    await copyFile(join(fixtures, 'source.png'), path);
    expect(await identifyImageFile(path, workspace)).toMatchObject({
      format: 'PNG',
      mime: 'image/png',
      extension: 'png',
    });
  });
  it('accepts dangerous SVG as an original without rendering its content', async () => {
    const path = join(workspace, 'image');
    await writeFile(
      path,
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="file:///etc/passwd"/></svg>',
    );
    expect(await identifyImageFile(path, workspace)).toMatchObject({
      format: 'SVG',
      width: null,
      height: null,
    });
    expect(await inspectImageFile(path, workspace)).toMatchObject({
      classification: 'preview_only',
      pageCount: 1,
    });
  });
  it('rejects unknown bytes with an identification error', async () => {
    const path = join(workspace, 'unknown');
    await writeFile(path, Buffer.from([1, 2, 3, 4]));
    await expect(identifyImageFile(path, workspace)).rejects.toMatchObject({
      code: 'MEDIA_IDENTIFICATION_FAILED',
    });
  });
  it('rejects non-image documents', async () => {
    const path = join(workspace, 'image.png');
    await writeFile(
      path,
      '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
    );
    await expect(identifyImageFile(path, workspace)).rejects.toThrow(
      /Unsupported image format/,
    );
  });
  it('rejects a real H.264 MP4 video even with an image filename', async () => {
    const path = join(workspace, 'image.png');
    await execa('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=red:s=16x16',
      '-frames:v',
      '1',
      '-c:v',
      'libx264',
      '-f',
      'mp4',
      path,
    ]);
    await expect(identifyImageFile(path, workspace)).rejects.toMatchObject({
      code: 'MEDIA_FORMAT_UNSUPPORTED',
    });
  });
  it('rejects a text document masquerading as an image', async () => {
    const path = join(workspace, 'document.jpg');
    await writeFile(path, 'This is a document, not an image.');
    await expect(identifyImageFile(path, workspace)).rejects.toMatchObject({
      code: 'MEDIA_FORMAT_UNSUPPORTED',
    });
  });
});
