import { z } from 'zod';
import type { getImageAccessState } from '../media/images.ts';
import { versionKinds, type VersionKind } from '../media/schema.ts';
import { deliveryError } from './errors.ts';
import { sizePresets, type SizePreset } from '../media/size-types.ts';

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
  const presets = searchParams.getAll('preset');
  const preset = presets[0];
  const selected = versions.length
    ? versionSchema.safeParse(versions[0])
    : null;
  if (
    !imageIdSchema.safeParse(imageId).success ||
    versions.length > 1 ||
    (selected !== null && !selected.success) ||
    downloads.length > 1 ||
    (downloads.length === 1 && downloads[0] !== '1') ||
    presets.length > 1 ||
    (presets.length === 1 &&
      (!Object.hasOwn(sizePresets, preset) ||
        !selected?.success ||
        (selected.data !== 'compressed' && selected.data !== 'watermark')))
  ) {
    throw deliveryError('INVALID_IMAGE_REQUEST');
  }
  return {
    imageId,
    selectedVersion: selected?.success ? selected.data : undefined,
    download: downloads.length === 1,
    ...(presets.length ? { preset: preset as SizePreset } : {}),
  };
}

export function buildImagePath(
  imageId: string,
  selectedVersion?: VersionKind,
  download = false,
  preset?: SizePreset,
) {
  const query = new URLSearchParams();
  if (selectedVersion !== undefined) query.set('type', selectedVersion);
  if (download) query.set('download', '1');
  if (preset) query.set('preset', preset);
  const path = `/i/${encodeURIComponent(imageId)}`;
  return query.size ? `${path}?${query}` : path;
}

export function buildImageUrl(
  publicUrl: string,
  imageId: string,
  selectedVersion?: VersionKind,
  download = false,
  preset?: SizePreset,
) {
  return new URL(
    buildImagePath(imageId, selectedVersion, download, preset),
    publicUrl,
  ).href;
}

export function resolveImageVersion(
  state: {
    versions: Pick<
      NonNullable<ReturnType<typeof getImageAccessState>>['versions'][number],
      'kind' | 'applicable' | 'saved'
    >[];
  },
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
    throw deliveryError('VERSION_UNAVAILABLE');
  }
  return { actualVersion, ...target.saved };
}

/** Management preview never reuses a public image URL. */
export function buildTrashPreviewPath(imageId: string, version: VersionKind) {
  return `/api/trash/${encodeURIComponent(imageId)}/preview?type=${version}`;
}

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

/** One escaped line per image, shared by detail and batch copy. */
export function buildImageLinks(
  publicUrl: string,
  imageId: string,
  displayName: string,
  selectedVersion?: VersionKind,
  preset?: SizePreset,
) {
  const url = buildImageUrl(publicUrl, imageId, selectedVersion, false, preset);
  const alt = displayName
    .replace(/[\\[\]`*_{}()!<>]/g, '\\$&')
    .replace(/[\r\n]/g, ' ');
  return {
    url,
    markdown: `![${alt}](<${url.replace(/[<>]/g, (character) => encodeURIComponent(character))}>)`,
    html: `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName)}">`,
    downloadUrl: buildImageUrl(
      publicUrl,
      imageId,
      selectedVersion,
      true,
      preset,
    ),
  };
}
