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
    <div className="flex h-62.5 items-center justify-center rounded-xl bg-default md:h-77.5">
      {version.previewPath && !failed ? (
        // The owner cookie and delivery access checks must reach the original route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="detail-preview"
          src={version.previewPath}
          alt={name}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="grid justify-items-center gap-3 p-4 text-center"
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
    <div className="grid min-w-0 content-start gap-3">
      <Tabs
        selectedKey={selected}
        onSelectionChange={(key) => onSelect(String(key))}
      >
        <Tabs.ListContainer className="w-full">
          <Tabs.List
            aria-label="查看版本"
            className="grid w-full grid-cols-4 gap-1 p-0"
          >
            {detail.versions.map((version) => (
              <Tabs.Tab
                key={version.kind}
                id={version.kind}
                isDisabled={!version.saved || !!version.unavailableReason}
                className="min-h-11 min-w-0 px-1 text-sm"
              >
                {versionLabels[version.kind]}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        {detail.versions.map((version) => (
          <Tabs.Panel
            key={version.kind}
            id={version.kind}
            className="grid gap-3 pt-3"
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
