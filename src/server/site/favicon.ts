import { join } from 'node:path';
import type { inspectImageFile } from '../media/file-formats.ts';
import { startMediaTool } from '../media/tools.ts';

type Facts = Awaited<ReturnType<typeof inspectImageFile>>;

/** Generate the tab-sized asset from validated input; never quantize its colors. */
export async function generateFavicon(
  source: string,
  facts: Facts,
  workspace: string,
  signal: AbortSignal,
) {
  async function run(args: string[]) {
    const tool = startMediaTool(
      'magick',
      [
        '-limit',
        'memory',
        '256MiB',
        '-limit',
        'map',
        '0',
        '-limit',
        'thread',
        '1',
        '-regard-warnings',
        ...args,
      ],
      { workspace, cancelSignal: signal, timeout: 30_000 },
    );
    const error = await tool.settled;
    if (error) throw error;
    return (await tool.child).stdout;
  }

  let input =
    facts.format === 'SVG'
      ? `png:${join(workspace, 'preview.png')}`
      : `${facts.coder}:${source}`;
  if (facts.format === 'ICO') {
    const output = await run([
      '-ping',
      input,
      '-format',
      '%s %w %h\n',
      'info:',
    ]);
    const frames = output
      .trim()
      .split('\n')
      .map((line) => {
        const [index, width, height] = line.split(' ').map(Number);
        return { index, size: Math.min(width, height) };
      });
    // Prefer a native 48 px frame, then the next larger frame; only upscale
    // when every frame is smaller than the output.
    const sufficient = frames.filter((frame) => frame.size >= 48);
    const selected = sufficient.length
      ? sufficient.sort((a, b) => a.size - b.size)[0]
      : frames.sort((a, b) => b.size - a.size)[0];
    input += `[${selected.index}]`;
  }
  const path = join(workspace, 'favicon.png');
  await run([
    input,
    '-resize',
    '48x48',
    '-background',
    'none',
    '-gravity',
    'center',
    '-extent',
    '48x48',
    '-define',
    'png:compression-level=9',
    '-define',
    'png:exclude-chunks=date,time',
    `png:${path}`,
  ]);
  // Preserve color interpretation while removing unrelated metadata. Gamma and
  // sRGB are individual PNG tags, so copy them back after the group deletion.
  const cleanup = startMediaTool(
    'exiftool',
    [
      '-all=',
      '--ICC_Profile:all',
      '-tagsfromfile',
      '@',
      '-PNG:Gamma',
      '-PNG:SRGBRendering',
      '-overwrite_original',
      path,
    ],
    { workspace, cancelSignal: signal, timeout: 30_000 },
  );
  const error = await cleanup.settled;
  if (error) throw error;
  return { path, extension: 'png', mime: 'image/png' };
}
