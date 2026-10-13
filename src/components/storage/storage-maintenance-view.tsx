'use client';

import { ComponentEntrance } from '../component-entrance';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import {
  ArrowLeft,
  Link2,
  Power,
  RefreshCw,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { StorageTip } from './storage-tip';
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
      ? '默认存储'
      : '默认存储已停用'
    : defaultStorageId === null
      ? '未设置默认存储'
      : '默认存储已变更';
  const defaultRows = [
    { label: '启用状态', value: storage.enabled ? '已启用' : '已停用' },
    {
      label: '默认选择',
      value: isDefault ? storage.name : (defaultStorageId ?? '未设置'),
    },
    {
      label: '连接',
      value:
        storage.type === 'local' ? '本地存储' : canEnable ? '已通过' : '未通过',
    },
    {
      label: '浏览器直传',
      value:
        storage.type === 'local'
          ? '不适用'
          : storage.corsReport?.passed &&
              !storage.corsReport.stale &&
              !storage.corsReport.cleanupPending
            ? storage.enabled
              ? '可用'
              : '检测通过'
            : '不可用',
      detail: storage.type === 's3' ? storage.corsOrigin : null,
    },
  ];

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
                <Link2 size={16} aria-hidden />
                查看删除条件
              </Button>
              <Button
                className={action}
                isDisabled={disabled}
                onPress={canEnable ? onDisable : onReturn}
              >
                <Power size={16} aria-hidden />
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
                <Power size={16} aria-hidden />
                {isDefault ? '停用存储' : '返回列表'}
              </Button>
            </>
          )
        ) : (
          <>
            <Button
              variant="outline"
              className={action}
              isDisabled={disabled}
              onPress={() => void run(onRefresh)}
            >
              <RefreshCw size={16} aria-hidden />
              刷新状态
            </Button>
            <Button
              data-testid={cleanup.length ? 'storage-retry-cleanup' : undefined}
              className={action}
              isDisabled={disabled}
              onPress={
                cleanup.length === 0 ? onReturn : () => void run(retryCleanup)
              }
            >
              {cleanup.length ? (
                <RefreshCw size={16} aria-hidden />
              ) : (
                <ArrowLeft size={16} aria-hidden />
              )}
              {cleanup.length === 0 ? '返回' : '重试清理'}
            </Button>
          </>
        )
      }
    >
      <section
        data-testid={`storage-${view}-view`}
        className={`grid pb-10 [overflow-wrap:anywhere] ${view === 'cleanup' ? 'max-w-[760px] gap-4' : 'gap-5'}`}
      >
        <ComponentEntrance
          as="header"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
              {view === 'default' ? '默认存储设置' : '清理状态'}
            </h1>
            <StorageTip label={view === 'default' ? '默认存储' : '清理'}>
              {view === 'default'
                ? '默认选择只影响新上传。清空或停用默认后，不会自动选择其他存储。'
                : '存储停用时也可清理。扫描只清理本存储命名空间中没有有效引用的受管对象，不删除图片、Bucket、挂载根目录或其他应用的文件。'}
            </StorageTip>
          </div>
          <Button
            variant="ghost"
            className="h-11 rounded-lg px-3 text-sm font-normal"
            isDisabled={disabled}
            onPress={onReturn}
          >
            <ArrowLeft size={18} aria-hidden />
            返回
          </Button>
        </ComponentEntrance>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">{storage.name}</span>
          <Chip
            size="sm"
            color={
              view === 'default'
                ? storage.enabled
                  ? 'success'
                  : 'warning'
                : cleanup.length || storage.scan?.status === 'failed'
                  ? 'danger'
                  : 'default'
            }
            className="rounded-md"
          >
            <Chip.Label>
              {view === 'default'
                ? defaultTitle
                : cleanup.length
                  ? retryFailed
                    ? '清理重试失败'
                    : '清理失败'
                  : storage.probes.length
                    ? '探测进行中'
                    : '无待清理探测'}
            </Chip.Label>
          </Chip>
        </div>
        {error ? (
          <p role="alert" className="text-sm leading-normal text-danger">
            {error}
          </p>
        ) : null}
        {view === 'default' ? (
          <>
            {isDefault && !storage.enabled ? (
              <p className="text-sm text-warning">
                新上传不能使用该默认，请重新启用或明确选择其他存储。
              </p>
            ) : null}
            {isDefault && !storage.enabled && !canEnable ? (
              <p
                role="status"
                className="text-[13px] leading-normal text-muted"
              >
                当前配置尚未通过连接测试，不能重新启用。
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
            <dl>
              {defaultRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-border py-5"
                >
                  <dt className="text-sm">{row.label}</dt>
                  <dd className="grid gap-1 text-sm">
                    {row.value}
                    {row.detail ? (
                      <span className="text-xs text-muted">{row.detail}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <ComponentEntrance
              as="section"
              delay={0.055}
              aria-label="测试对象清理"
              className="grid gap-3"
            >
              <h2 className="flex items-center gap-3 text-lg font-medium">
                <ShieldCheck size={20} aria-hidden />
                连接测试对象
                <span className="text-sm font-normal text-muted">
                  {storage.probes.length} 个
                </span>
              </h2>
              {storage.probes.length ? (
                storage.probes.map((probe) => (
                  <article
                    key={probe.id}
                    className="grid gap-2 border-b border-border py-4 text-sm"
                  >
                    <code className="break-all">{probe.key}</code>
                    {probe.state === 'cleanup' ? (
                      <p role="alert" className="text-danger">
                        {probeError(probe.error)}
                      </p>
                    ) : (
                      <p>等待运行中的探测结束</p>
                    )}
                    <p className="text-xs text-muted">
                      记录 ID：{probe.id} · 已尝试 {probe.cleanupAttempts} 次
                      {probe.nextCleanupAt
                        ? ` · 下次自动重试：${probe.nextCleanupAt}`
                        : probe.state === 'cleanup'
                          ? ' · 没有计划中的自动重试，请手动重试'
                          : ''}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted">无待清理测试对象</p>
              )}
              {cleanup.length ? (
                <p className="text-sm text-danger">
                  对象删除成功前不能解除引用或删除配置。
                </p>
              ) : null}
            </ComponentEntrance>
            {
              <ComponentEntrance
                as="section"
                delay={0.11}
                aria-label="受管孤儿对象扫描"
                className="grid gap-3 border-t border-border pt-4 text-sm leading-normal"
              >
                <h2 className="flex items-center gap-3 text-lg font-medium">
                  <ScanLine size={20} aria-hidden />
                  受管孤儿对象扫描
                </h2>
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
                  <ScanLine size={16} aria-hidden />
                  扫描并清理
                </Button>
              </ComponentEntrance>
            }
          </>
        )}
      </section>
    </OwnerShell>
  );
}
