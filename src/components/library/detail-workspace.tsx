'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { ImageOff } from 'lucide-react';
import type {
  LibraryDetail,
  LibraryDetailVersion,
} from '../../server/library/detail-types';
import { bytesLabel, versionLabels } from './detail-labels';
import { DetailReturn, DetailTip } from './detail-controls';

const versionStatusLabels = {
  saved: '已保存',
  not_applicable: '不适用',
  disabled: '处理已关闭',
  failed: '处理失败',
  not_generated: '尚未生成',
};

export function versionDescription(version: LibraryDetailVersion) {
  return version.saved
    ? `${version.format?.toUpperCase() ?? '格式未知'} · ${version.width ?? '未知'} × ${version.height ?? '未知'}`
    : versionStatusLabels[version.status];
}

export function DetailIdentity({
  detail,
  reprocess = false,
}: {
  detail: LibraryDetail;
  reprocess?: boolean;
}) {
  const thumbnail = detail.versions.find(
    (version) => version.kind === 'thumbnail',
  );
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3 xl:gap-6">
      <div
        className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-default xl:h-21 xl:w-28 ${reprocess ? 'h-16 w-[85px]' : 'h-15 w-20'}`}
      >
        {thumbnail?.previewPath && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail.previewPath}
            alt=""
            className="size-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <ImageOff
            aria-label={failed ? '缩略图读取失败' : '没有可读缩略图'}
            size={22}
          />
        )}
      </div>
      <div className="min-w-0 text-[13px] leading-normal [overflow-wrap:anywhere]">
        <p>{detail.displayName}</p>
        <p>原图 · {bytesLabel(detail.byteSize)}</p>
      </div>
    </div>
  );
}

export function DetailVersions({
  detail,
  selected,
  onClose,
}: {
  detail: LibraryDetail;
  selected: string;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      data-testid="detail-versions"
      className="grid min-w-0 gap-3 xl:gap-4"
    >
      <DetailReturn onPress={onClose}>返回图库</DetailReturn>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1
          ref={heading}
          tabIndex={-1}
          data-testid="detail-workspace-title"
          className="text-[28px] font-medium leading-normal xl:text-[30px]"
        >
          当前版本与已有文件
        </h1>
        <DetailTip label="版本说明">
          <p>这里展示当前已保存的版本，没有历史回滚功能。</p>
          <p>关闭处理开关也不会删除已保存的旧版本。</p>
        </DetailTip>
      </div>
      <p className="text-[13px] leading-normal [overflow-wrap:anywhere]">
        {detail.displayName} · 当前预览
        {versionLabels[selected as keyof typeof versionLabels]}
      </p>
      <DetailIdentity detail={detail} />
      <dl className="rounded-2xl border border-border px-3 py-2 text-sm leading-normal xl:px-5">
        {detail.versions.map((version) => (
          <div
            key={version.kind}
            data-testid={`version-info-${version.kind}`}
            className="grid min-h-18 content-start gap-0 pt-0.5 xl:grid-cols-3 xl:content-center xl:gap-4 xl:pt-0"
          >
            <dt>{versionLabels[version.kind]}</dt>
            <dd className="[overflow-wrap:anywhere]">
              {versionDescription(version)}
              <span className="xl:hidden">
                {version.byteSize !== null
                  ? ` · ${bytesLabel(version.byteSize)}`
                  : ''}
              </span>
              {!version.saved && version.unavailableReason ? (
                <span className="block text-[13px] text-muted">
                  {version.unavailableReason}
                </span>
              ) : null}
            </dd>
            <dd className="hidden xl:block">
              {version.byteSize !== null ? bytesLabel(version.byteSize) : '—'}
            </dd>
          </div>
        ))}
      </dl>
      {!detail.storage.enabled ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>存储已停用</Alert.Title>
            <Alert.Description>
              已保存版本的资料仍保留，内容暂时不可读。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </section>
  );
}

export function DetailVersionsFooter({
  detail,
  onReturn,
  onReprocess,
}: {
  detail: LibraryDetail | undefined;
  onReturn: () => void;
  onReprocess: () => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 xl:w-auto xl:grid-cols-[200px_200px]">
      <Button
        variant="outline"
        className="h-12 w-full rounded-lg"
        onPress={onReturn}
      >
        返回详情
      </Button>
      <Button
        className="h-12 w-full rounded-lg"
        isDisabled={!detail}
        onPress={onReprocess}
      >
        重新处理
      </Button>
    </div>
  );
}
