'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { ArrowLeft } from 'lucide-react';
import type { CleanupController } from './use-cleanup';
import { bytesLabel } from './detail-labels';

const purposeLabels = {
  original: '原图',
  thumbnail: '缩略图',
  compressed: '压缩图',
  watermark: '水印图',
  temporary: '候选文件',
};
const purposeLabel = (purpose: string) =>
  purposeLabels[purpose as keyof typeof purposeLabels] ?? purpose;
const actionClass =
  'h-12 min-h-12 min-w-0 flex-1 rounded-lg font-normal md:w-50 md:flex-none';

export function CleanupContent({
  cleanup,
  onBack,
}: {
  cleanup: CleanupController;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { record, task, pending, unknown, error } = cleanup;
  const modal =
    cleanup.confirmation ||
    unknown ||
    (!cleanup.progress && task?.status === 'queued' && !unknown) ||
    task?.status === 'succeeded';
  useEffect(() => {
    if (cleanup.visible && !modal)
      heading.current?.focus({ preventScroll: true });
  }, [cleanup.visible, modal]);
  if (!cleanup.visible || !record) return null;
  const failed = task?.status === 'failed';
  const repeated = failed && task.cycle > 1;
  const succeeded = task?.status === 'succeeded';
  const waitingForWrites = task?.waitingForWrites === true;
  const stoppedConfirmation =
    cleanup.confirmation &&
    !record.storage.enabled &&
    !cleanup.storageConfirmed;
  const title = stoppedConfirmation
    ? '存储停用，仍可永久删除'
    : cleanup.confirmation
      ? record.storage.enabled
        ? '永久删除这张图片？'
        : '永久删除停用存储中的图片？'
      : succeeded
        ? '永久删除完成'
        : unknown
          ? '操作结果待核对'
          : repeated
            ? '剩余清理再次失败'
            : failed
              ? '部分文件清理失败'
              : task?.status === 'queued'
                ? waitingForWrites
                  ? '等待当前处理结束'
                  : '已加入删除队列'
                : task
                  ? '正在清理文件'
                  : '正在核对清理状态';
  const description = stoppedConfirmation
    ? '停用只限制内容访问，不阻止清理。删除仍使用当前存储凭据，实际权限或连接问题会显示失败原因。'
    : cleanup.confirmation
      ? record.storage.enabled
        ? '任务受理后不可恢复。会清理原图、所有派生版本及待清理对象；未清理完的记录会继续保留。'
        : '确认后不可恢复。停用不妨碍清理；如果删除权限或连接失败，保留记录与剩余清理明细。'
      : succeeded
        ? '所有文件与活动写入责任均已清理。空间按实际结果释放，历史访问统计仍按统计规则保留。'
        : unknown
          ? '请先核对记录或任务状态，再决定下一步。不会自动重复提交恢复或永久删除请求。'
          : task?.status === 'queued'
            ? waitingForWrites
              ? '正在停止或等待当前写入结束，并核对可能迟到的文件。全部清理完成前，记录不会移除。'
              : '任务已受理，文件尚未全部清理。记录仍保留；关闭页面后任务继续，不能恢复或重复提交。'
            : failed
              ? '请核对实际错误并修复权限或连接问题，再重试剩余对象。记录不可恢复，存储引用仍保留。'
              : '永久删除已开始，不可恢复。空间按实际确认结果释放，待核对部分不会显示为零。';
  const identity = succeeded
    ? `${record.displayName} 已从回收站移除。`
    : cleanup.confirmation && !record.storage.enabled
      ? `${record.displayName} · ${record.storage.name}已停用`
      : cleanup.confirmation
        ? `${record.displayName} · 原文件 ${bytesLabel(record.byteSize)}`
        : task?.status === 'queued' && waitingForWrites
          ? `${record.displayName} · 删除中`
          : `${record.displayName}${task?.deletedObjects != null && task.totalObjects != null ? ` · 已确认清理 ${task.deletedObjects} / ${task.totalObjects} 个对象` : task ? ` · 剩余 ${task.remaining.length} 个对象` : ''}`;
  const messages = (
    <>
      {error ? (
        <p role="alert" className="whitespace-pre-wrap text-sm text-danger">
          {error}
          {unknown ? '；提交结果待核对，不会自动重新提交。' : ''}
        </p>
      ) : null}
      {cleanup.refreshError ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm">
            回收站刷新失败：{cleanup.refreshError}
          </p>
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={cleanup.retryRefresh}
          >
            重新刷新回收站
          </Button>
        </div>
      ) : null}
    </>
  );
  if (modal)
    return (
      <Modal
        isOpen
        onOpenChange={(open) => {
          if (!open && !pending) onBack();
        }}
      >
        <Modal.Backdrop
          isDismissable={!pending}
          isKeyboardDismissDisabled={pending}
        >
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog
              data-testid="cleanup-modal"
              aria-busy={pending}
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 dark:bg-surface [overflow-wrap:anywhere]"
            >
              <Modal.Header className="p-0">
                <Modal.Heading className="text-xl font-medium leading-normal">
                  {title}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-4 p-0">
                <p className="text-sm leading-normal">
                  {unknown ? '连接中断，暂时无法确认是否已受理。' : identity}
                </p>
                <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
                  {description}
                </p>
                {task && !succeeded && !waitingForWrites ? (
                  <p className="text-xs text-muted">
                    任务 {task.jobId} · 清理周期 {task.cycle}
                  </p>
                ) : null}
                {messages}
              </Modal.Body>
              <Modal.Footer className="m-0 grid grid-cols-1 gap-4 p-0">
                {!succeeded ? (
                  <Button
                    autoFocus
                    variant="outline"
                    className="h-12 w-full rounded-lg font-normal"
                    isDisabled={pending}
                    onPress={onBack}
                  >
                    {cleanup.confirmation ? '取消' : '返回回收站'}
                  </Button>
                ) : null}
                <Button
                  className="h-12 w-full rounded-lg font-normal"
                  data-testid="cleanup-submit"
                  isDisabled={pending}
                  onPress={() => {
                    if (succeeded) onBack();
                    else if (unknown) void cleanup.check();
                    else if (stoppedConfirmation) cleanup.confirmStorage();
                    else if (cleanup.confirmation) void cleanup.submit();
                    else cleanup.showProgress();
                  }}
                >
                  {pending
                    ? '正在提交…'
                    : succeeded
                      ? '返回回收站'
                      : unknown
                        ? '核对任务状态'
                        : stoppedConfirmation
                          ? '继续确认删除'
                          : cleanup.confirmation
                            ? '确认永久删除'
                            : waitingForWrites
                              ? '查看清理进度'
                              : '查看任务状态'}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  const knownBytes =
    task?.remaining.reduce((sum, object) => sum + (object.byteSize ?? 0), 0) ??
    0;
  const unconfirmedBytes = task?.remaining.some(
    (object) => object.byteSize === null,
  );
  const remainingBytes = unconfirmedBytes
    ? knownBytes
      ? `${bytesLabel(knownBytes)} 已确认 · 其余待核对`
      : '待核对'
    : bytesLabel(knownBytes);
  if (repeated && task)
    return (
      <section
        data-testid="cleanup-workspace"
        aria-busy={pending}
        aria-labelledby="cleanup-title"
        className="grid min-w-0 gap-4 md:max-w-190 [overflow-wrap:anywhere]"
      >
        <h1
          ref={heading}
          id="cleanup-title"
          tabIndex={-1}
          className="text-2xl font-medium leading-normal md:text-[30px]"
        >
          {title}
        </h1>
        <p role="status" className="text-sm leading-normal text-muted">
          {identity}
        </p>
        {messages}
        <Card className="gap-0 rounded-lg bg-default px-4 py-3 shadow-none">
          <Card.Content className="grid gap-1.5 p-0">
            <h2 className="text-xs text-muted">最近结果</h2>
            <p className="whitespace-pre-wrap text-sm">
              {task.error ?? '本轮清理仍有失败对象，请核对逐项原因。'}
            </p>
            <p className="text-xs text-muted">
              任务 {task.jobId} · 清理周期 {task.cycle}
              {task.finishedAt
                ? ` · 本轮结束于 ${new Date(task.finishedAt).toLocaleString('zh-CN')}`
                : ''}
            </p>
          </Card.Content>
        </Card>
        <div data-testid="cleanup-objects" className="grid gap-4">
          {task.remaining.map((object, index) => (
            <Card
              key={object.objectId}
              className="gap-0 rounded-lg bg-default px-4 py-3 shadow-none"
            >
              <Card.Content className="grid gap-1.5 p-0">
                <h2 className="text-xs text-muted">
                  剩余对象 {index + 1} · {purposeLabel(object.purpose)}
                </h2>
                <p className="text-sm">
                  {object.key}
                  <span className="block whitespace-pre-wrap">
                    {object.error ?? '尚未确认删除'}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {object.byteSize === null
                    ? '大小待核对'
                    : bytesLabel(object.byteSize)}{' '}
                  · 本轮尝试 {object.attempts} 次
                  <span className="block">
                    {object.nextAttemptAt
                      ? `下次尝试 ${new Date(object.nextAttemptAt).toLocaleString('zh-CN')}`
                      : '未安排下次自动尝试'}
                  </span>
                </p>
              </Card.Content>
            </Card>
          ))}
        </div>
        <Card className="gap-0 rounded-lg bg-default px-4 py-3 shadow-none">
          <Card.Content className="grid gap-1.5 p-0">
            <h2 className="text-xs text-muted">剩余占用</h2>
            <p className="text-sm">
              {remainingBytes} · 保留 {task.remaining.length} 个对象的清理责任
            </p>
          </Card.Content>
        </Card>
        <p className="rounded-lg bg-default px-3.5 py-3 text-[13px] leading-normal text-muted">
          本轮清理已结束。{description}
          已清理对象不会重新删除；存储配置仍不能删除。
        </p>
      </section>
    );
  return (
    <section
      data-testid="cleanup-workspace"
      aria-busy={pending}
      aria-labelledby="cleanup-title"
      className={`grid min-w-0 [overflow-wrap:anywhere] ${repeated ? 'gap-4 md:max-w-190' : 'gap-5'}`}
    >
      {!repeated ? (
        <Button
          variant="ghost"
          className="-my-3 h-11 w-fit gap-1 rounded-lg bg-transparent p-0 text-xs font-normal text-muted hover:bg-transparent data-[pressed=true]:bg-transparent"
          onPress={onBack}
        >
          <ArrowLeft size={14} aria-hidden />
          返回回收站
        </Button>
      ) : null}
      <h1
        ref={heading}
        id="cleanup-title"
        tabIndex={-1}
        className={
          repeated
            ? 'text-2xl font-medium leading-normal md:text-[30px]'
            : 'text-[28px] font-medium leading-normal md:text-[30px]'
        }
      >
        {title}
      </h1>
      <p role="status" className="text-[13px] leading-normal">
        {identity}
      </p>
      {messages}
      <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
        {description}
        {task?.error ? (
          <span className="mt-2 block whitespace-pre-wrap">{task.error}</span>
        ) : null}
      </p>
      {pending && !task ? <Spinner aria-label="正在读取清理任务" /> : null}
      {task ? (
        <>
          <p className="text-xs text-muted">
            任务 {task.jobId} · 清理周期 {task.cycle}
            {task.finishedAt
              ? ` · 本轮结束于 ${new Date(task.finishedAt).toLocaleString('zh-CN')}`
              : ''}
          </p>
          <Card className="gap-0 rounded-2xl border border-border bg-background px-3 py-2 shadow-none md:px-5 dark:bg-surface">
            <Card.Content className="p-0">
              <dl data-testid="cleanup-objects">
                {task.deletedObjects != null ? (
                  <div className="grid min-h-18 content-start py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:gap-4 md:py-0">
                    <dt>已清理</dt>
                    <dd>
                      {task.deletedPurposes?.map(purposeLabel).join(' / ') ||
                        '无已清理对象'}
                      <span className="md:hidden">
                        {' '}
                        · {task.deletedObjects} 个对象
                      </span>
                    </dd>
                    <dd className="hidden md:block">
                      {task.deletedObjects} 个对象
                    </dd>
                  </div>
                ) : null}
                {task.remaining.map((object) => (
                  <div
                    key={object.objectId}
                    className="grid min-h-18 min-w-0 content-start py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:gap-4"
                  >
                    <dt>
                      {object.status === 'cleanup_failed'
                        ? '清理失败'
                        : '待清理'}
                      <span className="block text-xs text-muted">
                        {purposeLabel(object.purpose)}
                      </span>
                    </dt>
                    <dd className="min-w-0">
                      {object.key}
                      <span className="block text-xs text-muted">
                        {object.byteSize === null
                          ? '大小待核对'
                          : bytesLabel(object.byteSize)}{' '}
                        · 本轮尝试 {object.attempts} 次
                      </span>
                    </dd>
                    <dd className="min-w-0 whitespace-pre-wrap">
                      {object.error ??
                        (object.nextAttemptAt
                          ? '等待本轮自动重试'
                          : '尚未确认清理')}
                      <span className="block text-xs text-muted">
                        {object.nextAttemptAt
                          ? `下次尝试 ${new Date(object.nextAttemptAt).toLocaleString('zh-CN')}`
                          : '未安排下次自动尝试'}
                      </span>
                    </dd>
                  </div>
                ))}
                {task.status === 'queued' || task.status === 'running' ? (
                  <div className="grid min-h-18 content-start py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:gap-4 md:py-0">
                    <dt>活动写入</dt>
                    <dd>
                      {waitingForWrites ? '等待结束' : '已结束'}
                      <span className="md:hidden">
                        {' '}
                        · {waitingForWrites ? '仍有' : '无'}未完成写入责任
                      </span>
                    </dd>
                    <dd className="hidden md:block">
                      {waitingForWrites ? '仍有' : '无'}未完成写入责任
                    </dd>
                  </div>
                ) : null}
                <div className="grid min-h-18 content-start py-2 text-sm leading-normal md:grid-cols-3 md:content-center md:gap-4 md:py-0">
                  <dt>剩余占用</dt>
                  <dd>
                    {remainingBytes}
                    <span className="md:hidden">
                      {' '}
                      · 未清理完，不能删除存储配置
                    </span>
                  </dd>
                  <dd className="hidden md:block">
                    未清理完，不能删除存储配置
                  </dd>
                </div>
              </dl>
            </Card.Content>
          </Card>
        </>
      ) : null}
    </section>
  );
}

export function CleanupFooter({
  cleanup,
  onBack,
}: {
  cleanup: CleanupController;
  onBack: () => void;
}) {
  if (
    !cleanup.visible ||
    cleanup.confirmation ||
    cleanup.unknown ||
    cleanup.task?.status === 'succeeded' ||
    (!cleanup.progress && cleanup.task?.status === 'queued' && !cleanup.unknown)
  )
    return null;
  const retry =
    cleanup.task?.status === 'failed' && !cleanup.unknown && !cleanup.error;
  const repeated = cleanup.task?.status === 'failed' && cleanup.task.cycle > 1;
  return (
    <div className="flex w-full gap-3 md:w-auto">
      <Button
        variant="outline"
        className={
          repeated
            ? 'h-12 min-h-12 w-22.5 shrink-0 rounded-lg font-normal md:w-40'
            : actionClass
        }
        onPress={onBack}
      >
        {repeated ? (
          <>
            <span className="md:hidden">返回</span>
            <span className="hidden md:block">返回回收站</span>
          </>
        ) : (
          '返回回收站'
        )}
      </Button>
      <Button
        data-testid="cleanup-check"
        className={
          repeated
            ? 'h-12 min-h-12 min-w-0 flex-1 rounded-lg font-normal md:w-60 md:flex-none'
            : actionClass
        }
        isDisabled={cleanup.pending}
        onPress={() => {
          void (retry ? cleanup.retry() : cleanup.check());
        }}
      >
        {cleanup.pending
          ? '正在核对…'
          : retry
            ? cleanup.task!.cycle > 1
              ? `重试剩余 ${cleanup.task!.remaining.length} 个对象`
              : '重试清理'
            : cleanup.unknown
              ? '核对清理结果'
              : '刷新状态'}
      </Button>
    </div>
  );
}
