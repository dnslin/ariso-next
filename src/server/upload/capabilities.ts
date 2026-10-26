import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { verifyUploadToken } from '../identity/tokens.ts';
import { readMediaSettings } from '../media/settings.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { getServerRuntime } from '../startup/server-start.ts';
import { storageConfigs, storageSettings } from '../storage/schema.ts';
import { UploadError } from './errors.ts';
import type {
  PublicUploadCapabilities,
  PublicUploadCapabilitiesError,
} from './public-contract.ts';
import { requireUploadSettings } from './settings.ts';

export function readPublicUploadCapabilities(
  db: BetterSQLite3Database,
): Omit<PublicUploadCapabilities, 'requestId'> {
  return db.transaction((tx) => {
    const upload = requireUploadSettings(tx);
    const media = readMediaSettings(tx);
    const storage = tx
      .select({ defaultStorageId: storageSettings.defaultStorageId })
      .from(storageSettings)
      .where(eq(storageSettings.id, 1))
      .get();
    if (!media || !storage)
      throw new UploadError(
        'UPLOAD_NOT_INITIALIZED',
        '上传设置尚未初始化',
        409,
      );
    const target = storage.defaultStorageId
      ? tx
          .select({ enabled: storageConfigs.enabled })
          .from(storageConfigs)
          .where(eq(storageConfigs.id, storage.defaultStorageId))
          .get()
      : null;
    return {
      maxFileBytes: upload.maxFileBytes,
      queueLimit: upload.queueLimit,
      defaultVisibility: media.defaultVisibility,
      defaultLinkVersion: media.defaultLinkVersion,
      defaultStorageAvailable: target?.enabled === true,
    };
  });
}

export async function publicUploadCapabilitiesResponse(request: Request) {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'no-store' };
  let stage = 'authentication';
  try {
    if (!(await verifyUploadToken(request)))
      throw new UploadError(
        'UPLOAD_TOKEN_INVALID',
        '上传 Token 缺失、无效、已停用或已过期',
        401,
      );
    stage = 'capabilities';
    const { connection } = getServerRuntime();
    return Response.json(
      { ...readPublicUploadCapabilities(connection.db), requestId },
      { headers },
    );
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error;
    createRuntimeLogger('upload.capabilities', 'info').error(
      { err: cause, requestId, stage },
      'Public upload capabilities failed',
    );
    const known = error instanceof UploadError;
    const body: PublicUploadCapabilitiesError = {
      error: {
        code: known ? error.code : 'UPLOAD_CAPABILITIES_FAILED',
        stage,
        message: known ? error.message : '读取上传能力失败，请稍后重试',
      },
      requestId,
    };
    return Response.json(body, {
      status: known ? error.status : 500,
      headers,
    });
  }
}
