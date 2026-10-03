export function mediaError(code: string, message: string, cause?: unknown) {
  return Object.assign(new Error(message, { cause }), { code });
}

/** Analyze native, storage and tool errors once; callers do not parse diagnostics. */
export function analyzeMediaError(error: unknown) {
  let code = 'MEDIA_PROCESS_FAILED';
  let temporary = false;
  let permanent = false;
  let storageDiagnostic = '';
  let current = error;
  while (current instanceof Error) {
    const detail = current as Error & {
      code?: string;
      timedOut?: boolean;
      isCanceled?: boolean;
      httpStatusCode?: number;
      serviceCode?: string;
    };
    if (
      typeof detail.code === 'string' &&
      (detail.code.startsWith('MEDIA_') ||
        detail.code.startsWith('STORAGE_') ||
        detail.code === 'INSUFFICIENT_DISK_SPACE')
    )
      code = detail.code;
    if (typeof detail.code === 'string' && detail.code.startsWith('STORAGE_'))
      storageDiagnostic = [
        detail.httpStatusCode === undefined
          ? ''
          : `HTTP ${detail.httpStatusCode}`,
        detail.serviceCode,
      ]
        .filter(Boolean)
        .join(', ');
    if (detail.code === 'ENOENT' && !code.startsWith('STORAGE_'))
      code = 'MEDIA_TOOL_UNAVAILABLE';
    if (/cache resources exhausted/i.test(detail.message))
      code = 'MEDIA_RESOURCE_LIMIT';
    if (
      detail.code === 'ENOSPC' ||
      /no space left on device/i.test(detail.message)
    )
      code = 'INSUFFICIENT_DISK_SPACE';
    if (detail.timedOut) code = 'MEDIA_TOOL_TIMEOUT';
    const cancelled =
      (detail.isCanceled || detail.name === 'AbortError') &&
      code !== 'STORAGE_TIMEOUT';
    if (cancelled) code = 'MEDIA_CANCELLED';
    if (
      detail.timedOut ||
      cancelled ||
      detail.httpStatusCode === 401 ||
      detail.httpStatusCode === 403 ||
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
      ].includes(detail.code ?? '') ||
      detail.code === 'STORAGE_TIMEOUT' ||
      detail.httpStatusCode === 429 ||
      (detail.httpStatusCode !== undefined && detail.httpStatusCode >= 500)
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
    diagnostic: `${code}: ${error instanceof Error ? error.message : String(error)}${storageDiagnostic ? ` (${storageDiagnostic})` : ''}`,
  };
}
