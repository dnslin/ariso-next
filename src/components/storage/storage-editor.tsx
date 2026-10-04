'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { ListChecks, LockKeyhole, Settings2 } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { useResetUpload, useUploadQueue } from '../upload/provider';
import { StorageForm } from './storage-form';
import { storageFormInitial, storageFormPayload } from './storage-form-utils';
import { StorageConnectionResult } from './storage-connection-result';
import { StorageReferenceView } from './storage-reference-view';
import { StorageDeleteDialog } from './storage-delete-dialog';
import { StorageTip } from './storage-tip';
import { StorageMaintenanceView } from './storage-maintenance-view';
import {
  reconcileStorageSave,
  type PendingStorageSave,
} from './storage-reconciliation';
import {
  storageRequest,
  storageUrl,
  storageSettingsUrl,
  StorageRequestError,
  type StorageDetail,
  type StorageSummary,
  type StorageSettings,
} from './storage-api';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const actionClass =
  'h-11 min-w-0 rounded-lg px-3 text-sm font-normal min-[1200px]:h-10';

export function StorageEditor({
  storageId,
  storageRoot,
  initialSaved = false,
  initialType = 'local',
  ...shell
}: ShellProps & {
  storageId?: string;
  storageRoot: string;
  initialSaved?: boolean;
  initialType?: 'local' | 's3';
}) {
  const query = useQuery({
    queryKey: ['storage-editor', storageId ?? 'new'],
    queryFn: async ({ signal }) => {
      const [storage, settings] = await Promise.all([
        storageId
          ? storageRequest<StorageDetail>(storageUrl(storageId), { signal })
          : Promise.resolve(undefined),
        storageRequest<StorageSettings>(storageSettingsUrl, { signal }),
      ]);
      return { storage, settings };
    },
    retry: false,
    networkMode: 'always',
    refetchInterval: (current) =>
      current.state.data?.storage?.probes.some(
        (probe) => probe.state === 'running',
      )
        ? 2000
        : false,
  });
  const resetUpload = useResetUpload();
  const expired =
    query.error instanceof StorageRequestError && query.error.status === 401;
  useEffect(() => {
    if (!expired) return;
    resetUpload();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
    );
  }, [expired, resetUpload]);
  if (query.data)
    return (
      <StorageEditorReady
        key={storageId ?? 'new'}
        {...shell}
        storageRoot={storageRoot}
        initialSaved={initialSaved}
        initialType={initialType}
        initial={query.data}
        detail={query.data.storage}
        refreshError={query.error?.message}
        onRefresh={() => query.refetch()}
      />
    );
  return (
    <OwnerShell {...shell}>
      <section className="grid gap-5 pb-10">
        <h1 className="text-[30px] font-medium leading-normal">
          {storageId ? '存储配置' : '添加存储'}
        </h1>
        <Link href="/settings/storage" className="text-sm">
          返回存储管理
        </Link>
        {query.isPending ? (
          <p role="status" className="flex items-center gap-2">
            <Spinner size="sm" />
            正在读取存储配置
          </p>
        ) : (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>无法读取存储配置</Alert.Title>
              <Alert.Description>{query.error?.message}</Alert.Description>
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                onPress={() => void query.refetch()}
              >
                重新加载
              </Button>
            </Alert.Content>
          </Alert>
        )}
      </section>
    </OwnerShell>
  );
}

