import { getSubmission } from '../../../../../server/upload/sessions.ts';
import {
  submissionResult,
  uploadResponse,
} from '../../../../../server/upload/http.ts';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return uploadResponse(request, async ({ connection }) =>
    submissionResult(getSubmission(connection.db, (await context.params).id)),
  );
}
