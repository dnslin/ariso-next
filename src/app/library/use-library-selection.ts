'use client';

import { useCallback, useMemo, useState } from 'react';

import type { SelectedLibraryItem } from '../../server/library/selection-types';
export type { SelectedLibraryItem } from '../../server/library/selection-types';

function selectedItem(
  item: SelectedLibraryItem,
  sourcePage?: number,
  retained?: SelectedLibraryItem,
): SelectedLibraryItem {
  return {
    id: item.id,
    displayName: item.displayName,
    processingStatus: item.processingStatus ?? retained?.processingStatus,
    thumbnailUrl: item.thumbnailUrl,
    storage: { ...item.storage },
    ...((item.byteSize ?? retained?.byteSize) === undefined
      ? {}
      : { byteSize: item.byteSize ?? retained?.byteSize }),
    ...((item.batchFailure ?? retained?.batchFailure)
      ? { batchFailure: item.batchFailure ?? retained?.batchFailure }
      : {}),
    ...((item.sourcePage ?? retained?.sourcePage ?? sourcePage) === undefined
      ? {}
      : { sourcePage: item.sourcePage ?? retained?.sourcePage ?? sourcePage }),
  };
}

export function useLibrarySelection(
  identity: string,
  items: SelectedLibraryItem[],
  sourcePage?: number,
) {
  const [state, setState] = useState(() => ({
    identity,
    selected: new Map<string, SelectedLibraryItem>(),
  }));
  if (state.identity !== identity) {
    setState({ identity, selected: new Map() });
  }
  const selected =
    state.identity === identity
      ? state.selected
      : new Map<string, SelectedLibraryItem>();
  const currentItems = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const currentIds = useMemo(
    () => new Set(currentItems.keys()),
    [currentItems],
  );

  const toggle = useCallback(
    (item: SelectedLibraryItem) => {
      setState((previous) => {
        const next = new Map(
          previous.identity === identity ? previous.selected : [],
        );
        if (next.has(item.id)) next.delete(item.id);
        else next.set(item.id, selectedItem(item, sourcePage));
        return { identity, selected: next };
      });
    },
    [identity, sourcePage],
  );
  const selectIds = useCallback(
    (ids: Iterable<string>) => {
      // A drag supplies its complete ID snapshot, including retained other pages.
      const snapshot = [...ids];
      setState((previous) => {
        const next = new Map<string, SelectedLibraryItem>();
        for (const id of snapshot) {
          const item = currentItems.get(id);
          const retained =
            previous.identity === identity ? previous.selected.get(id) : null;
          if (item)
            next.set(id, selectedItem(item, sourcePage, retained ?? undefined));
          else if (retained) next.set(id, retained);
        }
        return { identity, selected: next };
      });
    },
    [identity, currentItems, sourcePage],
  );
  const remove = useCallback(
    (id: string) => {
      setState((previous) => {
        if (previous.identity !== identity || !previous.selected.has(id))
          return previous;
        const next = new Map(previous.selected);
        next.delete(id);
        return { identity, selected: next };
      });
    },
    [identity],
  );
  const recordFailure = useCallback(
    (id: string, message: string) => {
      setState((previous) => {
        const item =
          previous.identity === identity
            ? previous.selected.get(id)
            : undefined;
        if (!item) return previous;
        const next = new Map(previous.selected);
        next.set(id, { ...item, batchFailure: message });
        return { identity, selected: next };
      });
    },
    [identity],
  );
  const clear = useCallback(() => {
    setState({ identity, selected: new Map() });
  }, [identity]);
  const selectCurrent = useCallback(() => {
    setState((previous) => {
      const next = new Map(
        previous.identity === identity ? previous.selected : [],
      );
      for (const item of currentItems.values())
        next.set(item.id, selectedItem(item, sourcePage, next.get(item.id)));
      return { identity, selected: next };
    });
  }, [identity, currentItems, sourcePage]);
  const deselectCurrent = useCallback(() => {
    setState((previous) => {
      if (previous.identity !== identity) return previous;
      const next = new Map(previous.selected);
      for (const id of currentIds) next.delete(id);
      return { identity, selected: next };
    });
  }, [identity, currentIds]);
  const reconcile = useCallback(
    (
      snapshot: Map<string, SelectedLibraryItem>,
      valid: SelectedLibraryItem[],
    ) => {
      setState((previous) => {
        if (previous.identity !== identity) return previous;
        const byId = new Map(valid.map((item) => [item.id, item]));
        const next = new Map(previous.selected);
        for (const [id, checked] of snapshot) {
          // A removed/reselected item belongs to a newer user action.
          if (next.get(id) !== checked) continue;
          const updated = byId.get(id);
          if (updated)
            next.set(
              id,
              selectedItem(
                {
                  ...updated,
                  byteSize: updated.byteSize ?? checked.byteSize,
                  batchFailure: checked.batchFailure,
                },
                checked.sourcePage,
              ),
            );
          else next.delete(id);
        }
        return { identity, selected: next };
      });
    },
    [identity],
  );
  const currentCount = [...currentIds].filter((id) => selected.has(id)).length;

  return {
    selected,
    currentIds,
    reconcile,
    toggle,
    selectIds,
    remove,
    recordFailure,
    clear,
    selectCurrent,
    deselectCurrent,
    currentCount,
    otherCount: selected.size - currentCount,
  };
}

export type LibrarySelection = ReturnType<typeof useLibrarySelection>;
