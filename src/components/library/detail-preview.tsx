'use client';

import { useState } from 'react';
import { Tabs } from '@heroui/react/tabs';
import { ImageOff } from 'lucide-react';
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
}: {
  version: LibraryDetailVersion;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-w-0 items-center justify-center">
      {version.previewPath && !failed ? (
        // The owner cookie and delivery access checks must reach the original route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="detail-preview"
          src={version.previewPath}
          alt={name}
          className="h-auto max-h-[min(55dvh,420px)] w-auto max-w-full rounded-xl object-contain md:max-h-120"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="grid min-h-62.5 w-full content-center justify-items-center gap-3 rounded-xl bg-surface p-4 text-center"
          role="status"
        >
          <ImageOff aria-hidden="true" />
          <p>
            {failed
              ? '当前版本读取失败，请刷新详情后重试。'
              : (version.unavailableReason ??
                '此版本仅支持附件下载，无法在浏览器中预览。')}
          </p>
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
}: {
  detail: LibraryDetail;
  selected: string;
  revision: number;
  onSelect: (kind: string) => void;
}) {
  return (
    <div className="grid min-w-0 content-start gap-3 md:[&_img]:max-h-[max(160px,min(480px,calc(100cqh-144px)))]">
      <Tabs
        className="gap-0"
        selectedKey={selected}
        onSelectionChange={(key) => onSelect(String(key))}
      >
        <Tabs.ListContainer className="w-full rounded-none bg-transparent">
          <Tabs.List
            aria-label="查看版本"
            className="grid w-full grid-cols-4 gap-1.5 rounded-none bg-transparent p-0"
          >
            {detail.versions.map((version) => (
              <Tabs.Tab
                key={version.kind}
                id={version.kind}
                isDisabled={!version.saved || !!version.unavailableReason}
                className="min-h-11 min-w-0 rounded-lg border border-border bg-background px-1 text-sm text-foreground data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                {versionLabels[version.kind]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
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
