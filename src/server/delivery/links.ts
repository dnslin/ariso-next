import { z } from 'zod';
import type { getImageAccessState } from '../media/images.ts';
import { versionKinds, type VersionKind } from '../media/schema.ts';
import { buildSiteUrl } from '../site/urls.ts';

const versionSchema = z.enum(versionKinds);
const imageIdSchema = z
  .string()
  .min(1)
  .regex(/^[^/\\\p{Cc}]+$/u);

export function parseImageRequest(
  imageId: string,
  searchParams: URLSearchParams,
) {
  const versions = searchParams.getAll('type');
  const downloads = searchParams.getAll('download');
  const selected = versions.length
    ? versionSchema.safeParse(versions[0])
    : null;
  if (
    !imageIdSchema.safeParse(imageId).success ||
    versions.length > 1 ||
    (selected !== null && !selected.success) ||
    downloads.length > 1 ||
    (downloads.length === 1 && downloads[0] !== '1')
  ) {
    throw Object.assign(new Error('图片访问参数无效'), {
      status: 400,
      code: 'INVALID_IMAGE_REQUEST',
    });
  }
  return {
    imageId,
    selectedVersion: selected?.success ? selected.data : undefined,
    download: downloads.length === 1,
  };
}

export function buildImageUrl(
  publicUrl: string,
  imageId: string,
  selectedVersion?: VersionKind,
  download = false,
) {
  const query = new URLSearchParams();
  if (selectedVersion !== undefined) query.set('type', selectedVersion);
  if (download) query.set('download', '1');
  return buildSiteUrl(
    { publicUrl },
    `/i/${encodeURIComponent(imageId)}`,
    query,
  );
}

export function resolveImageVersion(
  state: NonNullable<ReturnType<typeof getImageAccessState>>,
  selectedVersion: VersionKind | undefined,
  defaultVersion: VersionKind,
) {
  let actualVersion = selectedVersion ?? defaultVersion;
  let target = state.versions.find(({ kind }) => kind === actualVersion);
  // Unknown applicability is not evidence that the format needs an original fallback.
  if (selectedVersion === undefined && target?.applicable === false) {
    actualVersion = 'original';
    target = state.versions.find(({ kind }) => kind === actualVersion);
  }
  if (!target?.saved) {
    throw Object.assign(new Error('请求的图片版本不可用'), {
      status: 404,
      code: 'VERSION_UNAVAILABLE',
    });
  }
  return { actualVersion, ...target.saved };
}
