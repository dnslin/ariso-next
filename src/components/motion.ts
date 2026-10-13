'use client';

import { useSyncExternalStore } from 'react';

// HeroUI's --ease-out-quint, expressed numerically for Motion.
export const componentEase = [0.23, 1, 0.32, 1] as const;

export function componentEntryTransition(reduce: boolean, delay = 0) {
  return {
    opacity: { duration: reduce ? 0.2 : 0.42, ease: 'linear' as const, delay },
    transform: { duration: 0.48, ease: componentEase, delay },
  };
}

const reducedQuery = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(reducedQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}
