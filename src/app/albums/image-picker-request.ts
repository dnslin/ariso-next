import type { LibrarySelection } from '../../server/library/selection-types';
import type { BatchItemResult } from '../../server/library/batch-types';
import { requestBatch } from '../../components/library/batch-request';
import { parseLibraryLocation } from '../library/query-state';
import { readLibraryResult } from '../library/use-library-query';
import { albumRequest } from './api';

export async function readAlbumImageChoices(
  albumId: string,
  q: string,
  page: number,
  signal: AbortSignal,
) {
  const filters = parseLibraryLocation(
    new URLSearchParams({ q, pageSize: '40' }),
  ).filters;
  const images = await readLibraryResult(filters, { page }, signal);
  const members = images.items.length
    ? await albumRequest<LibrarySelection>('/api/images/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: images.items.map((item) => item.id),
          query: new URLSearchParams({ scope: 'album', albumId }).toString(),
        }),
        signal,
      })
    : { items: [] };
  return { ...images, memberIds: members.items.map((item) => item.id) };
}

export async function addAlbumImages(
  albumId: string,
  ids: string[],
  mode: 'apply' | 'check',
  signal: AbortSignal,
  onResults: (results: BatchItemResult[]) => void,
) {
  const command = { type: 'add-albums' as const, albumIds: [albumId] };
  const outcome = await requestBatch(
    ids,
    'scope=normal',
    command,
    mode,
    signal,
    onResults,
  );
  if (mode === 'check' || !outcome.unknownIds.length) return outcome;
  // A lost response may already have added the images. Observe before offering retry.
  const checked = await requestBatch(
    outcome.unknownIds,
    'scope=normal',
    command,
    'check',
    signal,
    onResults,
  );
  return {
    ...checked,
    unsentIds: outcome.unsentIds,
    message: checked.unknownIds.length ? checked.message : '',
  };
}
