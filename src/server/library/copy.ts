import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { albumImages } from '../collections/schema.ts';
import {
  buildImageLinks,
  parseImageRequest,
  resolveImageVersion,
} from '../delivery/links.ts';
import { imageVersionApplicable } from '../media/images.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
  versionKinds,
} from '../media/schema.ts';
import { requireMediaSettings } from '../media/settings.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { storageConfigs } from '../storage/schema.ts';
import type { LibraryCopyResponse } from './copy-types.ts';
import {
  assertLibraryReferences,
  libraryOrder,
  libraryPredicate,
} from './query-predicate.ts';
import { LibraryQueryError, parseLibraryQuery } from './query-schema.ts';

const copySchema = z.strictObject({
  ids: z.array(z.string().min(1)).min(1).max(200),
  query: z.string(),
  version: z.enum(['default', ...versionKinds]),
  format: z.enum(['url', 'markdown', 'html']),
});

/** Read explicit selections only; no content reads, storage probes or signed URLs. */
export function readLibraryCopy(
  db: BetterSQLite3Database,
  input: unknown,
): LibraryCopyResponse {
  const parsed = copySchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError(
      '批量复制需要 1–200 个图片 ID、查询、版本和格式',
    );
  const { query: encodedQuery, version, format } = parsed.data;
  const query = parseLibraryQuery(new URLSearchParams(encodedQuery));
  if (
    query.page !== null ||
    query.cursor !== null ||
    query.filters.scope === 'trash'
  )
    throw new LibraryQueryError(
      '批量复制仅接受正常图库或相册的筛选条件，不接受页码或游标',
    );
  const ids = [...new Set(parsed.data.ids)];
  const params = new URLSearchParams();
  if (version !== 'default') params.set('type', version);
  for (const id of ids) {
    try {
      parseImageRequest(id, params);
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'INVALID_IMAGE_REQUEST'
      ))
        throw error;
      throw new LibraryQueryError('批量复制包含无效图片 ID');
    }
  }
  return db.transaction((tx) => {
    const { filters } = query;
    assertLibraryReferences(tx, filters);
    const selectedVersion = version === 'default' ? undefined : version;
    const { defaultLinkVersion } = requireMediaSettings(tx);
    const { publicUrl } = requireSiteSettings(tx);
    const order = libraryOrder(filters);
    const selection = tx
      .select({
        image: mediaImages,
        enabled: storageConfigs.enabled,
        inQuery: libraryPredicate(tx, filters).mapWith(Boolean),
        sortValue: order.value,
      })
      .from(mediaImages)
      .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
      .$dynamic();
    const rows = (
      filters.scope === 'album'
        ? selection.leftJoin(
            albumImages,
            and(
              eq(albumImages.imageId, mediaImages.id),
              eq(albumImages.albumId, filters.albumId!),
            ),
          )
        : selection
    )
      .where(inArray(mediaImages.id, ids))
      .orderBy(...order.terms)
      .all();
    const published = tx
      .select({ version: mediaVersions, object: mediaObjects })
      .from(mediaVersions)
      .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
      .where(
        and(
          inArray(mediaVersions.imageId, ids),
          eq(mediaObjects.status, 'stored'),
        ),
      )
      .all();
    const saved = new Map<string, typeof published>();
    for (const entry of published) {
      const versions = saved.get(entry.version.imageId) ?? [];
      versions.push(entry);
      saved.set(entry.version.imageId, versions);
    }
    const response: LibraryCopyResponse = {
      items: [],
      unavailable: [],
      sort: filters.sort,
    };
    const found = new Set(rows.map(({ image }) => image.id));
    for (const imageId of ids)
      if (!found.has(imageId))
        response.unavailable.push({
          imageId,
          displayName: imageId,
          reason: '图片不存在',
          actualVersion: null,
        });
    for (const { image, enabled, inQuery, sortValue } of rows) {
      const unavailable = (reason: string) =>
        response.unavailable.push({
          imageId: image.id,
          displayName: image.displayName,
          reason,
          actualVersion: null,
        });
      if (image.trashedAt || image.deletionStatus) {
        unavailable('图片已回收或正在删除');
        continue;
      }
      if (!inQuery) {
        unavailable('图片已不属于当前查询范围');
        continue;
      }
      if (!enabled) {
        unavailable('图片所属存储已停用');
        continue;
      }
      const state = {
        versions: versionKinds.map((kind) => ({
          kind,
          applicable: imageVersionApplicable(image.classification, kind),
          saved:
            saved.get(image.id)?.find((entry) => entry.version.kind === kind) ??
            null,
        })),
      };
      if (
        selectedVersion !== undefined &&
        state.versions.find(({ kind }) => kind === selectedVersion)
          ?.applicable === false
      ) {
        unavailable('此图片不适用该版本');
        continue;
      }
      let resolved;
      try {
        resolved = resolveImageVersion(
          state,
          selectedVersion,
          defaultLinkVersion,
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'VERSION_UNAVAILABLE'
        ))
          throw error;
        unavailable(error.message);
        continue;
      }
      response.items.push({
        imageId: image.id,
        displayName: image.displayName,
        sortKey: { value: sortValue, id: image.id },
        actualVersion: resolved.actualVersion,
        line: buildImageLinks(
          publicUrl,
          image.id,
          image.displayName,
          selectedVersion,
        )[format],
        accessWarning:
          image.visibility === 'private' || image.processingStatus !== 'ready'
            ? '此链接仅所有者登录后可访问，外部访客无权访问'
            : null,
        originalDisclosure:
          image.visibility === 'public' &&
          image.processingStatus === 'ready' &&
          resolved.actualVersion === 'original',
      });
    }
    return response;
  });
}
