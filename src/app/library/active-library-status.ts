import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import type { LibraryPage } from '../../server/library/types';
import {
  hasActiveDetailTask,
  readLibraryStatuses,
} from '../../components/library/read-detail-status';

export async function readActiveLibraryStatuses(
  ids: string[],
  signal: AbortSignal,
) {
  const batches: Awaited<ReturnType<typeof readLibraryStatuses>>[] = [];
  for (let offset = 0; offset < ids.length; offset += 80)
    batches.push(
      await readLibraryStatuses(ids.slice(offset, offset + 80), signal),
    );
  return {
    items: batches.flatMap((batch) => batch.items),
    missingIds: batches.flatMap((batch) => batch.missingIds),
  };
}

/** Patch current cards without resetting loaded pages, cursors or the selection owner. */
export function applyActiveLibraryStatus(
  client: QueryClient,
  key: QueryKey,
  result: Awaited<ReturnType<typeof readActiveLibraryStatuses>>,
) {
  const previous = client.getQueryData<LibraryPage | InfiniteData<LibraryPage>>(
    key,
  );
  if (!previous) return false;
  const pages = 'pages' in previous ? previous.pages : [previous];
  const byId = new Map(result.items.map((item) => [item.id, item]));
  const missing = new Set(result.missingIds);
  const finished = pages.some((page) =>
    page.items.some(
      (item) =>
        hasActiveDetailTask(item) &&
        (missing.has(item.id) ||
          (byId.has(item.id) && !hasActiveDetailTask(byId.get(item.id)!))),
    ),
  );
  const update = (page: LibraryPage) => ({
    ...page,
    items: page.items.map((item) => byId.get(item.id) ?? item),
  });
  client.setQueryData(
    key,
    'pages' in previous
      ? { ...previous, pages: previous.pages.map(update) }
      : update(previous),
  );
  // Canonical list reads own changed filter membership/counts, not this status response.
  return finished;
}
