import { ZodError } from 'zod';
import { requireOwner } from '../identity/owner.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { invalidateS3Cors } from '../storage/cors.ts';
import type { SiteSettings } from './schema.ts';
import { requireSiteSettings, updateSiteSettings } from './settings.ts';
import { buildSiteUrl } from './urls.ts';
import { siteSettingsPatchSchema } from './validation.ts';

type SiteDatabase = ReturnType<typeof getServerRuntime>['connection']['db'];

export type SiteSettingsResponse = Omit<SiteSettings, 'updatedAt'> & {
  updatedAt: string;
  githubCallbackUrl: string;
};

export type SiteSettingsPatchResponse = SiteSettingsResponse & {
  publicUrlChanged: boolean;
  notices: string[];
};

function serializeSiteSettings(settings: SiteSettings): SiteSettingsResponse {
  return {
    ...settings,
    updatedAt: settings.updatedAt.toISOString(),
    githubCallbackUrl: buildSiteUrl(settings, '/api/auth/callback/github'),
  };
}

export function readSiteSettingsResponse(db: SiteDatabase) {
  return serializeSiteSettings(requireSiteSettings(db));
}

/** HTTP 组合层持有同步事务；site 数据库层不反向依赖 storage。 */
export function patchSiteSettingsResponse(
  db: SiteDatabase,
  value: unknown,
): SiteSettingsPatchResponse {
  const input = siteSettingsPatchSchema.parse(value);
  return db.transaction((tx) => {
    const current = requireSiteSettings(tx);
    const publicUrlChanged =
      input.publicUrl !== undefined && input.publicUrl !== current.publicUrl;
    const settings = updateSiteSettings(tx, input);
    if (publicUrlChanged) invalidateS3Cors(tx);
    return {
      ...serializeSiteSettings(settings),
      publicUrlChanged,
      notices: publicUrlChanged
        ? [
            '请在 GitHub OAuth 应用中更新回调地址。',
            '全部 S3 CORS 检测结果已失效，请从新站点地址重新检测。',
            '旧域名需要自行维护，站点不会自动跳转到新地址。',
          ]
        : [],
    };
  });
}

export async function siteSettingsResponse(
  request: Request,
  operation: (db: SiteDatabase) => unknown | Promise<unknown>,
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await requireOwner(request);
    return Response.json(await operation(getServerRuntime().connection.db), {
      headers,
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json(
        {
          code: 'SITE_INVALID_INPUT',
          message: '请检查站点信息字段',
          ...(error instanceof ZodError
            ? {
                fields: error.issues.flatMap((issue) =>
                  issue.code === 'unrecognized_keys'
                    ? issue.keys.map((field) => ({
                        field,
                        message: '未知字段',
                      }))
                    : [{ field: issue.path.join('.'), message: issue.message }],
                ),
              }
            : {}),
        },
        { status: 400, headers },
      );
    }
    const detail = error as { code?: string; status?: number };
    const status =
      detail?.code === 'SITE_NOT_INITIALIZED' ? 409 : detail?.status;
    if (status && status < 500 && error instanceof Error) {
      return Response.json(
        { code: detail.code, message: error.message },
        { status, headers },
      );
    }
    createRuntimeLogger('site.settings', 'info').error(
      { err: error instanceof Error ? (error.cause ?? error) : error },
      'Site settings request failed',
    );
    return Response.json(
      {
        code: 'SITE_INTERNAL_ERROR',
        message: '站点信息操作失败，请检查服务日志后重试',
      },
      { status: 500, headers },
    );
  }
}
