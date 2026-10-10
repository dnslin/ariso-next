'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { Trash2, Upload } from 'lucide-react';
import { BrandingMark } from './branding-mark';
import { brandLabels, type BrandKind } from './branding-api';

export function BrandingRow({
  kind,
  url,
  disabled,
  onSelect,
  onRemove,
}: {
  kind: BrandKind;
  url: string | null;
  disabled: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const [missing, setMissing] = useState<string | null>(null);
  const failed = url !== null && missing === url;
  const label = brandLabels[kind];
  return (
    <div
      data-testid={`branding-${kind}`}
      data-state={failed ? 'missing' : 'ready'}
      className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-center gap-x-4 gap-y-4 p-4 min-[768px]:grid-cols-[96px_minmax(0,1fr)_auto] min-[768px]:gap-6 min-[768px]:p-6"
    >
      <div className="grid size-20 place-items-center rounded-xl border border-border bg-background min-[768px]:size-24">
        <BrandingMark kind={kind} url={url} onMissing={() => setMissing(url)} />
      </div>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium">{label}</h2>
          <Chip size="sm" variant="soft" color={failed ? 'danger' : 'default'}>
            <Chip.Label>
              {failed ? '无法读取' : url ? '自定义' : '内置'}
            </Chip.Label>
          </Chip>
        </div>
        <p className="text-sm">
          {kind === 'logo' ? '站点标识' : '浏览器标签图标'}
        </p>
        <p className="text-xs leading-5 text-muted">
          {kind === 'logo'
            ? 'PNG / JPEG / WebP / 静态 SVG'
            : 'PNG / ICO / 静态 SVG'}
          <span className="block min-[640px]:inline">
            <span className="hidden min-[640px]:inline"> · </span>最大 5 MiB
          </span>
        </p>
        {failed ? (
          <p role="alert" className="text-xs text-danger">
            当前文件无法读取，请替换或移除。
          </p>
        ) : null}
      </div>
      <div className="col-span-2 flex justify-end gap-2 min-[768px]:col-span-1 min-[768px]:flex-col">
        <Button
          aria-label={`选择 ${label} 文件`}
          data-testid={`branding-${kind}-choose`}
          className="min-h-11 min-w-28 rounded-lg px-4 text-sm"
          isDisabled={disabled}
          onPress={onSelect}
        >
          <Upload aria-hidden className="size-4" />
          {url ? '替换文件' : '选择文件'}
        </Button>
        {url ? (
          <Button
            aria-label={`移除 ${label}`}
            data-testid={`branding-${kind}-delete`}
            variant="ghost"
            className="min-h-11 min-w-28 rounded-lg px-4 text-sm"
            isDisabled={disabled}
            onPress={onRemove}
          >
            <Trash2 aria-hidden className="size-4" />
            移除
          </Button>
        ) : null}
      </div>
    </div>
  );
}