function StorageEditorReady({
  storageRoot,
  initialSaved,
  initialType,
  initial,
  detail,
  refreshError,
  onRefresh,
  ...shell
}: ShellProps & {
  storageRoot: string;
  initialSaved: boolean;
  initialType: 'local' | 's3';
  initial: { storage?: StorageDetail; settings: StorageSettings };
  detail?: StorageDetail;
  refreshError?: string;
  onRefresh: () => Promise<{
    data?: { storage?: StorageDetail; settings: StorageSettings };
  }>;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const upload = useUploadQueue();
  const resetUpload = useResetUpload();
  const [storage, setStorage] = useState<StorageSummary | undefined>(
    initial.storage,
  );
  const [settings, setSettings] = useState(initial.settings);
  const [input, setInput] = useState(() => {
    const value = storageFormInitial(
      initial.storage,
      initial.settings.defaultStorageId,
    );
    return initial.storage
      ? value
      : { ...value, type: initialType, enabled: initialType === 'local' };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [referenceView, setReferenceView] = useState(false);
  const [maintenanceView, setMaintenanceView] = useState<
    'cleanup' | 'default' | null
  >(null);
  const [savedView, setSavedView] = useState(
    initialSaved && initial.storage?.type === 's3',
  );
  const [r2Confirmation, setR2Confirmation] = useState(false);
  const testOpener = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const pendingSave = useRef<PendingStorageSave | null>(null);
  const [reconciledStorage, setReconciledStorage] = useState<StorageSummary>();
  const effective =
    detail &&
    storage?.id === detail.id &&
    detail.configRevision >= storage.configRevision
      ? detail
      : storage;
  const s3 = input.type === 's3';
  const references = detail?.references;
  const locked = Boolean(
    references &&
    (references.activeWrites > 0 ||
      Object.values(references.counts).some((count) => count > 0)),
  );
  const active = detail?.probes.find(
    (probe) => probe.purpose === 'connection' && probe.state === 'running',
  );
  const connected =
    effective?.connectionStatus === 'passed' &&
    effective.connectionRevision === effective.configRevision;

  async function refresh(syncEnabled = false, syncDefault = false) {
    const result = await onRefresh();
    if (result.data) {
      setSettings(result.data.settings);
      if (result.data.storage) {
        setStorage(result.data.storage);
        if (syncEnabled)
          setInput((current) => ({
            ...current,
            enabled: result.data!.storage!.enabled,
          }));
        if (syncDefault)
          setInput((current) => ({
            ...current,
            isDefault:
              result.data!.settings.defaultStorageId ===
              result.data!.storage!.id,
          }));
      }
    }
    await client.invalidateQueries({ queryKey: ['storage-overview'] });
    await client.invalidateQueries({ queryKey: ['storage-settings'] });
    await upload.client.invalidateQueries({ queryKey: ['upload-settings'] });
    if (effective)
      await client.invalidateQueries({
        queryKey: ['storage-cors', effective.id],
      });
  }
  async function reconcile() {
    if (!pendingSave.current) return;
    setMessage('正在核对已保存的存储配置，输入会保留。');
    try {
      const result = await reconcileStorageSave(pendingSave.current);
      if (result.storage) setReconciledStorage(result.storage);
      if (result.matched && !result.credentialsUnverified) {
        if (result.storage) {
          setStorage(result.storage);
          setInput((current) => ({
            ...current,
            enabled: result.storage!.enabled,
          }));
        }
        if (result.settings) setSettings(result.settings);
        pendingSave.current = null;
        setUnknown(false);
        setMessage('已回读核对，本次修改已保存。');
        await refresh();
        if (!initial.storage && result.storage)
          router.replace(
            `/settings/storage/${encodeURIComponent(result.storage.id)}`,
          );
      } else {
        setUnknown(true);
        setMessage(
          result.matched
            ? `已找到配置 ${result.storage?.id}。凭据不会回显，无法核对是否为本次输入；输入已保留。请使用当前已保存配置后测试，或明确重新保存凭据。`
            : '无法确认本次修改已保存。输入已保留，请核对当前配置；不会自动重复提交。',
        );
      }
    } catch (cause) {
      setUnknown(true);
      setMessage(
        `无法核对保存结果，输入已保留。请恢复连接后重新核对：${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
  function showError(error: unknown) {
    if (error instanceof StorageRequestError && error.status === 401) {
      resetUpload();
      window.location.replace(
        `/login?reason=expired&returnTo=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }
    if (error instanceof StorageRequestError) {
      setErrors(
        Object.fromEntries(
          error.fields.map(({ field, message }) => [field, message]),
        ),
      );
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>(
            '#storage-form [aria-invalid="true"] input, #storage-form input[aria-invalid="true"]',
          )
          ?.focus(),
      );
      setMessage(error.message);
    } else {
      setMessage(
        `无法开始保存，输入已保留${error instanceof Error ? `：${error.message}` : ''}`,
      );
    }
  }
  async function save(nextInput = input) {
    if (inFlight.current || unknown) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setSuccess('');
    setErrors({});
    let saved: StorageSummary | undefined;
    try {
      const payload = storageFormPayload(nextInput, storage);
      if (storage)
        pendingSave.current = {
          kind: 'update',
          id: storage.id,
          input: payload,
        };
      else {
        const before = await storageRequest<StorageSummary[]>('/api/storages');
        pendingSave.current = {
          kind: 'create',
          beforeIds: before.map((row) => row.id),
          input:
            payload as import('../../server/storage/validation').StorageCreateInput,
        };
      }
      saved =
        storage && Object.keys(payload).length === 0
          ? storage
          : await storageRequest<StorageSummary>(
              storage ? storageUrl(storage.id) : '/api/storages',
              {
                method: storage ? 'PATCH' : 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
              },
            );
      setStorage(saved);
      pendingSave.current = null;
      setInput((current) => ({
        ...storageFormInitial(saved),
        isDefault: current.isDefault,
      }));
      const desiredDefault = nextInput.isDefault
        ? saved.id
        : settings.defaultStorageId === saved.id
          ? null
          : settings.defaultStorageId;
      if (!s3 && desiredDefault !== settings.defaultStorageId) {
        pendingSave.current = { kind: 'default', id: desiredDefault };
        const next = await storageRequest<StorageSettings>(storageSettingsUrl, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ defaultStorageId: desiredDefault }),
        });
        setSettings(next);
        pendingSave.current = null;
      }
      setSuccess(
        s3 && !saved.enabled
          ? '配置已保存，等待连接测试。保存不会自动启用；连接测试通过后，再手动启用此存储。'
          : '配置已保存。',
      );
      await refresh();
      if (!initial.storage)
        router.replace(
          `/settings/storage/${encodeURIComponent(saved.id)}?saved=1`,
        );
    } catch (error) {
      if (saved) setSuccess('存储配置已保存；默认存储设置尚未完成。');
      if (
        pendingSave.current &&
        (!(error instanceof StorageRequestError) || error.status >= 500)
      ) {
        setUnknown(true);
        await reconcile();
      } else {
        pendingSave.current = null;
        showError(error);
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function test(wholeBucketHasNoLockRules = false) {
    if (
      !effective ||
      inFlight.current ||
      active ||
      s3 !== (effective.type === 's3')
    )
      return;
    inFlight.current = true;
    setSavedView(true);
    setTesting(true);
    setBusy(true);
    setMessage('');
    setSuccess('');
    try {
      await storageRequest(`${storageUrl(effective.id)}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          revision: effective.configRevision,
          ...(wholeBucketHasNoLockRules ? { wholeBucketHasNoLockRules } : {}),
        }),
      });
    } catch (error) {
      setMessage(
        `连接测试未完成，请重新读取报告${error instanceof Error ? `：${error.message}` : ''}`,
      );
    } finally {
      await refresh(true);
      setBusy(false);
      setTesting(false);
      inFlight.current = false;
    }
  }
  async function setEnabled(enabled: boolean) {
    if (!effective || inFlight.current || unknown) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setSuccess('');
    pendingSave.current = {
      kind: 'update',
      id: effective.id,
      input: { enabled },
    };
    try {
      const saved = await storageRequest<StorageSummary>(
        storageUrl(effective.id),
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled }),
        },
      );
      pendingSave.current = null;
      setStorage(saved);
      setInput((current) => ({ ...current, enabled: saved.enabled }));
      setSuccess(enabled ? '存储已启用。' : '存储已停用，默认选择保持不变。');
      await refresh();
    } catch (error) {
      if (
        pendingSave.current &&
        (!(error instanceof StorageRequestError) || error.status >= 500)
      ) {
        setUnknown(true);
        await reconcile();
      } else {
        pendingSave.current = null;
        showError(error);
      }
      setMaintenanceView(null);
      setSavedView(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function retryCleanup(probeId: string) {
    if (!effective || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await storageRequest(
        `${storageUrl(effective.id)}/probes/${encodeURIComponent(probeId)}/retry-cleanup`,
        { method: 'POST' },
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function scan() {
    if (!effective || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      await storageRequest(`${storageUrl(effective.id)}/scan`, {
        method: 'POST',
      });
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  const footer = (
    <>
      {s3 ? (
        <Button
          data-testid="storage-test"
          ref={testOpener}
          variant="outline"
          className={`${actionClass} flex-1 min-[1200px]:w-32 min-[1200px]:flex-none`}
          isDisabled={
            !effective ||
            effective.type !== 's3' ||
            busy ||
            unknown ||
            Boolean(active) ||
            !effective.hasAccessKey ||
            !effective.hasSecretKey ||
            Boolean(refreshError)
          }
          onPress={() => {
            if (
              /^https:\/\/[a-z0-9]+(?:\.[a-z0-9-]+)?\.r2\.cloudflarestorage\.com\/?$/i.test(
                effective?.endpoint ?? '',
              )
            )
              setR2Confirmation(true);
            else void test();
          }}
        >
          {effective ? '测试连接' : '保存后测试'}
        </Button>
      ) : null}
      <Button
        variant="outline"
        className={
          locked && !s3
            ? 'h-12 w-[90px] rounded-lg text-sm font-normal min-[1200px]:w-40'
            : `${actionClass} ${s3 ? 'w-18 min-[1200px]:w-28' : 'w-28'}`
        }
        isDisabled={busy}
        onPress={() => router.push('/settings/storage')}
      >
        {locked && !s3 ? '返回列表' : '取消'}
      </Button>
      <Button
        data-testid="storage-save"
        type="submit"
        form="storage-form"
        className={
          locked && !s3
            ? 'h-12 flex-1 rounded-lg text-sm font-normal min-[1200px]:w-60 min-[1200px]:flex-none'
            : `${actionClass} w-34`
        }
        isDisabled={busy || unknown || Boolean(refreshError)}
      >
        {busy ? '正在保存' : initial.storage || s3 ? '保存配置' : '创建存储'}
      </Button>
    </>
  );
  if (maintenanceView && detail)
    return (
      <StorageMaintenanceView
        shell={shell}
        storage={detail}
        view={maintenanceView}
        defaultStorageId={settings.defaultStorageId}
        busy={busy || unknown || Boolean(refreshError)}
        onReturn={() => setMaintenanceView(null)}
        onRefresh={() => refresh(false, maintenanceView === 'default')}
        onRetryCleanup={retryCleanup}
        onRetryScan={scan}
        onDisable={() => void setEnabled(!detail.enabled)}
      />
    );
  if (referenceView && detail)
    return (
      <StorageReferenceView
        shell={shell}
        storage={detail}
        busy={busy}
        onReturn={() => setReferenceView(false)}
        onCleanup={() => {
          setReferenceView(false);
          setMaintenanceView('cleanup');
        }}
      />
    );
  if (savedView && effective && !r2Confirmation)
    return (
      <StorageConnectionResult
        shell={shell}
        storage={effective}
        report={
          active?.purpose === 'connection'
            ? (active.report as StorageSummary['connectionReport'])
            : testing
              ? null
              : effective.connectionReport
        }
        busy={Boolean(active) || testing}
        working={busy || unknown || Boolean(refreshError)}
        message={message || refreshError}
        onReturn={() => {
          setSavedView(false);
          requestAnimationFrame(() => testOpener.current?.focus());
        }}
        onEnable={() => void setEnabled(true)}
        onTest={() => {
          if (
            /^https:\/\/[a-z0-9]+(?:\.[a-z0-9-]+)?\.r2\.cloudflarestorage\.com\/?$/i.test(
              effective.endpoint ?? '',
            )
          )
            setR2Confirmation(true);
          else void test();
        }}
      />
    );
  return (
    <OwnerShell {...shell} footer={footer}>
      <section
        data-testid="storage-editor"
        className="grid gap-5 pb-10 [overflow-wrap:anywhere] min-[1200px]:gap-6"
      >
        <header className="grid gap-1.5">
          <h1
            className={
              locked && !s3
                ? 'text-2xl font-medium leading-normal min-[1200px]:text-[30px]'
                : 'text-[30px] font-medium leading-normal'
            }
          >
            {!initial.storage
              ? '添加存储'
              : s3
                ? 'S3 存储配置'
                : '本地存储配置'}
          </h1>
          <p className="text-sm leading-normal">
            {s3
              ? initial.storage
                ? '配置连接信息与访问方式。'
                : '填写连接信息，测试通过后可启用。'
              : locked && references
                ? `${effective?.name} · 被 ${references.counts.images ?? 0} 张图片和 ${references.counts.cleanupJobs ?? 0} 个清理任务引用`
                : '管理本地目录、启用状态与默认存储。'}
          </p>
        </header>
        {!(locked && !s3) ? (
          <Link
            href="/settings/storage"
            className="flex h-11 w-45 items-center justify-center rounded-lg border border-border text-sm no-underline min-[1200px]:h-10"
          >
            ‹ 返回存储管理
          </Link>
        ) : null}
        {message ? (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Description>{message}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {unknown ? (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="min-h-11"
              isDisabled={busy}
              onPress={() => {
                setBusy(true);
                void reconcile().finally(() => setBusy(false));
              }}
            >
              核对保存结果
            </Button>
            {reconciledStorage ? (
              <Button
                variant="outline"
                className="min-h-11"
                isDisabled={busy}
                onPress={() => {
                  setStorage(reconciledStorage);
                  setInput(
                    storageFormInitial(
                      reconciledStorage,
                      settings.defaultStorageId,
                    ),
                  );
                  setUnknown(false);
                  pendingSave.current = null;
                  setMessage('已使用当前保存的配置，请核对后继续。');
                  if (!initial.storage)
                    router.replace(
                      `/settings/storage/${encodeURIComponent(reconciledStorage.id)}`,
                    );
                }}
              >
                使用当前已保存配置
              </Button>
            ) : null}
          </div>
        ) : null}
        {success ? (
          <p
            role="status"
            className="rounded-xl bg-default p-4 text-sm leading-normal"
          >
            {success}
          </p>
        ) : null}
        {refreshError ? (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Description>
                无法读取最新配置：{refreshError}
              </Alert.Description>
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                onPress={() => void refresh()}
              >
                重新加载
              </Button>
            </Alert.Content>
          </Alert>
        ) : null}
        <StorageForm
          value={input}
          storage={effective}
          storageRoot={storageRoot}
          locked={locked}
          busy={busy || unknown || Boolean(refreshError)}
          errors={errors}
          onChange={setInput}
          onSubmit={() => void save()}
        />
        {effective && s3 ? (
          <>
            <Button
              variant="outline"
              className="min-h-11 justify-self-start rounded-lg"
              onPress={() => setSavedView(true)}
            >
              查看连接测试结果
            </Button>
            <p className="text-[13px] text-muted">
              测试只使用已保存配置；尚未保存的输入不会参与检测。
            </p>
            {connected ? (
              <Link
                href={`/settings/storage/${encodeURIComponent(effective.id)}/cors`}
                className="flex min-h-11 items-center rounded-lg border border-border px-4 text-sm no-underline justify-self-start"
              >
                浏览器直传设置
              </Link>
            ) : (
              <p className="text-[13px] text-muted">
                连接测试通过后可检测浏览器直传。
              </p>
            )}
          </>
        ) : null}
        {detail && locked ? (
          <div className="flex w-full max-w-190 items-center gap-2 text-[13px] text-muted">
            <LockKeyhole className="size-4 shrink-0" aria-hidden="true" />
            <span>存在引用，暂不可删除</span>
            <StorageTip label="删除限制">
              先在“引用与清理”中查看图片、上传和清理任务。解除引用后才能删除；更换存储位置请新建配置。
            </StorageTip>
          </div>
        ) : null}
        {detail ? (
          <div
            data-testid="storage-editor-actions"
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              variant="outline"
              className="min-h-11 rounded-lg px-3 text-sm font-normal"
              data-testid="storage-open-default"
              onPress={() => setMaintenanceView('default')}
            >
              <Settings2 className="size-4 shrink-0" aria-hidden="true" />
              默认存储设置
            </Button>
            <Button
              variant="outline"
              className="min-h-11 rounded-lg px-3 text-sm font-normal"
              data-testid="storage-open-cleanup"
              onPress={() => setReferenceView(true)}
            >
              <ListChecks className="size-4 shrink-0" aria-hidden="true" />
              引用与清理
            </Button>
            <StorageDeleteDialog
              storage={detail}
              onDeleted={() => router.push('/settings/storage')}
              onRefresh={() => void refresh()}
              isDisabled={busy || unknown || Boolean(refreshError)}
            />
          </div>
        ) : null}
        {r2Confirmation ? (
          <AlertDialog.Backdrop
            isOpen
            onOpenChange={(open) => {
              if (!open) {
                setR2Confirmation(false);
                requestAnimationFrame(() => testOpener.current?.focus());
              }
            }}
          >
            <AlertDialog.Container
              placement="center"
              className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
            >
              <AlertDialog.Dialog className="w-full max-w-none max-h-[calc(100dvh_-_32px)] gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 [overflow-wrap:anywhere]">
                <AlertDialog.Header className="p-0">
                  <AlertDialog.Heading className="text-xl font-medium leading-normal">
                    确认 R2 Bucket 锁定设置
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body className="m-0! grid gap-4 p-0 text-sm leading-normal">
                  <p>R2 的部分配置不能通过 S3 接口自动检查。</p>
                  <div className="rounded-lg bg-default p-3 text-[13px]">
                    <p>
                      请在 Cloudflare 控制台确认整个目标 Bucket
                      都没有锁定规则，并关闭公共访问入口。
                    </p>
                    <p>
                      你的确认与自动检测结果会分开记录；更换位置或凭据后需要重新确认。确认后仍会执行写入、读取和删除测试。
                    </p>
                  </div>
                </AlertDialog.Body>
                <AlertDialog.Footer className="mt-0! flex-col gap-4 p-0">
                  <Button
                    variant="outline"
                    className="h-12 w-full rounded-lg text-sm font-normal"
                    onPress={() => {
                      setR2Confirmation(false);
                      requestAnimationFrame(() => testOpener.current?.focus());
                    }}
                  >
                    返回配置
                  </Button>
                  <Button
                    className="h-12 w-full rounded-lg text-sm font-normal"
                    onPress={() => {
                      setR2Confirmation(false);
                      void test(true);
                      requestAnimationFrame(() => testOpener.current?.focus());
                    }}
                  >
                    已确认，开始测试
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        ) : null}
      </section>
    </OwnerShell>
  );
}
