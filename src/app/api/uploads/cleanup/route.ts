import { ne } from 'drizzle-orm';
import { uploadSessions } from '../../../../server/upload/schema.ts';
import {
  readUploadJson,
  sessionResult,
  uploadResponse,
} from '../../../../server/upload/http.ts';
import { UploadError } from '../../../../server/upload/errors.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return uploadResponse(request, async ({ uploads }) => {
    const input = await readUploadJson(request);
    if (
      !input ||
      typeof input !== 'object' ||
      !('sessionId' in input) ||
      typeof input.sessionId !== 'string'
    )
      throw new UploadError('UPLOAD_INVALID_INPUT', '需要上传会话 ID');
    return sessionResult(await uploads.retryCleanup(input.sessionId));
  });
}

export async function GET(request: Request) {
  return uploadResponse(request, ({ connection }) =>
    connection.db
      .select({
        id: uploadSessions.id,
        originalName: uploadSessions.originalName,
        storageId: uploadSessions.storageId,
        state: uploadSessions.state,
        cleanupStatus: uploadSessions.cleanupStatus,
        error: uploadSessions.error,
        temporaryKey: uploadSessions.temporaryKey,
        finalKey: uploadSessions.finalKey,
        temporaryPath: uploadSessions.temporaryPath,
        cleanupAttempts: uploadSessions.cleanupAttempts,
        nextCleanupAt: uploadSessions.nextCleanupAt,
      })
      .from(uploadSessions)
      .where(ne(uploadSessions.cleanupStatus, 'none'))
      .all(),
  );
}
