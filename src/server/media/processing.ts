import { sep } from 'node:path';
import { mediaError } from './errors.ts';
import type { inspectImageFile } from './file-formats.ts';
import { startSvgPreview } from './svg.ts';
import { startMediaTool } from './tools.ts';
import type { ProcessingSnapshot } from './validation.ts';
import { prepareWatermark } from './watermark.ts';

type ImageFacts = Awaited<ReturnType<typeof inspectImageFile>>;

/** Prepare the first display canvas without changing the original bytes. */
export async function prepareProcessingInput(options: {
  sourcePath: string;
  facts: ImageFacts;
  workspace: string;
  signal: AbortSignal;
  diskLimitBytes: number;
}) {
  const { sourcePath, facts, workspace, signal: stepSignal } = options;
  let { width, height } = facts;
  let previewInput = `${facts.coder}:${sourcePath}[0]`;
  if (facts.format === 'SVG') {
    const previewPath = `${workspace}${sep}preview.png`;
    const tool = startSvgPreview(
      sourcePath,
      previewPath,
      workspace,
      stepSignal,
    );
    const error = await tool.settled;
    if (error) throw error;
    const dimensions = JSON.parse((await tool.child).stdout) as {
      width: number;
      height: number;
    };
    width = dimensions.width;
    height = dimensions.height;
    previewInput = `png:${previewPath}`;
  } else if (facts.animated && ['PNG', 'AVIF'].includes(facts.format)) {
    const previewPath = `${workspace}${sep}preview.png`;
    const tool = startMediaTool(
      'ffmpeg',
      [
        '-v',
        'error',
        '-nostdin',
        '-y',
        '-threads',
        '1',
        ...(facts.format === 'PNG' ? ['-f', 'apng'] : []),
        '-i',
        sourcePath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-threads',
        '1',
        '-f',
        'image2',
        '-vcodec',
        'png',
        previewPath,
      ],
      { workspace, cancelSignal: stepSignal, timeout: 120_000 },
    );
    const error = await tool.settled;
    if (error) throw error;
    previewInput = `png:${previewPath}`;
  }
  return { input: previewInput, width, height };
}

/** The caller owns output persistence, cancellation and awaiting tool settlement. */
export async function startDerivedEncoding(options: {
  input: string;
  facts: Pick<ImageFacts, 'format' | 'animated'>;
  kind: 'thumbnail' | 'compressed' | 'watermark';
  snapshot: ProcessingSnapshot;
  compressedPath?: string;
  watermarksRoot?: string;
  workspace: string;
  signal: AbortSignal;
  diskLimitBytes: number;
}) {
  const { input, facts, kind, snapshot, workspace, signal, diskLimitBytes } =
    options;
  const edge = kind === 'thumbnail' ? 640 : snapshot.maxEdge;
  let sourceArgs = [
    input,
    ...(facts.animated && facts.format === 'GIF' ? ['-coalesce'] : []),
    '-auto-orient',
    '-colorspace',
    'sRGB',
    ...(edge === null ? [] : ['-resize', `${edge}x${edge}>`]),
    ...(kind !== 'thumbnail' && snapshot.outputFormat === 'jpeg'
      ? [
          '-background',
          snapshot.jpegBackground,
          '-alpha',
          'remove',
          '-alpha',
          'off',
        ]
      : []),
  ];
  if (kind === 'watermark') {
    if (snapshot.compressionEnabled) {
      if (!options.compressedPath)
        throw mediaError('MEDIA_VERSIONS_MISSING', '本次任务压缩结果尚未生成');
      const compressedPath = options.compressedPath;
      sourceArgs = [`${snapshot.outputFormat}:${compressedPath}`];
    }
    sourceArgs = await prepareWatermark({
      sourceArgs,
      snapshot,
      watermarksRoot: options.watermarksRoot,
      workspace,
      diskLimitBytes,
      signal,
    });
  }
  return startMediaTool(
    'magick',
    [
      '-limit',
      'memory',
      '256MiB',
      '-limit',
      'map',
      '0',
      '-limit',
      'disk',
      String(Math.floor(diskLimitBytes)),
      '-limit',
      'thread',
      '1',
      ...sourceArgs,
      '-strip',
      '-quality',
      String(kind === 'thumbnail' ? 80 : snapshot.quality),
      `${kind === 'thumbnail' ? 'webp' : snapshot.outputFormat}:-`,
    ],
    {
      buffer: { stdout: false, stderr: true },
      workspace,
      env: { MAGICK_TEMPORARY_PATH: workspace },
      timeout: 120_000,
      forceKillAfterDelay: 1000,
      cancelSignal: signal,
    },
  );
}
