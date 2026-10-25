import type { LibraryQueryPatch } from './query-state';

/** A template replaces business criteria; page size and layout remain user preferences. */
export function smartCollectionTemplate(
  kind: 'untagged' | 'large' | 'screenshot',
  tagIds: string[] = [],
): LibraryQueryPatch {
  return {
    q: null,
    tagId: kind === 'screenshot' ? tagIds : [],
    tagState: kind === 'untagged' ? 'none' : null,
    recentDays: kind === 'screenshot' ? '7' : null,
    relativeTo: null,
    uploadedFrom: null,
    uploadedBefore: null,
    sizeGreaterThan: kind === 'large' ? '10000000' : null,
    sizeLessThan: null,
    albumId: null,
    storageId: null,
    visibility: null,
    status: null,
    failure: null,
    format: null,
    sort: kind === 'large' ? 'size_desc' : 'uploaded_desc',
  };
}
