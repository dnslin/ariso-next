import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { ZodError } from 'zod';
import { clientIpStatus } from '../http/client-ip.ts';
import { JsonBodyTooLargeError, readBoundedJson } from '../http/json.ts';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import {
  requireAccessProtectionSettings,
  updateAccessProtectionSettings,
} from './settings.ts';
import type { AccessProtectionSettingsResponse } from './types.ts';
import {
  accessProtectionFieldErrors,
  accessProtectionInputSchema,
} from './validation.ts';

function serialize(
  request: Request,
  settings: ReturnType<typeof requireAccessProtectionSettings>,
): AccessProtectionSettingsResponse {
  return {
    mode: settings.mode,
    rate: settings.rate,
    burst: settings.burst,
    updatedAt: settings.updatedAt.toISOString(),
    clientIp: clientIpStatus(request),
  };
}

export function readAccessProtectionSettingsResponse(
  db: BetterSQLite3Database,
  request: Request,
) {
  return serialize(request, requireAccessProtectionSettings(db));
}

export async function patchAccessProtectionSettingsResponse(
  db: BetterSQLite3Database,
  request: Request,
  reset: () => void,
) {
  const input = accessProtectionInputSchema.parse(
    await readBoundedJson(request),
  );
  const clientIp = clientIpStatus(request);
  if (input.mode === 'enforce' && !clientIp.ready)
    throw Object.assign(new Error(clientIp.message ?? '请先确认真实访客 IP'), {
      code: 'ACCESS_PROTECTION_IP_UNAVAILABLE',
      status: 409,
    });
  const before = requireAccessProtectionSettings(db);
  const saved = updateAccessProtectionSettings(db, input);
  if (
    saved.mode !== before.mode ||
    saved.rate !== before.rate ||
    saved.burst !== before.burst
  )
    reset();
  return serialize(request, saved);
}

export async function accessProtectionSettingsResponse(
  request: Request,
  operation: (
    db: BetterSQLite3Database,
    request: Request,
    reset: () => void,
  ) => unknown | Promise<unknown>,
  mutation?: string,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    const server = getServerRuntime();
    const invoke = () =>
      operation(server.connection.db, request, server.accessProtection.reset);
    return Response.json(
      await (mutation
        ? server.contentMutations.run(mutation, invoke)
        : invoke()),
      { headers },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        {
          code: 'ACCESS_PROTECTION_INVALID_INPUT',
          message: '请检查访问防护设置',
          fields: accessProtectionFieldErrors(error),
        },
        { status: 422, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        {
          code: 'ACCESS_PROTECTION_INVALID_INPUT',
          message: '请求内容不是有效的 JSON',
        },
        { status: 400, headers },
      );
    if (error instanceof JsonBodyTooLargeError)
      return Response.json(
        { code: 'ACCESS_PROTECTION_BODY_TOO_LARGE', message: error.message },
        { status: 413, headers },
      );
    const detail = error as { code?: string; status?: number };
    if (detail?.status && detail.status < 500 && error instanceof Error)
      return Response.json(
        { code: detail.code, message: error.message },
        { status: detail.status, headers },
      );
    createRuntimeLogger('access-protection.settings', 'info').error(
      { err: error },
      'Access protection settings request failed',
    );
    return Response.json(
      {
        code: 'ACCESS_PROTECTION_INTERNAL_ERROR',
        message: '访问防护设置操作失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}
