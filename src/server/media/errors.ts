export function mediaError(code: string, message: string, cause?: unknown) {
  return Object.assign(new Error(message, { cause }), { code });
}

/** Analyze native, storage and tool errors once; callers do not parse diagnostics. */
export function analyzeMediaError(error: unknown) {
  let code = 'MEDIA_PROCESS_FAILED';
  let temporary = false;
  let permanent = false;
  let current = error;
  while (current instanceof Error) {
    const detail = current as Error & {
      code?: string;
      timedOut?: boolean;
      isCanceled?: boolean;
    };
    if (
      typeof detail.code === 'string' &&
      (detail.code.startsWith('MEDIA_') ||
        detail.code.startsWith('STORAGE_') ||
        detail.code === 'INSUFFICIENT_DISK_SPACE')
    )
      code = detail.code;
    if (detail.code === 'ENOENT' && !code.startsWith('STORAGE_'))
      code = 'MEDIA_TOOL_UNAVAILABLE';
    if (
      detail.code === 'ENOSPC' ||
      /no space left on device/i.test(detail.message)
    )
      code = 'INSUFFICIENT_DISK_SPACE';
    if (detail.timedOut) code = 'MEDIA_TOOL_TIMEOUT';
    if (detail.isCanceled || detail.name === 'AbortError')
      code = 'MEDIA_CANCELLED';
    if (
      detail.timedOut ||
      detail.name === 'AbortError' ||
      ['ENOSPC', 'EACCES', 'EPERM', 'INSUFFICIENT_DISK_SPACE'].includes(
        detail.code ?? '',
      )
    )
      permanent = true;
    if (
      [
        'EAGAIN',
        'EBUSY',
        'EMFILE',
        'ENFILE',
        'EIO',
        'ECONNRESET',
        'ETIMEDOUT',
        'EPIPE',
      ].includes(detail.code ?? '')
    )
      temporary = true;
    current = detail.cause;
  }
  const retryable = temporary && !permanent;
  const preserveCandidate =
    retryable ||
    [
      'MEDIA_TOOL_TIMEOUT',
      'MEDIA_TOOL_UNAVAILABLE',
      'MEDIA_TOOL_SHUTDOWN_FAILED',
      'INSUFFICIENT_DISK_SPACE',
    ].includes(code) ||
    code.startsWith('STORAGE_') ||
    code.startsWith('MEDIA_RESOURCE');
  return {
    code,
    retryable,
    preserveCandidate,
    diagnostic: `${code}: ${error instanceof Error ? error.message : String(error)}`,
  };
}
