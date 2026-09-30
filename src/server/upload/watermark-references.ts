import { and, eq, inArray, sql } from 'drizzle-orm';
import type { MediaTransaction } from '../media/images.ts';
import { uploadSessions, uploadSubmissions } from './schema.ts';

/** Accepted sessions transfer responsibility to media in the same transaction. */
export function hasUploadWatermarkReference(
  tx: MediaTransaction,
  assetId: string,
) {
  return Boolean(
    tx
      .select({ id: uploadSessions.id })
      .from(uploadSessions)
      .innerJoin(
        uploadSubmissions,
        eq(uploadSessions.submissionId, uploadSubmissions.id),
      )
      .where(
        and(
          inArray(uploadSessions.state, [
            'queued',
            'receiving',
            'validating',
            'finalizing',
          ]),
          sql`json_extract(${uploadSubmissions.snapshot}, '$.watermarkAsset.id') = ${assetId}`,
        ),
      )
      .get(),
  );
}
