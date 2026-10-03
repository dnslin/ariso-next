'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { notifyLibraryChanged } from '../library/library-changes';
import { DetailReadError } from '../library/read-detail';
import { UploadController } from './controller';
import type { UploadSettings } from './settings';
import type { UploadItem, UploadRelation } from './types';

export const uploadTerminalStates = new Set<UploadItem['state']>([
  'ready',
  'upload-failed',
  'processing-failed',
  'cancelled',
]);
const emptyItems: readonly UploadItem[] = [];
const emptySnapshot = () => emptyItems;
const emptySubscribe = () => () => {};

async function readSettings(signal: AbortSignal): Promise<UploadSettings> {
  const response = await fetch('/upload/settings', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json();
    throw new DetailReadError(
      `${body.message}（HTTP ${response.status}）`,
      response.status,
    );
  }
  return response.json();
}

function useUploadLifetime() {
  const pathname = usePathname();
  const [client] = useState(() => new QueryClient());
  const [started, setStarted] = useState(false);
  const [controller, setController] = useState<UploadController | null>(null);
  const ownedController = useRef<UploadController | null>(null);
  const [chosenStorageId, setStorageId] = useState<string>();
  const [chosenVisibility, setVisibility] =
    useState<UploadSettings['defaultVisibility']>();
  const [chosenAlbums, setAlbums] = useState<UploadRelation[]>([]);
  const [chosenTags, setTags] = useState<UploadRelation[]>([]);
  const reset = useCallback(() => {
    // Release synchronously before a login navigation can invoke beforeunload.
    ownedController.current?.destroy();
    ownedController.current = null;
    setController(null);
    setStarted(false);
    setStorageId(undefined);
    setVisibility(undefined);
    setAlbums([]);
    setTags([]);
    client.clear();
  }, [client]);
  useEffect(() => {
    // The root provider survives owner-route navigation; public auth routes end ownership.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Route entry activates the external upload lifetime once.
    if (pathname === '/upload') setStarted(true);
    else if (pathname === '/login' || pathname === '/setup') reset();
  }, [pathname, reset]);
  const expire = useCallback(() => {
    reset();
    window.location.replace('/login?reason=expired&returnTo=%2Fupload');
  }, [reset]);
  const query = useQuery(
    {
      queryKey: ['upload-settings'],
      queryFn: async ({ signal }) => {
        try {
          return await readSettings(signal);
        } catch (error) {
          if (error instanceof DetailReadError && error.status === 401)
            expire();
          throw error;
        }
      },
      enabled: started,
      retry: false,
      networkMode: 'always',
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
    client,
  );
  const settings = query.data;
  const maxFileBytes = settings?.maxFileBytes;
  const queueLimit = settings?.queueLimit;
  const settingsAvailable = settings !== undefined;
  useEffect(() => {
    if (!started || !settingsAvailable) return;
    const initial = client.getQueryData<UploadSettings>(['upload-settings'])!;
    const instance = new UploadController({
      maxFileBytes: initial.maxFileBytes,
      queueLimit: initial.queueLimit,
      onUnauthorized: expire,
      onLibraryChanged: notifyLibraryChanged,
    });
    ownedController.current = instance;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Publish the external store owned by this effect, including StrictMode setup/cleanup.
    setController(instance);
    return () => {
      instance.destroy();
      if (ownedController.current === instance) ownedController.current = null;
    };
  }, [started, settingsAvailable, expire, client]);
  useEffect(() => {
    if (maxFileBytes !== undefined && queueLimit !== undefined)
      controller?.updateLimits({ maxFileBytes, queueLimit });
  }, [controller, maxFileBytes, queueLimit]);
  useEffect(() => () => client.clear(), [client]);
  const items = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const polling = items.some(
    (item) =>
      item.cleanupStatus === 'pending' ||
      ['saving', 'processing-queued', 'processing', 'waiting-upload'].includes(
        item.state,
      ),
  );
  useEffect(() => {
    if (!controller || !polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        async () => {
          await controller.refresh();
          // A skipped or stale read need not change the item; keep polling it.
          if (!stopped) schedule();
        },
        document.hidden ? 10000 : 2000,
      );
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [controller, polling]);
  useEffect(() => {
    if (!controller) return;
    const warn = (event: BeforeUnloadEvent) => {
      // Read live state: explicit session reset must stop warning immediately.
      if (
        !controller.snapshot.some(
          (item) => !uploadTerminalStates.has(item.state) && !item.imageId,
        )
      )
        return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [controller]);
  return {
    client,
    query,
    settings,
    controller,
    items,
    chosenStorageId,
    setStorageId,
    chosenVisibility,
    setVisibility,
    chosenAlbums,
    setAlbums,
    chosenTags,
    setTags,
    expire,
    reset,
  };
}

const UploadContext = createContext<ReturnType<
  typeof useUploadLifetime
> | null>(null);
const ResetUploadContext = createContext<(() => void) | null>(null);

/** One browser-document upload lifetime, shared across owner routes; never persisted. */
export function UploadProvider({ children }: { children: ReactNode }) {
  const upload = useUploadLifetime();
  return (
    <ResetUploadContext value={upload.reset}>
      <UploadContext value={upload}>{children}</UploadContext>
    </ResetUploadContext>
  );
}
export function useUploadQueue() {
  const upload = useContext(UploadContext);
  if (!upload) throw new Error('UploadProvider is missing');
  return upload;
}
export function useResetUpload() {
  const reset = useContext(ResetUploadContext);
  if (!reset) throw new Error('UploadProvider is missing');
  return reset;
}
