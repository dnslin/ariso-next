'use client';

import { Button } from '@heroui/react';
import { ChevronDown, ChevronRight, Moon, Sun } from 'lucide-react';
import { Choice, Field } from './ui';
import { type Visibility, versionOptions } from './model';

export function UploadSettings({
  busy,
  visibility,
  setVisibility,
  version,
  setVersion,
  album,
  setAlbum,
  tag,
  setTag,
  storageId,
  setStorageId,
  advanced,
  onToggleAdvanced,
  host,
  connected,
  onConnection,
  dark,
  onTheme,
}: {
  busy: boolean;
  visibility: Visibility;
  setVisibility: (value: Visibility) => void;
  version: string;
  setVersion: (value: string) => void;
  album: string;
  setAlbum: (value: string) => void;
  tag: string;
  setTag: (value: string) => void;
  storageId: string;
  setStorageId: (value: string) => void;
  advanced: boolean;
  onToggleAdvanced: () => void;
  host: string;
  connected: boolean;
  onConnection: () => void;
  dark: boolean;
  onTheme: () => void;
}) {
  return (
    <section
      aria-label="上传设置"
      className="max-h-[440px] overflow-y-auto p-4"
    >
      <div className="grid grid-cols-1 gap-5">
        <div>
          <p className="mb-1 text-xs text-muted">站点连接</p>
          <Button
            variant="ghost"
            className="min-h-11 w-full min-w-0 justify-between rounded-lg px-0 text-sm"
            onPress={onConnection}
          >
            <span className="min-w-0 truncate">
              {connected ? host : '连接你的 Ariso'}
            </span>
            <ChevronRight size={16} className="shrink-0" />
          </Button>
        </div>
        <Choice
          label="图片可见性"
          value={visibility}
          options={[
            ['public', '公开'],
            ['private', '私有'],
          ]}
          onChange={(value) => setVisibility(value as Visibility)}
          disabled={busy}
        />
        <Choice
          label="链接版本"
          value={version}
          options={versionOptions}
          onChange={setVersion}
          disabled={busy}
        />
        <Button
          variant="ghost"
          isDisabled={busy}
          aria-expanded={advanced}
          className="min-h-11 justify-between rounded-lg px-0 text-xs text-muted"
          onPress={onToggleAdvanced}
        >
          更多上传设置
          <ChevronDown size={15} className={advanced ? 'rotate-180' : ''} />
        </Button>
        {advanced && (
          <div className="grid gap-4">
            <Field
              label="默认相册 ID（可选）"
              value={album}
              onChange={setAlbum}
              placeholder="相册地址中的 ID"
              disabled={busy}
            />
            <Field
              label="默认标签（可选）"
              value={tag}
              onChange={setTag}
              placeholder="例如：博客配图"
              disabled={busy}
            />
            <Field
              label="存储 ID（可选）"
              value={storageId}
              onChange={setStorageId}
              placeholder="留空使用站点默认存储"
              disabled={busy}
            />
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-xs text-muted">外观</span>
          <Button
            variant="ghost"
            className="min-h-11 rounded-lg px-2 text-xs"
            aria-label={dark ? '切换浅色' : '切换深色'}
            onPress={onTheme}
          >
            {dark ? <Moon size={15} /> : <Sun size={15} />}
            {dark ? '深色' : '浅色'}
          </Button>
        </div>
      </div>
    </section>
  );
}
