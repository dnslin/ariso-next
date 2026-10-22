'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { toast } from '@heroui/react/toast';
import {
  ReplacementSession,
  replacementJobActive,
} from './replacement-session';
import { notifyLibraryChanged } from './library-changes';

function reportBackgroundError(message: string) {
  toast('替换图片未完成', { variant: 'danger', description: message });
}

export function useDetailReplacement({
  imageId,
  onCompleted,
  onChanged,
  onSessionExpire,
}: {
  imageId: string;
  onCompleted: () => void;
  onChanged: () => void;
  onSessionExpire: () => void;
}) {
  const attached = useRef(true);
  const session = useMemo(
    () =>
      new ReplacementSession(
        imageId,
        () => undefined,
        () => undefined,
        reportBackgroundError,
      ),
    [imageId],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    session.setCallbacks({
      onCompleted,
      onChanged: () => {
        notifyLibraryChanged();
        onChanged();
      },
      onBackgroundError: reportBackgroundError,
      onExpired: () => {
        if (attached.current) onSessionExpire();
        else
          window.location.replace(
            `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
      },
    });
  }, [session, onCompleted, onChanged, onSessionExpire]);
  useEffect(() => {
    attached.current = true;
    void session.start();
    const visible = () => session.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visible);
    return () => {
      attached.current = false;
      document.removeEventListener('visibilitychange', visible);
      session.stop();
    };
  }, [session]);
  const active = replacementJobActive(snapshot.job);
  return {
    ...snapshot,
    session,
    active,
    choicesDisabled:
      snapshot.uploading || active || snapshot.unknown || snapshot.selecting,
  };
}
export type DetailReplacementController = ReturnType<
  typeof useDetailReplacement
>;
