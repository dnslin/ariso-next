import { resolve } from 'node:path';
import { startMediaTool } from './tools.ts';

/** Caller must await settled before removing the job workspace. */
export function startSvgPreview(
  sourcePath: string,
  outputPath: string,
  workspace: string,
  signal: AbortSignal,
  renderWidth?: number,
  fitMode: 'width' | 'longest-edge' = 'width',
) {
  return startMediaTool(
    'node',
    [
      resolve('scripts/media/svg-render.mjs'),
      sourcePath,
      outputPath,
      renderWidth === undefined ? 'preview' : String(renderWidth),
      fitMode,
    ],
    {
      workspace,
      cancelSignal: signal,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );
}
