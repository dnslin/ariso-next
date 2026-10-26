import { useState } from 'react';
import { Button } from '@heroui/react';
import { ChevronDown, ChevronRight, Moon, Sun } from 'lucide-react';
import type { ExtensionSettings, SavedConnection } from '../lib/types';
import { Choice, Field } from './ui';

const versions = [
  ['site', '跟随站点默认'],
  ['original', '原图'],
  ['compressed', '压缩图'],
  ['watermark', '水印图'],
] as const;

export function SettingsPanel({
  connection,
  busy,
  onChange,
  onConnection,
}: {
  connection: SavedConnection;
  busy: boolean;
  onChange: (settings: ExtensionSettings) => void;
  onConnection: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const { settings, capabilities } = connection;
  const patch = (values: Partial<ExtensionSettings>) =>
    onChange({ ...settings, ...values });
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
            isDisabled={busy}
          >
            <span className="min-w-0 truncate">
              {new URL(settings.siteUrl).host}
            </span>
            <ChevronRight size={16} className="shrink-0" />
          </Button>
        </div>
        <Choice
          label="图片可见性"
          value={settings.visibility ?? 'site'}
          options={[
            [
              'site',
              `跟随站点（${capabilities.defaultVisibility === 'public' ? '公开' : '私有'}）`,
            ],
            ['public', '公开'],
            ['private', '私有'],
          ]}
          onChange={(value) =>
            patch({
              visibility: value === 'site' ? null : value,
            })
          }
          disabled={busy}
        />
        <Choice
          label="链接版本"
          value={settings.linkVersion}
          options={versions}
          onChange={(value) => patch({ linkVersion: value })}
          disabled={busy}
        />
        <Button
          variant="ghost"
          isDisabled={busy}
          aria-expanded={advanced}
          className="min-h-11 justify-between rounded-lg px-0 text-xs text-muted"
          onPress={() => setAdvanced((value) => !value)}
        >
          更多上传设置
          <ChevronDown size={15} className={advanced ? 'rotate-180' : ''} />
        </Button>
        {advanced && (
          <div className="grid grid-cols-1 gap-4">
            <Field
              label="默认相册 ID（可选）"
              value={settings.albumId}
              onChange={(albumId) => patch({ albumId })}
              placeholder="相册地址中的 ID"
              disabled={busy}
            />
            <Field
              label="默认标签（可选）"
              value={settings.tag}
              onChange={(tag) => patch({ tag })}
              placeholder="例如：博客配图"
              disabled={busy}
            />
            <Field
              label="存储 ID（可选）"
              value={settings.storageId}
              onChange={(storageId) => patch({ storageId })}
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
            aria-label={settings.theme === 'dark' ? '切换浅色' : '切换深色'}
            onPress={() =>
              patch({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
            }
          >
            {settings.theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
            {settings.theme === 'dark' ? '深色' : '浅色'}
          </Button>
        </div>
      </div>
    </section>
  );
}
