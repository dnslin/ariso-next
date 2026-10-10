export type ResetResult =
  { ok: true } | { ok: false; code: string; status: number; retryAt: number };

/** A lost response may follow a completed send or password write; never retry here. */
export async function resetRequest(
  operation: 'request-password-reset' | 'reset-password',
  body: { email: string } | { token: string; newPassword: string },
): Promise<ResetResult> {
  try {
    const response = await fetch(`/api/auth/${operation}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    let data: { status?: boolean; code?: unknown };
    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        code: response.ok ? 'RESULT_UNKNOWN' : 'INVALID_RESPONSE',
        status: response.status,
        retryAt: 0,
      };
    }
    if (response.ok && data?.status === true) return { ok: true };
    const seconds = Number(
      response.headers.get('x-retry-after') ??
        response.headers.get('retry-after'),
    );
    return {
      ok: false,
      code:
        typeof data?.code === 'string'
          ? data.code
          : response.ok
            ? 'RESULT_UNKNOWN'
            : 'REQUEST_FAILED',
      status: response.status,
      retryAt:
        response.status === 429 && Number.isFinite(seconds) && seconds > 0
          ? Date.now() + seconds * 1000
          : 0,
    };
  } catch {
    return { ok: false, code: 'RESULT_UNKNOWN', status: 0, retryAt: 0 };
  }
}
