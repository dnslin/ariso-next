'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { LibraryDetail } from '../../server/library/detail-types';
import {
  ReplacementSession,
  replacementJobActive,
} from './replacement-session';

export function useDetailReplacement({
  detail,
  onReturn,
  onCompleted,
  onSessionExpire,
}: {
  detail: LibraryDetail | undefined;
  onReturn: () => void;
  onCompleted: () => void;
  onSessionExpire?: () => void;
}) {
  const imageId = detail?.id ?? null;
  const session = useMemo(
    () =>
      new ReplacementSession(
        imageId ?? '',
        () => undefined,
        () => undefined,
      ),
    [imageId],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    session.setCallbacks(onCompleted, () => {
      if (onSessionExpire) onSessionExpire();
      else
        window.location.replace(
          `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
    });
  }, [session, onCompleted, onSessionExpire]);
  useEffect(() => {
    if (!imageId) return;
    void session.start();
    const visible = () => session.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      session.stop();
    };
  }, [session, imageId]);
  const active = replacementJobActive(snapshot.job);
  return {
    ...snapshot,
    session,
    detail,
    onReturn,
    active,
    choicesDisabled: snapshot.uploading || active || snapshot.unknown,
    canSubmit:
      !!snapshot.file &&
      !snapshot.uploading &&
      !active &&
      !snapshot.checking &&
      !snapshot.unknown &&
      !!snapshot.setup &&
      !snapshot.setup.unavailableReason &&
      snapshot.job?.status !== 'succeeded',
  };
}
export type DetailReplacementController = ReturnType<
  typeof useDetailReplacement
>;
