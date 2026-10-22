'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@heroui/react/toast';
import type { LibrarySelection } from '../../app/library/use-library-selection';
import type { ArchiveVersion } from '../../server/library/archive-types';
import { versionLabels } from './detail-labels';
import {
  ArchiveRequestError,
  requestArchivePreparation,
  startArchiveDownload,
} from './archive-request';

export function useLibraryArchive({
  selection,
  query,
  onExpire,
}: {
  selection: LibrarySelection;
  query: string;
  onExpire: () => void;
}) {
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [query]);

  async function start(version: ArchiveVersion) {
    if (controller.current && !controller.current.signal.aborted) return;
    const ids = [...selection.selected.keys()];
    if (!ids.length) return;
    if (ids.length > 200) {
      toast('单次最多打包 200 张图片，请调整选择。', { variant: 'danger' });
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    try {
      const result = await requestArchivePreparation(
        { ids, query, version },
        active.signal,
      );
      active.signal.throwIfAborted();
      startArchiveDownload(result.downloadUrl);
    } catch (error) {
      if (active.signal.aborted) return;
      if (error instanceof ArchiveRequestError && error.status === 401) {
        selection.clear();
        onExpire();
        return;
      }
      toast(`无法下载${versionLabels[version]}`, {
        variant: 'danger',
        description:
          error instanceof Error ? error.message : '打包下载失败，请重试。',
      });
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setPending(false);
      }
    }
  }

  return { pending, start };
}
export type LibraryArchive = ReturnType<typeof useLibraryArchive>;
