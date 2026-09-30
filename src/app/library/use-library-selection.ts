'use client';

import { useCallback, useMemo, useState } from 'react';
import type { LibraryItem } from '../../server/library/types';

export type SelectedLibraryItem = Pick<
  LibraryItem,
  'id' | 'displayName' | 'thumbnailUrl' | 'storage'
>;

function selectedItem(item: LibraryItem): SelectedLibraryItem {
  return {
    id: item.id,
    displayName: item.displayName,
    thumbnailUrl: item.thumbnailUrl,
    storage: { ...item.storage },
  };
}

export function useLibrarySelection(identity: string, items: LibraryItem[]) {
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
    (item: LibraryItem) => {
      setState((previous) => {
        const next = new Map(
          previous.identity === identity ? previous.selected : [],
        );
        if (next.has(item.id)) next.delete(item.id);
        else next.set(item.id, selectedItem(item));
        return { identity, selected: next };
      });
    },
    [identity],
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
          if (item) next.set(id, selectedItem(item));
          else if (retained) next.set(id, retained);
        }
        return { identity, selected: next };
      });
    },
    [identity, currentItems],
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
  const clear = useCallback(() => {
    setState({ identity, selected: new Map() });
  }, [identity]);
  const selectCurrent = useCallback(() => {
    setState((previous) => {
      const next = new Map(
        previous.identity === identity ? previous.selected : [],
      );
      for (const item of currentItems.values())
        next.set(item.id, selectedItem(item));
      return { identity, selected: next };
    });
  }, [identity, currentItems]);
  const deselectCurrent = useCallback(() => {
    setState((previous) => {
      if (previous.identity !== identity) return previous;
      const next = new Map(previous.selected);
      for (const id of currentIds) next.delete(id);
      return { identity, selected: next };
    });
  }, [identity, currentIds]);
  const currentCount = [...currentIds].filter((id) => selected.has(id)).length;

  return {
    selected,
    currentIds,
    toggle,
    selectIds,
    remove,
    clear,
    selectCurrent,
    deselectCurrent,
    currentCount,
    otherCount: selected.size - currentCount,
  };
}

export type LibrarySelection = ReturnType<typeof useLibrarySelection>;
