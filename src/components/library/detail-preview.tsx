'use client';

import { useState } from 'react';
import { Tabs } from '@heroui/react/tabs';
import { Skeleton } from '@heroui/react/skeleton';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { ImageOff, Info } from 'lucide-react';
import type {
  LibraryDetail,
  LibraryDetailVersion,
} from '../../server/library/detail-types';
import { bytesLabel, versionLabels } from './detail-labels';

export function initialPreview(detail: LibraryDetail) {
  const order = detail.animated
    ? ['original', 'compressed', 'thumbnail']
    : ['compressed', 'original', 'thumbnail'];
  return (
    order.find((kind) =>
      detail.versions.some((v) => v.kind === kind && v.previewPath),
    ) ?? 'original'
  );
}

export function PreviewImage({
  version,
  name,
  width,
  height,
  onRetry,
}: {
  version: LibraryDetailVersion;
  name: string;
  width: number | null;
  height: number | null;
  onRetry?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      data-testid="preview-stage"
      style={{
        aspectRatio: width && height ? `${width} / ${height}` : undefined,
      }}
      className={`relative w-full min-w-0 max-h-[min(55dvh,420px)] overflow-hidden rounded-xl md:max-h-120 ${width && height ? '' : 'h-62.5'}`}
    >
      {version.previewPath && !failed && !loaded ? (
        <>
          <Skeleton
            data-testid="preview-skeleton"
            aria-hidden
            className="absolute inset-0 size-full rounded-xl"
          />
          <span role="status" className="sr-only">
            正在加载图片…
          </span>
        </>
      ) : null}
      {version.previewPath && !failed ? (
        // The owner cookie and delivery access checks must reach the original route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="detail-preview"
          src={version.previewPath}
          alt={name}
          className={`absolute inset-0 size-full rounded-xl object-contain ${loaded ? '' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 grid content-center justify-items-center gap-3 rounded-xl bg-surface p-4 text-center"
          role="status"
        >
          <ImageOff aria-hidden="true" />
          <p>
            {failed
              ? '当前版本读取失败。'
              : (version.unavailableReason ??
                '此版本仅支持附件下载，无法在浏览器中预览。')}
          </p>
          {failed && onRetry ? (
            <Button
              variant="outline"
              className="min-h-11 rounded-lg"
              onPress={onRetry}
            >
              重试预览
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function DetailPreview({
  detail,
  selected,
  onSelect,
  revision,
  onRetry,
}: {
  detail: LibraryDetail;
  selected: string;
  revision: number;
  onRetry: () => void;
  onSelect: (kind: string) => void;
}) {
  return (
    <div className="grid min-w-0 content-start gap-3 md:[&_[data-testid=preview-stage]]:max-h-[max(160px,min(480px,calc(100cqh-144px)))]">
      <Tabs
        className="relative gap-0"
        selectedKey={selected}
        onSelectionChange={(key) => onSelect(String(key))}
      >
        <Tabs.ListContainer className="w-full rounded-none bg-transparent">
          <Tabs.List
            aria-label="查看版本"
            className="grid w-full grid-cols-[minmax(0,1fr)_44px_repeat(3,minmax(0,1fr))] gap-1.5 rounded-none bg-transparent p-0"
          >
            {detail.versions.map((version, index) => (
              <Tabs.Tab
                key={version.kind}
                id={version.kind}
                style={{ gridColumn: index === 0 ? 1 : index + 2 }}
                isDisabled={!version.saved || !!version.unavailableReason}
                className="min-h-11 min-w-0 rounded-lg border border-border bg-background px-1 text-sm text-foreground data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                {versionLabels[version.kind]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {/* The help trigger is outside the tab collection; its reserved slot never shifts tabs. */}
          {selected === 'original' ? (
            <div
              className="absolute top-0 size-11"
              style={{ left: 'calc((100% - 68px) / 4 + 6px)' }}
            >
              <Popover>
                <Button
                  variant="outline"
                  isIconOnly
                  aria-label="原图说明"
                  className="size-11 rounded-lg"
                >
                  <Info size={18} aria-hidden />
                </Button>
                <Popover.Content className="max-w-80 rounded-xl border border-border bg-surface p-0">
                  <Popover.Dialog
                    aria-label="原图说明"
                    className="p-4 text-sm leading-5"
                  >
                    原图可能包含 GPS 和拍摄信息。复制或下载前请确认分享范围。
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            </div>
          ) : null}
        </Tabs.ListContainer>
        {detail.versions.map((version) => (
          <Tabs.Panel
            key={version.kind}
            id={version.kind}
            className="grid gap-3 p-0 pt-3"
          >
            <PreviewImage
              key={`${revision}:${version.previewPath}:${version.format}:${version.byteSize}`}
              version={version}
              name={detail.displayName}
              width={detail.width}
              height={detail.height}
              onRetry={onRetry}
            />
            <p data-testid="detail-current-version" className="text-sm">
              当前查看：{versionLabels[version.kind]}
              {version.saved
                ? ` · ${version.format?.toUpperCase()} · ${bytesLabel(version.byteSize ?? 0)} · ${version.width ?? '未知'} × ${version.height ?? '未知'} px`
                : ' · 未保存'}
            </p>
          </Tabs.Panel>
        ))}
      </Tabs>
      {detail.versions
        .filter((v) => v.unavailableReason)
        .map((v) => (
          <p key={v.kind} className="text-sm text-muted">
            {versionLabels[v.kind]}：{v.unavailableReason}
          </p>
        ))}
    </div>
  );
}
