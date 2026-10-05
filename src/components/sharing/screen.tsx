'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PublicSharePage } from '../../server/sharing/public-types';
import type { ShareBrand } from './brand';
import { ShareGate } from './gate';
import { ShareList } from './list';
import { ShareSession } from './share-session';

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
  return state.page ? (
    <ShareList
      {...state}
      page={state.page}
      brand={brand}
      onLoadMore={() => void session.loadMore()}
      onReload={() => void session.reload()}
      onCheck={() => void session.refresh()}
    />
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
