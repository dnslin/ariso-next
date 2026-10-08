import { z } from 'zod';
import type { ReportDays } from './queries.ts';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';

export async function analyticsResponse(
  request: Request,
  operation: () => unknown,
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    await requireOwner(request);
    return Response.json(operation(), { headers });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      'status' in error &&
      error.code === 'UNAUTHORIZED' &&
      error.status === 401
    )
      return Response.json(
        { code: error.code, message: error.message },
        { status: 401, headers },
      );
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ANALYTICS_INVALID_INPUT'
    )
      return Response.json(
        { code: error.code, message: error.message },
        { status: 400, headers },
      );
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ANALYTICS_IMAGE_NOT_FOUND'
    )
      return Response.json(
        { code: error.code, message: error.message },
        { status: 404, headers },
      );
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error;
    createRuntimeLogger('analytics.http', 'info').error(
      { err: cause, path: new URL(request.url).pathname },
      'Analytics read failed',
    );
    return Response.json(
      {
        code: 'ANALYTICS_READ_FAILED',
        message: '统计读取失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}

/** Validate period at the HTTP boundary before entering synchronous report queries. */
export function parseOverviewDays(request: Request) {
  const values = new URL(request.url).searchParams.getAll('days');
  if (
    values.length > 1 ||
    (values.length && !['7', '30', '90'].includes(values[0]))
  )
    throw Object.assign(new Error('统计周期必须为 7、30 或 90 天'), {
      code: 'ANALYTICS_INVALID_INPUT',
    });
  return Number(values[0] ?? 7) as ReportDays;
}

export function parseStatsImageId(imageId: string) {
  if (!z.uuid().safeParse(imageId).success)
    throw Object.assign(new Error('图片 ID 无效'), {
      code: 'ANALYTICS_INVALID_INPUT',
    });
  return imageId;
}
