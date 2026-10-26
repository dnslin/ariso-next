import { useCallback, useEffect, useRef, useState } from 'react';
import {
  authorizeAndFetchSource,
  dismissSourceRequest,
  fetchSource,
  hasSourcePermission,
  readSourceRequests,
  subscribeSourceRequests,
} from '../lib/sources';
import type { UploadController } from '../lib/controller';
import type { SourceRequest } from '../lib/types';
import { messageOf } from './ui';

export type SourceEntry = SourceRequest & {
  state: 'checking' | 'permission' | 'fetching' | 'failed';
  message?: string;
};

export function useSources(
  controller: UploadController,
  maxFileBytes: number | undefined,
  onError: (message: string) => void,
  onNewSource: () => void,
) {
  const [entries, setEntries] = useState<SourceEntry[]>([]);
  const working = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const observed = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    function replace(requests: SourceRequest[]) {
      if (disposed) return;
      const added = requests.some(
        (request) =>
          !observed.current.has(request.id) && !removed.current.has(request.id),
      );
      requests.forEach((request) => observed.current.add(request.id));
      setEntries((current) =>
        requests
          .filter((request) => !removed.current.has(request.id))
          .map(
            (request) =>
              current.find((entry) => entry.id === request.id) ?? {
                ...request,
                state: 'checking',
              },
          ),
      );
      if (added) onNewSource();
    }
    const unsubscribe = subscribeSourceRequests((requests) => {
      revision++;
      replace(requests);
    });
    void readSourceRequests()
      .then((requests) => {
        if (revision === 0) replace(requests);
      })
      .catch((error) => {
        if (!disposed) onError(messageOf(error));
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [onError, onNewSource]);

  const setState = useCallback(
    (id: string, values: Pick<SourceEntry, 'state' | 'message'>) => {
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, ...values } : entry,
        ),
      );
    },
    [],
  );

  const consume = useCallback(
    async (request: SourceRequest, filePromise: Promise<File>) => {
      working.current.add(request.id);
      setState(request.id, { state: 'fetching', message: undefined });
      try {
        const file = await filePromise;
        if (removed.current.has(request.id)) return;
        const result = controller.addFiles([file], 'web');
        if (!result.added)
          throw new Error(
            result.message ?? '图片没有加入队列，请检查上传限制。',
          );
        // The file is already in the queue. Do not offer a second download if session cleanup fails.
        removed.current.add(request.id);
        setEntries((current) =>
          current.filter((entry) => entry.id !== request.id),
        );
        await dismissSourceRequest(request.id);
      } catch (error) {
        if (removed.current.has(request.id))
          onError(`图片已加入队列，但来源记录未能清除：${messageOf(error)}`);
        else
          setState(request.id, { state: 'failed', message: messageOf(error) });
      } finally {
        working.current.delete(request.id);
      }
    },
    [controller, onError, setState],
  );

  useEffect(() => {
    if (maxFileBytes === undefined) return;
    for (const entry of entries) {
      if (entry.state !== 'checking' || working.current.has(entry.id)) continue;
      working.current.add(entry.id);
      void Promise.resolve()
        .then(() => hasSourcePermission(entry.url))
        .then((allowed) => {
          if (removed.current.has(entry.id)) return;
          if (allowed) return consume(entry, fetchSource(entry, maxFileBytes));
          setState(entry.id, { state: 'permission' });
        })
        .catch((error) =>
          setState(entry.id, { state: 'failed', message: messageOf(error) }),
        )
        .finally(() => working.current.delete(entry.id));
    }
  }, [consume, entries, maxFileBytes, setState]);

  function authorize(entry: SourceEntry) {
    if (maxFileBytes === undefined || working.current.has(entry.id)) return;
    // Call the permission API before yielding the user's button gesture.
    const file = authorizeAndFetchSource(entry, maxFileBytes);
    void consume(entry, file);
  }
  async function dismiss(entry: SourceEntry) {
    if (working.current.has(entry.id)) return;
    try {
      await dismissSourceRequest(entry.id);
      removed.current.add(entry.id);
      setEntries((current) =>
        current.filter((candidate) => candidate.id !== entry.id),
      );
    } catch (error) {
      onError(messageOf(error));
    }
  }
  return { entries, authorize, dismiss };
}
