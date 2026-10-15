'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import type { PublicSharePage } from '../../server/sharing/public-types';
import type { ShareBrand } from './brand';
import { ShareGate } from './gate';
import { ShareList } from './list';
import { ShareSession } from './share-session';

const ShareViewer = dynamic(() => import('./viewer'), { ssr: false });

export function ShareScreen({
  token,
  initial,
  brand,
}: {
  token: string;
  initial: { status: number; page: PublicSharePage | null };
  brand: ShareBrand;
}) {
  const [session] = useState(() => new ShareSession(token, initial));
  const source = useRef<HTMLElement | null>(null);
  const sourceScroll = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    const onVisibility = () => session.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      session.stop();
    };
  }, [session]);
  const viewing = state.viewer !== null;
  useEffect(() => {
    if (viewing || !source.current) return;
    const target = source.current;
    source.current = null;
    // Restore the document viewport as well as focus after the viewer unlocks it.
    if (state.page) {
      if (target.isConnected) target.focus({ preventScroll: true });
      else {
        const heading = list.current?.querySelector('h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      }
      window.scrollTo({ top: sourceScroll.current });
    }
  }, [viewing, state.page]);
  return state.page ? (
    <>
      <div
        ref={list}
        className={viewing ? 'invisible' : ''}
        inert={viewing}
        aria-hidden={viewing}
      >
        <ShareList
          {...state}
          page={state.page}
          brand={brand}
          onLoadMore={() => void session.loadMore()}
          onReload={() => void session.reload()}
          onCheck={() => void session.refresh()}
          onOpen={(imageId, target) => {
            source.current = target;
            sourceScroll.current = window.scrollY;
            void session.openViewer(imageId);
          }}
        />
      </div>
      {state.viewer ? (
        <ShareViewer
          viewer={state.viewer}
          loading={state.viewerLoading}
          error={state.viewerError}
          refreshError={state.refreshError}
          refreshing={state.refreshing}
          onClose={session.closeViewer}
          onNavigate={(direction) => void session.navigateViewer(direction)}
          onRetry={() => void session.retryViewer()}
          onCheck={() => void session.refresh()}
        />
      ) : null}
    </>
  ) : (
    <ShareGate
      token={token}
      brand={brand}
      status={state.status}
      revoked={state.revoked}
      loading={state.loading}
      onUnlocked={() => session.reload()}
      onUnavailable={(status) => session.setUnavailable(status)}
      onRetry={() => void session.reload()}
    />
  );
}
