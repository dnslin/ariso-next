'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { OwnerShell } from '../shell/owner-shell';
import { CorsRows } from './cors-report';
import type { StorageDetail } from './storage-api';
import { StorageDefaultActions } from './storage-default-actions';
import type { StorageScanError } from '../../server/storage/schema';

function cleanupDiagnostic(error: StorageScanError) {
  return [
    error.message,
    error.code ? `错误码：${error.code}` : null,
    error.serviceCode ? `服务错误：${error.serviceCode}` : null,
    error.httpStatusCode !== undefined ? `HTTP：${error.httpStatusCode}` : null,
    error.requestId ? `请求 ID：${error.requestId}` : null,
    error.key ? `路径：${error.key}` : null,
    error.operation ? `操作：${error.operation}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function probeError(value: string | null) {
  if (!value) return '等待清理结果';
  try {
    return cleanupDiagnostic(JSON.parse(value) as StorageScanError) || value;
  } catch {
    return value;
  }
}

export function StorageMaintenanceView({
  shell,
  storage,
  view,
  defaultStorageId,
  busy,
  onReturn,
  onRefresh,
  onRetryCleanup,
  onRetryScan,
  onDisable,
}: {
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>;
  storage: StorageDetail;
  view: 'cleanup' | 'default';
  defaultStorageId: string | null;
  busy: boolean;
  onReturn: () => void;
  onRefresh: () => Promise<void>;
  onRetryCleanup: (probeId: string) => Promise<void>;
  onRetryScan: () => Promise<void>;
  onDisable: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const cleanup = storage.probes.filter((probe) => probe.state === 'cleanup');
  const retryFailed = cleanup.some((probe) => probe.cleanupAttempts >= 2);
  const disabled = busy || pending;
  const isDefault = defaultStorageId === storage.id;
  const canEnable =
    storage.type === 'local' ||
    (storage.hasAccessKey &&
      storage.hasSecretKey &&
      storage.connectionStatus === 'passed' &&
      storage.connectionRevision === storage.configRevision);
  const typeName = storage.type === 'local' ? 'Local' : 'S3';
  const action =
    'h-12 flex-1 rounded-lg text-sm font-normal min-[1200px]:w-50 min-[1200px]:flex-none';

  async function run(operation: () => Promise<void>) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  async function retryCleanup() {
    const failures: string[] = [];
    try {
      for (const probe of cleanup) {
        try {
          await onRetryCleanup(probe.id);
        } catch (failure) {
          failures.push(
            failure instanceof Error ? failure.message : String(failure),
          );
        }
      }
    } finally {
      await onRefresh();
    }
    if (failures.length) throw new Error(failures.join('；'));
  }

  async function retryScan() {
    try {
      await onRetryScan();
    } finally {
      await onRefresh();
    }
  }

  const defaultTitle = isDefault
    ? storage.enabled
      ? `${storage.name} · 默认存储`
      : '默认存储已停用'
    : defaultStorageId === null
      ? '未设置默认存储'
      : '默认存储已变更';
  const defaultDescription = isDefault
    ? storage.enabled
      ? `${typeName} · 已启用 · 默认`
      : `${storage.name} · ${typeName} · 默认 · 已停用`
    : `${storage.name} · ${typeName} · ${storage.enabled ? '已启用' : '已停用'}`;

  return (
    <OwnerShell
      {...shell}
      footer={
        view === 'default' ? (
          isDefault && !storage.enabled ? (
            <>
              <Button
                variant="outline"
                className={action}
                isDisabled={disabled}
                onPress={onReturn}
              >
                查看删除条件
              </Button>
              <Button
                className={action}
                isDisabled={disabled}
                onPress={canEnable ? onDisable : onReturn}
              >
                {canEnable ? '重新启用' : '返回配置并测试'}
              </Button>
            </>
          ) : (
            <>
              {isDefault || storage.enabled ? (
                <StorageDefaultActions
                  storage={storage}
                  defaultStorageId={defaultStorageId}
                  busy={disabled}
                  onChanged={onRefresh}
                  showDescription={false}
                />
              ) : (
                <Button variant="outline" className={action} onPress={onReturn}>
                  返回列表
                </Button>
              )}
              <Button
                variant={isDefault ? 'primary' : 'outline'}
                className={action}
                isDisabled={disabled}
                onPress={isDefault ? onDisable : onReturn}
              >
                {isDefault ? '停用存储' : '返回列表'}
              </Button>
            </>
          )
        ) : (
          <>
            <Button
              variant="outline"
              className={
                retryFailed
                  ? 'h-12 w-[90px] flex-none rounded-lg text-sm font-normal min-[1200px]:w-40'
                  : action
              }
              isDisabled={disabled}
              onPress={onReturn}
            >
              {retryFailed ? '返回' : '返回配置'}
            </Button>
            <Button
              className={
                retryFailed
                  ? 'h-12 flex-1 rounded-lg text-sm font-normal min-[1200px]:w-60 min-[1200px]:flex-none'
                  : action
              }
              isDisabled={disabled}
              onPress={
                retryFailed || cleanup.length === 0
                  ? onReturn
                  : () => void run(retryCleanup)
              }
            >
              {retryFailed || cleanup.length === 0
                ? '返回存储配置'
                : '重试清理'}
            </Button>
          </>
        )
      }
    >
      <section
        data-testid={`storage-${view}-view`}
        className={`grid pb-10 [overflow-wrap:anywhere] ${view === 'cleanup' ? 'max-w-[760px] gap-4' : 'gap-5'}`}
      >
        {view !== 'cleanup' || !retryFailed ? (
          <Button
            variant="ghost"
            className="-my-[13px] min-h-11 justify-self-start px-0 text-xs font-normal"
            onPress={onReturn}
          >
            ← 返回存储管理
          </Button>
        ) : null}
        <h1
          className={`font-medium leading-normal min-[1200px]:text-[30px] ${view === 'cleanup' && retryFailed ? 'text-2xl' : 'text-[28px]'}`}
        >
          {view === 'default'
            ? defaultTitle
            : cleanup.length
              ? retryFailed
                ? '测试对象仍未清理'
                : '测试对象清理失败'
              : storage.probes.length
                ? '测试对象清理进行中'
                : '测试对象已清理'}
        </h1>
        <p
          className={view === 'cleanup' ? 'text-sm text-muted' : 'text-[13px]'}
        >
          {view === 'default'
            ? defaultDescription
            : `${storage.name} · ${cleanup.length ? (retryFailed ? '清理重试失败' : '待清理记录已保留') : storage.probes.length ? '等待运行中的探测结束' : '没有剩余探测清理引用'}`}
        </p>
        {error ? (
          <p role="alert" className="text-sm leading-normal text-danger">
            {error}
          </p>
        ) : null}
        {view === 'default' ? (
          <>
            <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
              {isDefault && !storage.enabled
                ? `默认仍指向${storage.name}。新上传不能使用该默认，系统不会自动选择其他存储。已有图片的元数据和关系保留。`
                : isDefault
                  ? '默认选择只影响新上传。清空或停用默认后，不会自动选择其他存储。'
                  : defaultStorageId === null
                    ? '上传时请明确选择存储，或设置一个默认存储。系统不会自动选择。'
                    : `当前默认存储 ID：${defaultStorageId}。当前页面存储不是默认存储。`}
            </p>
            {isDefault && !storage.enabled && !canEnable ? (
              <p
                role="status"
                className="text-[13px] leading-normal text-muted"
              >
                当前配置尚未通过连接测试，不能重新启用。请返回存储配置并测试；默认选择仍保留，也可以清空默认。
              </p>
            ) : null}
            {isDefault && !storage.enabled ? (
              <StorageDefaultActions
                storage={storage}
                defaultStorageId={defaultStorageId}
                busy={disabled}
                onChanged={onRefresh}
                showDescription={false}
              />
            ) : null}
            <CorsRows
              rows={
                isDefault && !storage.enabled
                  ? [
                      {
                        label: '内容与新上传',
                        value: '不可用',
                        detail: '提示存储已停用',
                      },
                      {
                        label: '记录与永久删除',
                        value: '仍可管理',
                        detail: '清理继续尝试',
                      },
                      {
                        label: '重新启用',
                        value: '恢复原 ID 和链接',
                        detail:
                          storage.type === 's3'
                            ? '需当前配置连接测试通过'
                            : '使用当前保存路径',
                      },
                    ]
                  : isDefault
                    ? [
                        {
                          label: '连接',
                          value:
                            storage.type === 'local'
                              ? '本地路径'
                              : storage.connectionReport?.passed &&
                                  !storage.connectionReport.stale
                                ? '已通过'
                                : '未通过',
                          detail: '当前保存配置',
                        },
                        {
                          label: '浏览器直传',
                          value:
                            storage.type === 'local'
                              ? '不适用'
                              : storage.corsReport?.passed &&
                                  !storage.corsReport.stale &&
                                  !storage.corsReport.cleanupPending
                                ? '可用'
                                : '不可用',
                          detail: storage.corsOrigin ?? '未保存来源',
                        },
                        {
                          label: '默认选择',
                          value: storage.name,
                          detail: '新上传默认位置',
                        },
                      ]
                    : [
                        {
                          label: storage.name,
                          value: storage.enabled ? '已启用' : '已停用',
                          detail: '仅展示当前存储；返回列表查看全部配置',
                        },
                        {
                          label: '默认选择',
                          value: defaultStorageId ?? '未设置',
                          detail: '系统不会自动选择',
                        },
                      ]
              }
            />
          </>
        ) : (
          <>
            {[
              {
                label: '剩余对象',
                value: storage.probes.length
                  ? storage.probes.map((probe) => probe.key).join('；')
                  : '无',
              },
              {
                label: '失败原因',
                value: cleanup.length
                  ? cleanup.map((probe) => probeError(probe.error)).join('；')
                  : '没有待重试的探测清理失败',
              },
              {
                label: '引用状态',
                value: `保留 ${storage.probes.length} 个探测对象清理引用`,
              },
              {
                label: '下一步',
                value: cleanup.length
                  ? '修正删除权限后手动重试'
                  : storage.probes.length
                    ? '等待探测结束后刷新状态'
                    : '返回存储配置检查其他引用',
              },
            ].map((row) => (
              <div
                key={row.label}
                className="grid gap-1.5 rounded-lg bg-default px-4 py-3"
              >
                <p className="text-xs text-muted">{row.label}</p>
                <p className="text-sm leading-normal">{row.value}</p>
              </div>
            ))}
            <p className="rounded-lg bg-default px-3.5 py-3 text-[13px] leading-normal text-muted">
              {storage.connectionReport && !storage.connectionReport.passed
                ? '连接测试仍为失败。'
                : ''}
              存储停用时也可清理；对象删除成功前不能解除引用或删除配置。
            </p>
            {cleanup.map((probe) => (
              <p
                key={probe.id}
                className="text-[13px] leading-normal text-muted"
              >
                {probe.key} · 记录 ID：{probe.id} · 已尝试{' '}
                {probe.cleanupAttempts} 次 ·{' '}
                {probe.nextCleanupAt
                  ? `下次自动重试：${probe.nextCleanupAt}`
                  : '没有计划中的自动重试，请手动重试'}
              </p>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="min-h-12 rounded-lg font-normal"
                isDisabled={disabled}
                onPress={() => void run(onRefresh)}
              >
                刷新状态
              </Button>
              {retryFailed ? (
                <Button
                  data-testid="storage-retry-cleanup"
                  variant="outline"
                  className="min-h-12 rounded-lg font-normal"
                  isDisabled={disabled}
                  onPress={() => void run(retryCleanup)}
                >
                  重试清理
                </Button>
              ) : null}
            </div>
            {
              <section
                aria-label="受管孤儿对象扫描"
                className="grid gap-3 border-t border-border pt-4 text-sm leading-normal"
              >
                <h2 className="font-medium">受管孤儿对象扫描</h2>
                <p>
                  已知孤儿对象 {storage.orphans.objects.length} 个 ·{' '}
                  {storage.orphans.knownBytes} 字节
                </p>
                {storage.scan ? (
                  <>
                    <p>
                      扫描状态：
                      {
                        {
                          passed: '已完成',
                          failed: '失败',
                          interrupted: '已中断',
                          running: '扫描中',
                        }[storage.scan.status]
                      }{' '}
                      · 发现 {storage.scan.discoveredCount} 个 · 已删除{' '}
                      {storage.scan.deletedCount} 个 · 失败{' '}
                      {storage.scan.failedCount} 个 · 受保护{' '}
                      {storage.scan.protectedCount} 个
                    </p>
                    {storage.scan.error ? (
                      <p role="alert" className="text-danger">
                        {cleanupDiagnostic(storage.scan.error)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p>尚无扫描记录</p>
                )}
                {storage.orphans.objects.map((object) => (
                  <p key={object.key}>
                    {object.key} · {object.size} 字节
                    {object.error
                      ? ` · ${cleanupDiagnostic(object.error)}`
                      : ''}
                  </p>
                ))}
                <Button
                  variant="outline"
                  className="min-h-12 justify-self-start rounded-lg font-normal"
                  isDisabled={disabled || storage.scan?.status === 'running'}
                  onPress={() => void run(retryScan)}
                >
                  扫描并清理受管孤儿对象
                </Button>
              </section>
            }
          </>
        )}
      </section>
    </OwnerShell>
  );
}
