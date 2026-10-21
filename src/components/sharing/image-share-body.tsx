'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { LockKeyhole } from 'lucide-react';
import type { LibraryDetail } from '../../server/library/detail-types';
import { BatchThumbnail } from '../library/batch-targets';
import { DetailReturn } from '../library/detail-controls';
import { PreviewImage } from '../library/detail-preview';
import { versionLabels } from '../library/detail-labels';
import {
  ImageShareActive,
  ImageShareCreate,
  ImageShareNotice,
} from './image-share-controls';
import { useImageShareSession } from './use-image-share-session';

/** Both entry points show the exact role authorized by the share settings. */
export function ImageShareBody({
  detail,
  onReturn,
  onSessionExpire,
  onChanged,
}: {
  detail: LibraryDetail;
  onReturn?: () => void;
  onSessionExpire?: () => void;
  onChanged?: () => void;
}) {
  const { session, state } = useImageShareSession(
    detail.id,
    onSessionExpire,
    onChanged,
  );
  const [confirm, setConfirm] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const returnControl = useRef<HTMLDivElement>(null);
  const settings = state.settings;
  const share = settings?.share;
  const version = detail.versions.find(
    (item) => item.kind === settings?.sourceVersion,
  );
  const previewUrl = version?.previewPath ?? null;
  const active = share?.state === 'active';
  const busy = state.pending !== null;
  useEffect(() => {
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        returnControl.current
          ?.querySelector('button')
          ?.focus({ preventScroll: true }),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
  }, []);
  function retryPreview() {
    setPreviewRevision((value) => value + 1);
    void session.read();
  }
  return (
    <>
      <Modal.Body
        role="region"
        aria-label="私有图片临时分享"
        data-testid="image-share-body"
        className="m-0 grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain p-0"
      >
        {onReturn ? (
          <div ref={returnControl}>
            <DetailReturn onPress={onReturn}>返回图片详情</DetailReturn>
          </div>
        ) : null}
        <div
          className="grid min-w-0 items-start gap-6 md:grid-cols-[1fr_1.05fr]"
          data-share-source={settings?.sourceVersion}
        >
          <div
            className="grid min-w-0 content-start gap-3"
            aria-label="实际分享版本预览"
          >
            {version ? (
              <PreviewImage
                key={`${version.contentId}:${previewRevision}`}
                version={version}
                name={detail.displayName}
                width={version.width}
                height={version.height}
                onRetry={retryPreview}
              />
            ) : (
              <div
                className="grid aspect-[4/3] place-items-center rounded-xl bg-default px-4 text-center text-sm text-muted"
                role="status"
              >
                {settings ? '当前没有可读的分享版本' : '正在核对实际分享版本…'}
              </div>
            )}
            <p className="break-all text-sm font-medium">
              {detail.displayName}
            </p>
            <p className="text-xs leading-6 text-muted">
              私有图片的普通外链仍需所有者登录。
            </p>
          </div>
          <section
            className="grid min-w-0 gap-4 rounded-xl border border-border p-4 text-sm leading-6 md:p-6"
            aria-labelledby="image-share-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid min-w-0 gap-2">
                <h2 id="image-share-heading" className="text-xl font-medium">
                  临时分享
                </h2>
                <p className="text-muted">
                  让持有地址的人免登录查看这一张私有图片。
                </p>
              </div>
              <LockKeyhole
                size={20}
                aria-hidden
                className="shrink-0 text-muted"
              />
            </div>
            <div className="flex min-w-0 items-center gap-4 rounded-xl border border-border p-3">
              <BatchThumbnail
                key={`${version?.contentId}:${previewRevision}`}
                url={previewUrl}
                className="size-20 rounded-lg"
              />
              <div className="grid min-w-0 gap-1">
                <p className="break-all font-medium">{detail.displayName}</p>
                <p className="text-xs text-muted">
                  私有
                  {settings?.sourceVersion
                    ? ` · 分享${versionLabels[settings.sourceVersion]}`
                    : ''}
                </p>
              </div>
            </div>
            {!settings && !state.error ? (
              <p role="status" className="flex items-center gap-2">
                <Spinner size="sm" />
                正在核对分享状态…
              </p>
            ) : null}
            {settings?.sourceVersion === 'original' ? (
              <ImageShareNotice danger>
                本次分享原图。原文件可能包含 GPS
                和拍摄信息，访客可以保存原文件。
              </ImageShareNotice>
            ) : null}
            <p className="text-xs text-muted">
              重处理会更新此预览；替换原图会撤销分享。
            </p>
            {settings?.unavailableReason ? (
              <p role="status">{settings.unavailableReason}</p>
            ) : null}
            {active && share && settings ? (
              <ImageShareActive
                share={share}
                timeZone={settings.timeZone}
                disabled={busy || state.unknown}
                onRevoke={() => setConfirm(true)}
              />
            ) : settings ? (
              <ImageShareCreate
                settings={settings}
                disabled={busy || state.unknown}
                pending={state.pending === 'create'}
                onCreate={(hours) => {
                  void session.create(hours);
                }}
              />
            ) : null}
            {state.error ? (
              <ImageShareNotice danger>{state.error}</ImageShareNotice>
            ) : null}
            {state.unknown || state.error ? (
              <Button
                variant="secondary"
                className="min-h-12 rounded-lg"
                isDisabled={busy}
                onPress={() => {
                  void session.read();
                }}
              >
                核对当前状态
              </Button>
            ) : null}
            {state.message ? (
              <p role="status" className="text-xs text-muted">
                {state.message}
              </p>
            ) : null}
          </section>
        </div>
      </Modal.Body>
      {confirm ? (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) setConfirm(false);
          }}
        >
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              aria-label="撤销图片分享"
              className="w-full max-w-110 gap-4 rounded-xl border border-border bg-background p-6 dark:bg-surface"
            >
              <Modal.Header>
                <Modal.Heading className="text-xl font-medium">
                  撤销这次分享？
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="m-0 p-0 text-sm leading-6">
                旧地址会永久停止接受新访问。已经显示或保存的图片无法收回。
              </Modal.Body>
              <Modal.Footer className="gap-3">
                <Button
                  variant="secondary"
                  className="min-h-12 rounded-lg"
                  onPress={() => setConfirm(false)}
                >
                  保留分享
                </Button>
                <Button
                  variant="danger"
                  className="min-h-12 rounded-lg"
                  onPress={() => {
                    setConfirm(false);
                    void session.revoke();
                  }}
                >
                  确认撤销
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </>
  );
}
