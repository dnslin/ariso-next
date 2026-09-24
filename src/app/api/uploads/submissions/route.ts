import { createSubmission } from '../../../../server/upload/sessions.ts';
import {
  readUploadJson,
  submissionResult,
  uploadResponse,
} from '../../../../server/upload/http.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return uploadResponse(
    request,
    async ({ connection }) =>
      submissionResult(
        createSubmission(connection.db, await readUploadJson(request)),
      ),
    201,
  );
}
