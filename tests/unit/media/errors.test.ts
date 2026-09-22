import { expect, it } from 'vitest';
import { analyzeMediaError } from '../../../src/server/media/errors.ts';

const failure = (code: string, cause?: Error) =>
  Object.assign(new Error('operation failed', { cause }), { code });

it.each([
  [failure('EIO'), 'MEDIA_PROCESS_FAILED', true],
  [
    failure('STORAGE_WRITE_FAILED', failure('EIO')),
    'STORAGE_WRITE_FAILED',
    true,
  ],
  [
    failure('STORAGE_OBJECT_MISSING', failure('ENOENT')),
    'STORAGE_OBJECT_MISSING',
    false,
  ],
  [failure('ENOENT'), 'MEDIA_TOOL_UNAVAILABLE', false],
  [
    failure('STORAGE_WRITE_FAILED', failure('ENOSPC')),
    'INSUFFICIENT_DISK_SPACE',
    false,
  ],
  [failure('EACCES'), 'MEDIA_PROCESS_FAILED', false],
  [failure('MEDIA_OUTPUT_INVALID'), 'MEDIA_OUTPUT_INVALID', false],
  [
    Object.assign(new Error('tool timed out', { cause: failure('EPIPE') }), {
      timedOut: true,
    }),
    'MEDIA_TOOL_TIMEOUT',
    false,
  ],
  [new DOMException('cancelled', 'AbortError'), 'MEDIA_CANCELLED', false],
  [new Error('no space left on device'), 'INSUFFICIENT_DISK_SPACE', false],
  ['unexpected rejection', 'MEDIA_PROCESS_FAILED', false],
] as const)(
  'keeps diagnostics and retry policy for %s',
  (error, code, retryable) => {
    const analysis = analyzeMediaError(error);
    expect(analysis.diagnostic).toBe(
      `${code}: ${error instanceof Error ? error.message : error}`,
    );
    expect(analysis.code).toBe(code);
    expect(analysis.retryable).toBe(retryable);
  },
);

it.each([
  [failure('EIO'), true],
  [failure('STORAGE_READ_FAILED'), true],
  [failure('MEDIA_TOOL_UNAVAILABLE'), true],
  [failure('MEDIA_TOOL_SHUTDOWN_FAILED'), true],
  [failure('MEDIA_RESOURCE_LIMIT'), true],
  [failure('INSUFFICIENT_DISK_SPACE'), true],
  [failure('MEDIA_OUTPUT_INVALID'), false],
  [new SyntaxError('incomplete tool JSON'), false],
])(
  'preserves recovery candidates for operational failures: %s',
  (error, preserveCandidate) => {
    expect(analyzeMediaError(error).preserveCandidate).toBe(preserveCandidate);
  },
);
