import { useMemo, useSyncExternalStore } from 'react';
import {
  hasImageEdits,
  type ImageEditRecipe,
} from '../../shared/image-editing';
import type { ImageEditSession, EditSessionSnapshot } from './session';

function sessionStore(sessions: ImageEditSession[]) {
  let snapshot = sessions.map((session) => session.getSnapshot());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      snapshot = sessions.map((session) => session.getSnapshot());
      const unsub = sessions.map((session) =>
        session.subscribe(() => {
          snapshot = sessions.map((item) => item.getSnapshot());
          listener();
        }),
      );
      return () => unsub.forEach((fn) => fn());
    },
  };
}

export function useEditSessionSnapshots(sessions: ImageEditSession[]) {
  const store = useMemo(() => sessionStore(sessions), [sessions]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

/** Frozen submissions survive leaving; unsubmitted or subsequently changed recipes do not. */
export function hasUnsavedImageEdits(
  history: Record<string, { current: ImageEditRecipe }>,
  sessions: ImageEditSession[],
  snapshots: EditSessionSnapshot[],
) {
  return Object.entries(history).some(
    ([imageId, { current }]) =>
      hasImageEdits(current) &&
      !sessions.some((session, index) => {
        const intent = session.intentForStorage();
        return (
          intent?.sourceImageId === imageId &&
          !['ready', 'not_accepted'].includes(snapshots[index].phase) &&
          JSON.stringify(intent.recipe) === JSON.stringify(current)
        );
      }),
  );
}
