'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Button, Link, ProgressBar } from '@heroui/react';
import {
  Check,
  CircleAlert,
  Clock3,
  ImageOff,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { ImageEditSession } from './session';
import { editJobActive } from './session';
import { useImageEditor } from './state';
import { stepLabels } from '../library/detail-labels';

function sessionStore(sessions: ImageEditSession[]) {
  let snapshot = sessions.map((session) => session.getSnapshot());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      snapshot = sessions.map((session) => session.getSnapshot());
      const unsub = sessions.map((session) =>
        session.subscribe(() => {
          snapshot = sessions.map((item) => item.getSnapshot());
          listener();
        }),
      );
      return () => unsub.forEach((fn) => fn());
    },
  };
}
export function useEditSessionSnapshots(sessions: ImageEditSession[]) {
  const store = useMemo(() => sessionStore(sessions), [sessions]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
function Thumbnail({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="grid h-18 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-default/20">
      {src && !failed ? (
        <Image
          src={src}
          alt={name}
          width={96}
          height={72}
          unoptimized
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff size={20} className="text-muted" />
      )}
    </div>
  );
}
export function EditResults() {
  const editor = useImageEditor();
  const snapshots = useEditSessionSnapshots(editor.sessions);
  const succeeded = snapshots.filter(
    (snapshot) => snapshot.job?.status === 'succeeded',
  ).length;
  const failed = editor.sessions.filter((_, index) =>
    ['failed', 'cancelled'].includes(snapshots[index].job?.status ?? ''),
  );
  const active = snapshots.some(
    (snapshot) =>
      editJobActive(snapshot.job) || snapshot.phase === 'submitting',
  );
  const unknown = snapshots.filter(
    (snapshot) => snapshot.phase === 'unknown',
  ).length;
  const pending = snapshots.filter(
    (snapshot) => snapshot.phase === 'ready',
  ).length;
  const settled = snapshots.filter(
    (snapshot) =>
      snapshot.phase === 'not_accepted' ||
      (snapshot.job && !editJobActive(snapshot.job)),
  ).length;
  return (
    <section
      className="mx-auto grid w-full max-w-5xl gap-6 py-4"
      aria-labelledby="edit-results-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="edit-results-title" className="text-2xl">
            {editor.submittingBatch || active
              ? '正在保存图片'
              : unknown
                ? '保存结果待核对'
                : pending
                  ? '后续提交已停止'
                  : failed.length
                    ? '部分图片未保存'
                    : '图片保存结果'}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {succeeded} 张成功{failed.length ? `，${failed.length} 张失败` : ''}
            {unknown ? `，${unknown} 张待核对` : ''}
            {pending ? `，${pending} 张尚未提交` : ''}
            。已受理任务会继续由服务器处理。
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg"
          onPress={() => void editor.returnToEditing()}
        >
          返回编辑
        </Button>
      </header>
      {editor.sessions.length > 0 && (
        <ProgressBar
          aria-label="图片保存进度"
          value={settled}
          maxValue={editor.sessions.length}
        >
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {editor.sessions.map((session, index) => {
          const snapshot = snapshots[index];
          const image = editor.images.find(
            (item) => item.id === session.reference.sourceImageId,
          );
          const job = snapshot.job;
          const complete = job?.status === 'succeeded';
          const result = job?.resultImageId;
          const src =
            complete && result
              ? `/i/${encodeURIComponent(result)}?type=thumbnail&v=${encodeURIComponent(session.reference.requestId)}`
              : (image?.src ?? '');
          const status = complete
            ? '已保存'
            : job?.status === 'failed' || job?.status === 'cancelled'
              ? '保存未完成'
              : editJobActive(job)
                ? job?.status === 'queued'
                  ? '服务器排队中'
                  : '正在生成并保存图片…'
                : snapshot.phase === 'unknown'
                  ? '提交结果待核对'
                  : snapshot.phase === 'not_accepted'
                    ? '未受理'
                    : snapshot.phase === 'submitting'
                      ? '正在提交，等待服务器确认…'
                      : '尚未提交';
          return (
            <article
              key={session.reference.requestId}
              data-request-id={session.reference.requestId}
              data-status={job?.status ?? snapshot.phase}
              data-result-image-id={job?.resultImageId ?? undefined}
              className="flex flex-wrap items-center gap-4 bg-surface p-4"
            >
              <Thumbnail
                src={src}
                name={image?.name ?? session.reference.sourceImageId}
              />
              <div className="min-w-0 flex-1 basis-40">
                <h2 className="truncate text-sm font-medium">
                  {image?.name ?? session.reference.sourceImageId}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {session.reference.mode === 'copy'
                    ? '另存为新图，原图保留'
                    : '覆盖原图，保持已有链接'}
                </p>
                <p
                  className="mt-2 flex items-center gap-1.5 text-xs"
                  role="status"
                >
                  {complete ? (
                    <Check size={14} />
                  ) : snapshot.phase === 'unknown' ||
                    job?.status === 'failed' ? (
                    <CircleAlert size={14} />
                  ) : (
                    <Clock3 size={14} />
                  )}{' '}
                  {status}
                  {job?.step && editJobActive(job)
                    ? `：${stepLabels[job.step] ?? '处理中'}`
                    : ''}
                </p>
                {(snapshot.message || job?.error) && (
                  <p
                    role="alert"
                    className="mt-2 break-words text-xs text-danger"
                  >
                    {snapshot.message || job?.error}
                  </p>
                )}
                <details className="mt-2 text-xs text-muted">
                  <summary>任务编号</summary>
                  <p className="mt-1 break-all select-text">
                    {session.reference.requestId}
                  </p>
                </details>
              </div>
              <div className="flex flex-wrap gap-2">
                {complete && result ? (
                  <>
                    <Link
                      href={`/library?image=${encodeURIComponent(result)}`}
                      className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm"
                    >
                      查看图片
                    </Link>
                    <Link
                      href={`/i/${encodeURIComponent(result)}?type=original&download=1`}
                      download
                      className="inline-flex min-h-11 items-center rounded-lg bg-default px-4 text-sm"
                    >
                      下载编辑结果
                    </Link>
                  </>
                ) : (
                  <>
                    {(snapshot.phase === 'unknown' || snapshot.message) && (
                      <Button
                        variant="outline"
                        className="min-h-11 rounded-lg text-xs"
                        isDisabled={
                          snapshot.checking || snapshot.phase === 'submitting'
                        }
                        onPress={() => void session.read()}
                      >
                        核对任务状态
                      </Button>
                    )}
                    {(['failed', 'cancelled'].includes(job?.status ?? '') ||
                      session.canResubmit()) && (
                      <Button
                        variant="outline"
                        className="min-h-11 rounded-lg text-xs"
                        isDisabled={snapshot.checking}
                        onPress={() => void session.retry()}
                      >
                        <RotateCcw size={14} />
                        重试这一项
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!editor.sessions.length && (
        <p className="py-12 text-center text-sm text-muted">
          还没有已提交的编辑任务。
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {editor.submittingBatch ? (
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={editor.stopPending}
          >
            <Square size={14} />
            停止尚未提交的图片
          </Button>
        ) : pending > 0 ? (
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={() => void editor.resumePending()}
          >
            继续提交 {pending} 张
          </Button>
        ) : null}
        {failed.length > 0 && (
          <Button
            variant="secondary"
            className="min-h-11 rounded-lg"
            onPress={() => {
              void (async () => {
                for (const session of failed) await session.retry();
              })();
            }}
          >
            仅重试失败的 {failed.length} 张
          </Button>
        )}
        <Button
          variant="primary"
          className="min-h-11 rounded-lg"
          onPress={editor.onClose}
        >
          完成
        </Button>
      </div>
    </section>
  );
}
