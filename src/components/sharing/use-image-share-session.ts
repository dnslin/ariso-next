'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ImageShareSession } from './image-share-session';

export function useImageShareSession(
  imageId: string,
  onSessionExpire?: () => void,
  onChanged?: () => void,
) {
  const [session] = useState(
    () =>
      new ImageShareSession(
        imageId,
        () => {
          if (onSessionExpire) onSessionExpire();
          else
            window.location.replace(
              `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
            );
        },
        onChanged,
      ),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    void session.start();
    const visible = () => {
      if (!document.hidden) void session.read();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      session.stop();
    };
  }, [session]);
  const share = state.settings?.share;
  useEffect(() => {
    if (!share || share.state !== 'active') return;
    const timer = window.setTimeout(
      () => {
        void session.read();
      },
      Math.max(0, Date.parse(share.expiresAt) - Date.now() + 20),
    );
    return () => window.clearTimeout(timer);
  }, [share, session]);
  return { session, state };
}
