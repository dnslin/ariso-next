import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import {
  MultipartReceiveError,
  receiveMultipart,
} from '../upload/multipart.ts';
import { BRAND_MAX_BYTES } from './branding.ts';
import { siteSettingsResponse } from './settings-http.ts';
import { brandingUrl } from './urls.ts';

export function writeBrandingResponse(request: Request, kind: string) {
  return siteSettingsResponse(request, async () => {
    if (kind !== 'logo' && kind !== 'favicon')
      throw Object.assign(new Error('品牌素材用途不存在'), {
        code: 'NOT_FOUND',
        status: 404,
      });
    const { branding, mediaResources } = getServerRuntime();
    if (request.method === 'DELETE') {
      await branding.remove(kind, request.signal);
      return { url: null, mime: null };
    }
    const asset = await branding.replace(
      kind,
      async (path, signal) => {
        try {
          await receiveMultipart(request, {
            path,
            signal,
            maxBytes: BRAND_MAX_BYTES,
            resources: mediaResources,
          });
        } catch (cause) {
          if (cause instanceof MultipartReceiveError && cause.status < 500) {
            const tooLarge = cause.code === 'UPLOAD_FILE_TOO_LARGE';
            throw Object.assign(
              new Error(
                tooLarge
                  ? '品牌素材不能超过 5 MiB'
                  : '请上传一个有效的 file 文件',
                { cause },
              ),
              {
                code: tooLarge ? 'SITE_ASSET_TOO_LARGE' : 'SITE_ASSET_INVALID',
                status: tooLarge ? 413 : 400,
              },
            );
          }
          throw cause;
        }
      },
      request.signal,
    );
    return { url: brandingUrl(asset.key), mime: asset.mime };
  });
}

export async function readBrandingResponse(request: Request, key: string) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const asset = await getServerRuntime().branding.read(key, request.signal);
    if (!asset)
      return Response.json(
        { code: 'NOT_FOUND', message: '品牌素材不存在' },
        { status: 404, headers },
      );
    const svg = asset.mime === 'image/svg+xml';
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        ...headers,
        'Content-Type': asset.mime,
        'Content-Length': String(asset.bytes.length),
        'Content-Disposition': `${svg ? 'attachment' : 'inline'}; filename="${asset.key}"`,
        'X-Content-Type-Options': 'nosniff',
        ...(svg
          ? { 'Content-Security-Policy': "sandbox; default-src 'none'" }
          : {}),
      },
    });
  } catch (error) {
    createRuntimeLogger('site.branding', 'info').error(
      { err: error, key },
      'Brand asset read failed',
    );
    const missing = (error as { code?: string })?.code === 'SITE_ASSET_MISSING';
    return Response.json(
      {
        code: missing ? 'SITE_ASSET_MISSING' : 'SITE_INTERNAL_ERROR',
        message: missing
          ? '当前品牌素材文件缺失，请检查服务日志'
          : '品牌素材读取失败，请检查服务日志',
      },
      { status: 500, headers },
    );
  }
}
