import {
  readFingerprintCoverage,
  retryFingerprintJobs,
} from '../../../../server/media/fingerprints.ts';
import { uploadResponse } from '../../../../server/upload/http.ts';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return uploadResponse(request, ({ connection }) =>
    readFingerprintCoverage(connection.db),
  );
}
export async function POST(request: Request) {
  return uploadResponse(
    request,
    ({ connection }) => retryFingerprintJobs(connection.db),
    200,
    'uploads/fingerprints:retry',
  );
}
