'use client';
import { useState } from 'react';
import { Accordion } from '@heroui/react/accordion';
import { Button } from '@heroui/react/button';
import { CircleAlert, CircleCheck, Cloud, LoaderCircle } from 'lucide-react';
import type { BackupSummary } from '../../server/backup/manifest';
import { bytesLabel } from '../library/detail-labels';
import { RestoreS3Fields } from './restore-s3-fields';
import { RestoreR2Confirmation } from './restore-r2-confirmation';
import { remoteTargetErrors } from './restore-target-form';
import type { useRestoreTargets } from './use-restore-targets';

export function RestoreRemoteTargets({
  summary,
  model,
  busy,
  cleanup = false,
}: {
  summary: BackupSummary;
  model: ReturnType<typeof useRestoreTargets>;
  busy: boolean;
  cleanup?: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const storages = summary.storages.filter(
    (storage) =>
      storage.type === 's3' &&
      (!cleanup ||
        model.targets.some((target) => target.storageId === storage.id)),
  );
  if (!storages.length) return null;
  function close(focusHeading = false) {
    const id = confirmation;
    setConfirmation(null);
    requestAnimationFrame(() =>
      document
        .getElementById(
          `${focusHeading ? 'restore-target' : 'restore-test'}-${id}`,
        )
        ?.focus(),
    );
  }
  function test(id: string) {
    const value = model.input(id);
    const target = model.targets.find((item) => item.storageId === id);
    if (
      Object.keys(
        remoteTargetErrors(value, target?.credentialsConfigured === true),
      ).length
    ) {
      void model.test(id);
    } else if (
      /^https:\/\/[a-z0-9]+(?:\.[a-z0-9-]+)?\.r2\.cloudflarestorage\.com\/?$/i.test(
        value.endpoint.trim(),
      )
    ) {
      setConfirmation(id);
    } else void model.test(id);
  }
  return (
    <section
      className="grid min-w-0 gap-3"
      aria-labelledby="restore-remote-heading"
    >
      <div>
        <h2 id="restore-remote-heading" className="text-base font-medium">
          {cleanup ? '本次 S3 恢复位置' : '为 S3 存储指定新位置'}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          {cleanup
            ? '凭据失效时可在原位置更新凭据后继续清理，不能更换目录。'
            : '使用新的存储桶或本次恢复专用的新目录，不连接仍在使用的原站目录。'}
        </p>
      </div>
      <Accordion defaultExpandedKeys={[storages[0].id]} className="grid gap-3">
        {storages.map((storage) => {
          const target = model.targets.find(
            (item) => item.storageId === storage.id,
          );
          const dirty = model.dirty(storage.id);
          const status =
            target?.testStatus === 'testing'
              ? 'testing'
              : !dirty &&
                  target?.testStatus === 'passed' &&
                  target.testedRevision === target.revision &&
                  !target.cleanupPending
                ? 'passed'
                : dirty
                  ? 'untested'
                  : target?.testStatus === 'failed'
                    ? 'failed'
                    : 'untested';
          const label = cleanup
            ? target?.cleanupPending
              ? '待清理'
              : target?.writeStarted
                ? '已清理'
                : '无需清理'
            : {
                untested: '待配置',
                testing: '测试中',
                passed: '连接通过',
                failed: '测试失败',
              }[status];
          return (
            <Accordion.Item
              key={storage.id}
              id={storage.id}
              className="min-w-0 rounded-xl border border-border px-4"
              data-testid="restore-target"
              data-storage-id={storage.id}
              data-state={status}
              data-tested-at={target?.testedAt ?? ''}
            >
              <Accordion.Heading>
                <Accordion.Trigger
                  id={`restore-target-${storage.id}`}
                  className="min-h-20 gap-3 py-3"
                >
                  <Cloud className="size-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-medium wrap-anywhere">
                      {storage.name}
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted">
                      {storage.images.toLocaleString('zh-CN')} 张 ·{' '}
                      {bytesLabel(storage.bytes)}
                      {storage.enabled ? '' : ' · 保留停用状态'}
                    </span>
                  </div>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-xs font-normal ${status === 'failed' || target?.cleanupPending ? 'text-danger' : 'text-muted'}`}
                  >
                    {status === 'passed' ? (
                      <CircleCheck className="size-4" aria-hidden />
                    ) : status === 'failed' || target?.cleanupPending ? (
                      <CircleAlert className="size-4" aria-hidden />
                    ) : null}
                    {label}
                  </span>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel className="min-w-0 pb-4">
                {target?.namespace ? (
                  <p className="mb-3 text-xs leading-5 text-muted wrap-anywhere">
                    {target.endpoint} / {target.bucket} / {target.namespace}
                  </p>
                ) : null}
                {!cleanup || target?.cleanupPending ? (
                  <>
                    <RestoreS3Fields
                      storageId={storage.id}
                      value={model.input(storage.id)}
                      credentialsConfigured={
                        target?.credentialsConfigured === true
                      }
                      positionLocked={
                        cleanup ||
                        target?.writeStarted ||
                        target?.cleanupPending
                      }
                      disabled={busy || model.testing}
                      errors={model.errors(storage.id)}
                      onChange={(value) => model.change(storage.id, value)}
                    />
                    <div className="mt-4 flex justify-end">
                      <Button
                        id={`restore-test-${storage.id}`}
                        data-testid={
                          cleanup
                            ? 'restore-repair-target'
                            : 'restore-test-target'
                        }
                        variant="outline"
                        className="min-h-11 max-w-full rounded-lg px-3 text-sm whitespace-normal"
                        isDisabled={busy || model.testing}
                        onPress={() =>
                          cleanup
                            ? void model.repair(storage.id)
                            : test(storage.id)
                        }
                      >
                        {status === 'testing' ? (
                          <LoaderCircle
                            className="size-4 shrink-0 motion-safe:animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Cloud className="size-4 shrink-0" aria-hidden />
                        )}
                        {cleanup
                          ? '保存凭据并继续清理'
                          : status === 'testing'
                            ? '正在测试连接'
                            : '测试连接'}
                      </Button>
                    </div>
                  </>
                ) : null}
                {target?.failure && (cleanup || !dirty) ? (
                  <p
                    className="mt-3 text-sm leading-6 text-danger wrap-anywhere"
                    role="alert"
                  >
                    {target.failure.message}
                  </p>
                ) : null}
                {!cleanup && status === 'passed' ? (
                  <p className="mt-3 flex gap-2 text-sm" role="status">
                    <CircleCheck className="size-4 shrink-0" aria-hidden />
                    新位置可用，可以恢复图片。
                  </p>
                ) : null}
                {!cleanup && dirty && target ? (
                  <p className="mt-3 text-xs leading-5 text-muted">
                    配置已修改，请重新测试后继续。
                  </p>
                ) : null}
                {!cleanup && target?.cleanupPending ? (
                  <p className="mt-3 text-xs leading-6 text-muted">
                    此位置仍有本次测试产生的文件。可更新凭据后重新测试，清理完成前不能更换位置。
                  </p>
                ) : null}
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
      {!cleanup ? (
        <p className="text-xs leading-6 text-muted">
          全部 S3
          位置通过测试后可继续。新位置的跨域设置需要重新检测；恢复后可在存储设置中检查。
        </p>
      ) : null}
      {confirmation ? (
        <RestoreR2Confirmation
          onClose={() => close()}
          onConfirm={() => {
            const id = confirmation;
            close(true);
            void model.test(id, true);
          }}
        />
      ) : null}
    </section>
  );
}
