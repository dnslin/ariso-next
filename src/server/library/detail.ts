import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { albums, albumImages, tags, imageTags } from '../collections/schema.ts';
import { deliveryError } from '../delivery/errors.ts';
import {
  buildImagePath,
  buildImageUrl,
  resolveImageVersion,
} from '../delivery/links.ts';
import { getImageAccessState } from '../media/images.ts';
import { mediaJobs, type VersionKind } from '../media/schema.ts';
import { requireMediaSettings } from '../media/settings.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { storageConfigs } from '../storage/schema.ts';
import type { LibraryDetail, LibraryDetailLinks } from './detail-types.ts';
import type { LibraryJobSummary } from './types.ts';

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"'\r\n]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '\n': '&#10;',
        '\r': '&#13;',
      })[character]!,
  );
}

/** Owner-only record read. Delivery remains responsible for authorizing every content request. */
export function readLibraryDetail(
  db: BetterSQLite3Database,
  imageId: string,
): LibraryDetail {
  return db.transaction((tx) => {
    const state = getImageAccessState(tx, imageId);
    if (!state) throw deliveryError('IMAGE_NOT_FOUND');
    const { image } = state;
    const storage = tx
      .select({
        id: storageConfigs.id,
        name: storageConfigs.name,
        enabled: storageConfigs.enabled,
      })
      .from(storageConfigs)
      .where(eq(storageConfigs.id, image.storageId))
      .get();
    if (!storage) throw new Error(`Missing image storage: ${image.storageId}`);
    const { publicUrl } = requireSiteSettings(tx);
    const defaultVersion = requireMediaSettings(tx).defaultLinkVersion;
    const blocked =
      image.trashedAt || image.deletionStatus
        ? '图片已回收或正在删除'
        : !storage.enabled
          ? '存储已停用'
          : null;
    const links = (kind?: VersionKind): LibraryDetailLinks => {
      const url = buildImageUrl(publicUrl, imageId, kind);
      const alt = image.displayName
        .replace(/[\\[\]`*_{}()!<>]/g, '\\$&')
        .replace(/[\r\n]/g, ' ');
      return {
        url,
        markdown: `![${alt}](<${url.replace(/[<>]/g, (character) => encodeURIComponent(character))}>)`,
        html: `<img src="${escapeHtml(url)}" alt="${escapeHtml(image.displayName)}">`,
        downloadUrl: buildImageUrl(publicUrl, imageId, kind, true),
      };
    };
    const summary = (
      statuses: LibraryJobSummary['status'][],
    ): LibraryJobSummary | null => {
      const row = tx
        .select({
          id: mediaJobs.id,
          status: mediaJobs.status,
          scope: mediaJobs.scope,
          step: mediaJobs.step,
          error: mediaJobs.error,
        })
        .from(mediaJobs)
        .where(
          and(
            eq(mediaJobs.imageId, imageId),
            inArray(mediaJobs.status, statuses),
          ),
        )
        .orderBy(desc(mediaJobs.createdAt), desc(sql`${mediaJobs}.rowid`))
        .get();
      return row
        ? { ...row, status: row.status as LibraryJobSummary['status'] }
        : null;
    };
    let defaultLink: LibraryDetail['defaultLink'];
    try {
      const resolved = resolveImageVersion(state, undefined, defaultVersion);
      defaultLink = {
        actualVersion: resolved.actualVersion,
        links: blocked ? null : links(),
        downloadPath: blocked ? null : buildImagePath(imageId, undefined, true),
        unavailableReason: blocked,
      };
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'VERSION_UNAVAILABLE'
      ))
        throw error;
      defaultLink = {
        actualVersion: null,
        links: null,
        downloadPath: null,
        unavailableReason: blocked ?? error.message,
      };
    }
    return {
      id: image.id,
      displayName: image.displayName,
      originalName: image.originalName,
      format: image.format,
      mime: image.mime,
      width: image.width,
      height: image.height,
      byteSize: image.byteSize,
      animated: image.animated,
      pageCount: image.pageCount,
      classification: image.classification,
      visibility: image.visibility,
      processingStatus: image.processingStatus,
      createdAt: image.createdAt.toISOString(),
      trashedAt: image.trashedAt?.toISOString() ?? null,
      deletionStatus: image.deletionStatus,
      storage,
      albums: tx
        .select({ id: albums.id, name: albums.name })
        .from(albumImages)
        .innerJoin(albums, eq(albumImages.albumId, albums.id))
        .where(eq(albumImages.imageId, imageId))
        .orderBy(asc(albums.name), asc(albums.id))
        .all(),
      tags: tx
        .select({ id: tags.id, displayName: tags.displayName })
        .from(imageTags)
        .innerJoin(tags, eq(imageTags.tagId, tags.id))
        .where(eq(imageTags.imageId, imageId))
        .orderBy(asc(tags.displayName), asc(tags.id))
        .all(),
      versions: state.versions.map(({ kind, applicable, saved }) => {
        const unavailableReason =
          blocked ??
          (saved
            ? null
            : applicable === false
              ? '此图片不适用该版本'
              : '该版本尚未保存');
        return {
          kind,
          applicable,
          saved: saved !== null,
          format: saved?.version.format ?? null,
          mime: saved?.version.mime ?? null,
          width: saved?.version.width ?? null,
          height: saved?.version.height ?? null,
          byteSize: saved?.version.byteSize ?? null,
          previewPath:
            unavailableReason || saved?.version.mime === 'image/svg+xml'
              ? null
              : buildImagePath(imageId, kind),
          downloadPath: unavailableReason
            ? null
            : buildImagePath(imageId, kind, true),
          links: unavailableReason ? null : links(kind),
          unavailableReason,
        };
      }),
      defaultVersion,
      defaultLink,
      activeJob: summary(['queued', 'running']),
      latestFailedJob: summary(['failed']),
    };
  });
}
