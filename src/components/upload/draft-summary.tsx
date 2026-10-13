'use client';

import type { RefObject } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import type { UploadSettings } from './settings';

export function UploadDraftSummary({
  storage,
  visibility,
  albumCount,
  tagCount,
  started,
  settingsRef,
}: {
  storage: UploadSettings['storages'][number] | undefined;
  visibility: 'public' | 'private';
  albumCount: number;
  tagCount: number;
  started: boolean;
  settingsRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <Card
      data-testid="upload-draft-summary"
      aria-label="当前草稿上传设置"
      className="min-w-0 gap-0 rounded-2xl border border-border bg-surface px-4 py-3 shadow-none md:hidden"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-sm font-medium">
            {started ? '下一次设置' : '本次设置'}
          </h2>
          <p className="text-sm leading-5 [overflow-wrap:anywhere]">
            {storage?.name ?? '未选择可用存储'}
            {storage && !storage.enabled ? '（已停用）' : ''} ·{' '}
            {visibility === 'private' ? '私有' : '公开'}
          </p>
          <p className="text-xs leading-5 text-muted">
            {albumCount} 个相册 · {tagCount} 个标签
          </p>
        </div>
        <Button
          variant="ghost"
          className="min-h-11 min-w-11 shrink-0 rounded-lg px-2 text-sm font-normal"
          aria-label="修改上传设置"
          aria-controls="upload-settings-fields"
          onPress={() => {
            const settings = settingsRef.current;
            if (!settings) return;
            settings.scrollIntoView({
              block: 'start',
              behavior: 'instant',
            });
            (
              settings.querySelector<HTMLButtonElement>(
                'button[aria-haspopup="listbox"]:not(:disabled)',
              ) ?? settings
            ).focus({ preventScroll: true });
          }}
        >
          修改
        </Button>
      </div>
    </Card>
  );
}
