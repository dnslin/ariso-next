import type { LibraryLayout, LibraryLoadingMode } from './query-state';

export type LibraryPreferences = {
  layout: LibraryLayout;
  loadingMode: LibraryLoadingMode;
};
export const defaultLibraryPreferences: LibraryPreferences = {
  layout: 'grid',
  loadingMode: 'more',
};
export const libraryPreferencesKey = 'ariso:library-preferences:v1';

export function readLibraryPreferences(
  storage: Pick<Storage, 'getItem'>,
): LibraryPreferences {
  const value = storage.getItem(libraryPreferencesKey);
  if (!value) return defaultLibraryPreferences;
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('layout' in parsed) ||
    !('loadingMode' in parsed) ||
    (parsed.layout !== 'grid' && parsed.layout !== 'masonry') ||
    (parsed.loadingMode !== 'more' && parsed.loadingMode !== 'pages')
  )
    throw new Error('保存的图库显示偏好无效');
  return { layout: parsed.layout, loadingMode: parsed.loadingMode };
}

// Only presentation preferences live beyond a mounted page; no private image data.
let current: LibraryPreferences | null = null;
const listeners = new Set<() => void>();
export function getLibraryPreferences(): LibraryPreferences {
  if (current) return current;
  try {
    current = readLibraryPreferences(window.localStorage);
  } catch (error) {
    console.warn('无法读取图库显示偏好，本次会话使用默认偏好。', error);
    current = defaultLibraryPreferences;
  }
  return current;
}
export function setLibraryPreferences(patch: Partial<LibraryPreferences>) {
  current = { ...getLibraryPreferences(), ...patch };
  try {
    window.localStorage.setItem(libraryPreferencesKey, JSON.stringify(current));
  } catch (error) {
    console.warn('无法保存图库显示偏好，仅在本次会话内保留。', error);
  }
  for (const notify of listeners) notify();
}
export function subscribeLibraryPreferences(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
export function serverLibraryPreferences() {
  return null;
}
