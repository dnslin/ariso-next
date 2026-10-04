'use client';

import type { ComponentProps } from 'react';
import { Alert } from '@heroui/react/alert';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { OwnerShell } from '../shell/owner-shell';
import type { ConnectionReport } from '../../server/storage/probe-types';
import type { StorageSummary } from './storage-api';
import {
  connectionDiagnostic,
  connectionStageRow,
  ConnectionReportRows,
} from './connection-report';
import { CorsRows } from './cors-report';

const actionClass =
  'h-12 min-w-0 flex-1 rounded-lg px-2 text-sm font-normal min-[1200px]:w-50 min-[1200px]:flex-none';

export function StorageConnectionResult({
  shell,
  storage,
  report,
  busy,
  working = false,
  message,
  onTest,
  onEnable,
  onReturn,
}: {
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>;
  storage: StorageSummary;
  report: ConnectionReport | null;
  busy: boolean;
  working?: boolean;
  message?: string;
  onTest: () => void;
  onEnable: () => void;
  onReturn: () => void;
}) {
  const failure = report?.stages.find((stage) => stage.status === 'failed');
  const anonymousFailure = failure?.stage === 'anonymous';
  const publicObject =
    anonymousFailure &&
    failure.error?.httpStatusCode !== undefined &&
    failure.error.httpStatusCode >= 200 &&
    failure.error.httpStatusCode < 300;
  const valid = Boolean(!busy && report?.passed && !report.stale);
  const unsupported =
    failure?.stage === 'configuration' &&
    failure.error?.code === 'STORAGE_BUCKET_UNSUPPORTED';
  const permission = failure?.stage === 'configuration' && !unsupported;
  const shortDialog =
    !busy &&
    !report?.stale &&
    (unsupported || permission || (anonymousFailure && !publicObject));
  const saved = !report && !busy;
  const cleanup = Boolean(report?.cleanupPending && !busy);
  const title = busy
    ? '正在测试连接'
    : report?.stale
      ? '连接测试结果已失效'
      : valid
        ? '连接测试通过'
        : unsupported
          ? '此 Bucket 暂不支持'
          : permission
            ? '尚无法确认 Bucket 支持范围'
            : anonymousFailure
              ? publicObject
                ? '连接失败：测试对象可公开读取'
                : '未能确认匿名访问被拒绝'
              : cleanup
                ? '连接测试失败：对象删除失败'
                : saved
                  ? '配置已保存，等待连接测试'
                  : '连接测试未通过';
  const summary = busy
    ? '正在使用已保存的配置测试。不会读取或改动已有图片。'
    : report?.stale
      ? '存储配置已变更，本报告不能用于启用当前配置。请重新测试。'
      : valid
        ? '测试对象已清理。此结果只证明本次测试对象的访问情况；请保持 Bucket 私有，并关闭公共域名和选择性公开规则。'
        : publicObject
          ? '公开 Bucket 无法保护私有图片。请先关闭匿名读取及公共域名，再重新测试。'
          : cleanup
            ? '写读检查完成不代表整次测试通过。删除失败使连接测试失败；请修正删除权限后处理清理并重新测试。'
            : saved
              ? '保存不会自动启用。连接测试通过后，再手动启用此存储。'
              : '此次连接测试未通过。请查看报告中的阶段结果，修正配置后重新测试。';
  const canTest =
    !busy && !working && storage.hasAccessKey && storage.hasSecretKey;
  const footer = (
    <>
      <Button
        data-testid={
          valid
            ? 'storage-test'
            : cleanup
              ? 'storage-cleanup-errors'
              : undefined
        }
        variant="outline"
        className={actionClass}
        isDisabled={working && !busy}
        onPress={valid ? onTest : onReturn}
      >
        {valid ? '重新测试' : cleanup ? '查看清理错误' : '返回配置'}
      </Button>
      {valid ? (
        <Button
          data-testid="storage-enable"
          className={actionClass}
          isDisabled={busy || working || storage.enabled}
          onPress={onEnable}
        >
          {storage.enabled ? '存储已启用' : '启用存储'}
        </Button>
      ) : cleanup ? (
        <Button className={actionClass} onPress={onReturn}>
          返回配置
        </Button>
      ) : (
        <Button
          data-testid="storage-test"
          className={actionClass}
          isDisabled={!canTest}
          onPress={onTest}
        >
          {busy ? '查看检测结果' : saved ? '测试连接' : '重新测试'}
        </Button>
      )}
    </>
  );
  const writeReadPassed =
    report?.stages.find((stage) => stage.stage === 'write')?.status ===
      'passed' &&
    report.stages.find((stage) => stage.stage === 'read')?.status === 'passed';
  const tailPending =
    busy &&
    report?.stages
      .filter(
        (stage) => stage.stage === 'anonymous' || stage.stage === 'delete',
      )
      .every((stage) => stage.status === 'pending');
  const rows = report
    ? busy && tailPending
      ? [
          connectionStageRow(report, 'configuration', 'Bucket 支持范围'),
          connectionStageRow(report, 'write', '写入测试对象'),
          connectionStageRow(report, 'read', '鉴权读取'),
          {
            label: '匿名读取 / 清理',
            value: '等待执行',
            detail: '等待前一步结束',
          },
        ]
      : (publicObject || cleanup) && writeReadPassed
        ? [
            { label: '写入 / 鉴权读取', value: '通过', detail: '内容一致' },
            connectionStageRow(report, 'anonymous', '匿名读取'),
            connectionStageRow(report, 'delete', '删除测试对象'),
            ...(cleanup
              ? [
                  {
                    label: '清理责任',
                    value: '已保留',
                    detail: '请查看配置中的清理错误与下次重试时间',
                  },
                ]
              : []),
          ]
        : null
    : null;
  return (
    <OwnerShell {...shell} footer={shortDialog ? undefined : footer}>
      <section
        data-testid="storage-connection-result"
        className="grid gap-5 pb-10 [overflow-wrap:anywhere]"
      >
        {shortDialog ? (
          <div data-testid="storage-connection-report">
            <AlertDialog.Backdrop
              isOpen
              onOpenChange={(open) => {
                if (!open) onReturn();
              }}
              isKeyboardDismissDisabled={busy}
            >
              <AlertDialog.Container
                placement="center"
                className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
              >
                <AlertDialog.Dialog
                  data-testid="storage-connection-result-dialog"
                  className="w-full max-w-none max-h-[calc(100dvh_-_32px)] gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 [overflow-wrap:anywhere]"
                >
                  <AlertDialog.Header className="p-0">
                    <AlertDialog.Heading className="text-xl font-medium leading-normal">
                      {title}
                    </AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body className="m-0! grid gap-4 p-0 text-sm leading-normal">
                    <p>
                      {unsupported
                        ? '首版仅支持普通、未版本化且未启用对象锁的 Bucket。'
                        : '此次没有通过连接测试，存储保持停用。'}
                    </p>
                    <div className="grid gap-2 rounded-lg bg-default p-3 text-[13px]">
                      {failure ? connectionDiagnostic(failure) : null}
                      {permission ? (
                        <p>
                          {/\.r2\.cloudflarestorage\.com\/?$/.test(
                            storage.endpoint ?? '',
                          )
                            ? '请在 Cloudflare 控制台确认整个目标 Bucket 都没有锁定规则。R2 的该配置不能通过 S3 接口自动检查。'
                            : '请核对 GetBucketVersioning / GetObjectLockConfiguration 权限并重试。超时、未知响应或接口未实现不代表通过。'}
                        </p>
                      ) : unsupported ? (
                        <p>
                          Enabled、Suspended
                          或启用对象锁均不支持。请改用从未启用版本控制的普通
                          Bucket。
                        </p>
                      ) : (
                        <p>
                          网络失败、未知
                          404、重定向或服务错误都不等于私有性检查通过。
                        </p>
                      )}
                      <p>
                        {report?.cleanupPending
                          ? '清理责任已保留，请在配置页查看清理状态。'
                          : report?.stages.find(
                                (stage) => stage.stage === 'delete',
                              )?.status === 'skipped'
                            ? '未尝试写入测试对象，无需删除。'
                            : '本次已知测试对象已清理。'}
                      </p>
                    </div>
                    {report ? (
                      <p className="text-xs text-muted">
                        探测 ID：{report.probeId} · 配置版本：{report.revision}{' '}
                        · 测试时间：{report.testedAt}
                      </p>
                    ) : null}
                    {message ? (
                      <p role="alert" className="text-danger">
                        {message}
                      </p>
                    ) : null}
                  </AlertDialog.Body>
                  <AlertDialog.Footer className="mt-0! flex-col gap-4 p-0">
                    {unsupported ? (
                      <Button
                        className="h-12 w-full rounded-lg font-normal"
                        onPress={onReturn}
                      >
                        返回修改
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="h-12 w-full rounded-lg font-normal"
                          onPress={onReturn}
                        >
                          返回配置
                        </Button>
                        <Button
                          data-testid="storage-test"
                          className="h-12 w-full rounded-lg font-normal"
                          isDisabled={!canTest}
                          onPress={onTest}
                        >
                          重新测试
                        </Button>
                      </>
                    )}
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </div>
        ) : (
          <div data-testid="storage-connection-report" className="grid gap-5">
            <Link
              href="/settings/storage"
              className="-my-[13px] flex min-h-11 w-fit items-center text-xs leading-normal text-muted no-underline"
            >
              ← 返回存储管理
            </Link>
            <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
              {title}
            </h1>
            <p className="min-h-[22px] text-[13px] leading-normal">
              {storage.name} · S3 ·{' '}
              {storage.enabled ? '已启用' : valid ? '仍为停用' : '已停用'}
              {cleanup ? ' · 清理待重试' : ''}
            </p>
            <p
              role="status"
              className="rounded-lg bg-default p-3 text-[13px] leading-normal"
            >
              {summary}
            </p>
            {report ? (
              rows ? (
                <CorsRows rows={rows} />
              ) : (
                <ConnectionReportRows
                  report={report}
                  includeConfiguration={busy || !valid}
                />
              )
            ) : saved ? (
              <CorsRows
                rows={[
                  {
                    label: '连接测试',
                    value: '尚未测试',
                    detail: '需通过后启用',
                  },
                  {
                    label: '浏览器直传',
                    value:
                      storage.corsStatus === 'invalidated'
                        ? '已失效'
                        : '尚未检测',
                    detail: '可在连接通过后检测',
                  },
                ]}
              />
            ) : (
              <CorsRows
                rows={[
                  {
                    label: 'Bucket 支持范围',
                    value: '等待执行',
                    detail: '等待服务端记录结果',
                  },
                  {
                    label: '写入测试对象',
                    value: '等待执行',
                    detail: '等待服务端记录结果',
                  },
                  {
                    label: '鉴权读取',
                    value: '等待执行',
                    detail: '等待服务端记录结果',
                  },
                  {
                    label: '匿名读取 / 清理',
                    value: '等待执行',
                    detail: '等待前一步结束',
                  },
                ]}
              />
            )}
            {report ? (
              <p className="text-xs leading-normal text-muted">
                探测 ID：{report.probeId} · 配置版本：{report.revision} ·
                测试时间：{report.testedAt}
              </p>
            ) : null}
            {report?.stale ? (
              <p className="text-[13px] leading-normal">
                历史报告配置版本：{report.revision} · 当前配置版本：
                {storage.configRevision}
              </p>
            ) : null}
            {message ? (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description>{message}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </div>
        )}
      </section>
    </OwnerShell>
  );
}
