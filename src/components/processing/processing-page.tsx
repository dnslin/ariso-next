'use client';

import { useRef, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Card } from '@heroui/react/card';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { OwnerShell } from '../shell/owner-shell';
import { SettingsCategories } from '../shell/settings-categories';
import {
  processingRequest,
  processingSettingsUrl,
  ProcessingRequestError,
  type SavedProcessingSettings,
} from './api';
import { fieldLabels, footerActionClass } from './model';
import { ProcessingForm } from './settings-form';
import { useProcessingSettings } from './use-processing-settings';
import { usePreview } from './use-preview';
import { PreviewPane } from './preview-pane';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const categories = [{ href: '/settings/processing', label: '图片处理' }];

export function ProcessingPage(shell: ShellProps) {
  const query = useQuery({
    queryKey: ['processing-settings'],
    queryFn: ({ signal }) =>
      processingRequest<SavedProcessingSettings>(processingSettingsUrl, {
        signal,
      }),
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  if (query.data) return <ProcessingEditor {...shell} initial={query.data} />;
  const sessionLost =
    query.error instanceof ProcessingRequestError && query.error.status === 401;
  return (
    <OwnerShell {...shell}>
      <section
        data-testid="processing-editor"
        data-state={
          sessionLost ? 'session' : query.isPending ? 'loading' : 'error'
        }
        className="pb-10"
      >
        <SettingsHeading />
        <SettingsCategories items={categories}>
          {query.isPending ? (
            <Card
              role="status"
              aria-label="正在读取处理设置"
              className="min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:p-6"
            >
              <h2 className="text-lg font-medium">正在读取处理设置</h2>
              <p className="text-[13px] leading-5 text-muted">
                请稍候，取得已保存设置后再编辑。
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 rounded-xl border border-border p-5">
              <h2 className="text-lg font-medium">
                {sessionLost ? '会话已失效' : '无法读取处理设置'}
              </h2>
              <p role="alert" className="text-sm text-danger">
                {query.error?.message}
              </p>
              {sessionLost ? (
                <SessionLink />
              ) : (
                <Button
                  data-testid="processing-settings-retry"
                  variant="outline"
                  className="min-h-11 w-fit rounded-xl"
                  onPress={() => void query.refetch()}
                >
                  重新读取设置
                </Button>
              )}
            </div>
          )}
        </SettingsCategories>
      </section>
    </OwnerShell>
  );
}

function SettingsHeading() {
  return (
    <div className="grid gap-1.5">
      <h1 className="text-[30px] font-medium leading-normal">站点设置</h1>
      <p className="text-sm leading-normal">管理站点、图片处理与账号偏好。</p>
    </div>
  );
}
function SessionLink() {
  return (
    <Link
      href="/login?reason=expired&returnTo=%2Fsettings%2Fprocessing"
      className="flex min-h-11 w-fit items-center rounded-xl border border-border px-4 text-sm text-foreground no-underline"
    >
      重新登录
    </Link>
  );
}

function ProcessingEditor({
  initial,
  ...shell
}: ShellProps & { initial: SavedProcessingSettings }) {
  const settings = useProcessingSettings(initial);
  const preview = usePreview(settings.input, settings.expired, settings.expire);
  const [view, setView] = useState<'settings' | 'preview'>('settings');
  const [mode, setMode] = useState<'text' | 'image'>(
    initial.watermarkMode === 'image' ? 'image' : 'text',
  );
  const [assetBusy, setAssetBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<
    'compression' | 'watermark' | 'recreate' | null
  >(null);
  const settingsScroll = useRef(0);
  const previewScroll = useRef(0);
  const previewOpener = useRef<HTMLButtonElement>(null);
  const confirmationOpener = useRef<HTMLElement | null>(null);
  const busy = settings.busy || settings.expired;
  function openPreview() {
    settingsScroll.current =
      document.querySelector('.shell-content')?.scrollTop ?? 0;
    setView('preview');
    requestAnimationFrame(() => {
      const main = document.querySelector('.shell-content');
      if (main) main.scrollTop = previewScroll.current;
      document
        .querySelector<HTMLElement>('#processing-preview-title')
        ?.focus({ preventScroll: true });
    });
  }
  function returnToSettings(restoreFocus = true) {
    previewScroll.current =
      document.querySelector('.shell-content')?.scrollTop ?? 0;
    setView('settings');
    requestAnimationFrame(() => {
      const main = document.querySelector('.shell-content');
      if (main) main.scrollTop = settingsScroll.current;
      if (restoreFocus) previewOpener.current?.focus({ preventScroll: true });
    });
  }
  function ask(value: 'compression' | 'watermark' | 'recreate') {
    confirmationOpener.current = document.activeElement as HTMLElement;
    setConfirmation(value);
  }
  function closeConfirmation() {
    setConfirmation(null);
    requestAnimationFrame(() =>
      confirmationOpener.current?.focus({ preventScroll: true }),
    );
  }
  function toggle(kind: 'compression' | 'watermark', selected: boolean) {
    const defaultTarget = kind === 'compression' ? 'compressed' : 'watermark';
    if (!selected && settings.input.defaultLinkVersion === defaultTarget) {
      ask(kind);
      return;
    }
    if (kind === 'compression') settings.change('compressionEnabled', selected);
    else settings.change('watermarkMode', selected ? mode : 'off');
  }
  function generate(recreate = false) {
    if (!settings.validate('preview')) {
      returnToSettings(false);
      return;
    }
    void preview.create((fields) => {
      if (fields.length) {
        returnToSettings(false);
        settings.applyErrors(fields);
      }
    }, recreate);
  }
  const footer =
    view === 'settings' ? (
      <>
        <Button
          ref={previewOpener}
          data-testid="processing-preview-open"
          variant="outline"
          className={footerActionClass}
          isDisabled={busy || assetBusy}
          onPress={openPreview}
        >
          预览处理效果
        </Button>
        <Button
          data-testid="processing-save"
          type="submit"
          form="processing-form"
          className={footerActionClass}
          isDisabled={busy || assetBusy || settings.unknown}
        >
          {settings.busy ? '正在保存…' : '保存处理设置'}
        </Button>
      </>
    ) : (
      <>
        {preview.busy !== 'cancelling' ? (
          <Button
            data-testid="processing-preview-return"
            variant="outline"
            className={footerActionClass}
            onPress={() => returnToSettings()}
          >
            返回设置
          </Button>
        ) : null}
        {preview.active ? (
          <Button
            data-testid="processing-preview-cancel"
            className={footerActionClass}
            isDisabled={
              Boolean(preview.busy) ||
              Boolean(preview.unknown) ||
              settings.expired
            }
            onPress={() => void preview.cancel()}
          >
            取消预览
          </Button>
        ) : (
          <Button
            data-testid="processing-preview-create"
            className={footerActionClass}
            isDisabled={
              !preview.file ||
              Boolean(preview.busy) ||
              Boolean(preview.unknown) ||
              settings.expired ||
              assetBusy
            }
            onPress={() => generate()}
          >
            {preview.busy === 'creating' ? '正在提交…' : '生成预览'}
          </Button>
        )}
      </>
    );
  return (
    <OwnerShell {...shell} footer={footer} onSessionExpire={settings.expire}>
      {settings.expired ? (
        <div
          role="alert"
          className="mb-5 grid gap-3 rounded-xl border border-border p-4 text-sm"
        >
          <p>会话已失效，当前输入仍保留。请重新登录后继续操作。</p>
          <SessionLink />
        </div>
      ) : null}
      <section
        hidden={view !== 'settings'}
        data-testid="processing-editor"
        data-state={settings.expired ? 'session' : 'ready'}
        className="pb-10"
      >
        <SettingsHeading />
        <SettingsCategories items={categories}>
          {settings.message ? (
            <div className="mb-5 grid gap-3 rounded-xl border border-border p-4 text-sm">
              <p role="alert">{settings.message}</p>
              {settings.unknown ? (
                <Button
                  data-testid="processing-settings-reconcile"
                  variant="outline"
                  className="min-h-11 w-fit rounded-xl"
                  isDisabled={busy}
                  onPress={() => void settings.reconcile()}
                >
                  核对已保存设置
                </Button>
              ) : null}
              {settings.different ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr>
                          <th className="p-2">字段</th>
                          <th className="p-2">已保存</th>
                          <th className="p-2">当前输入</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          Object.keys(
                            fieldLabels,
                          ) as (keyof typeof fieldLabels)[]
                        )
                          .filter(
                            (field) =>
                              !Object.is(
                                settings.input[field],
                                settings.saved[field],
                              ),
                          )
                          .map((field) => (
                            <tr key={field}>
                              <th className="border-t border-border p-2 font-normal">
                                {fieldLabels[field]}
                              </th>
                              <td className="border-t border-border p-2 wrap-anywhere">
                                {String(settings.saved[field] ?? '空')}
                              </td>
                              <td className="border-t border-border p-2 wrap-anywhere">
                                {String(settings.input[field] ?? '空')}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      data-testid="processing-settings-preserve"
                      variant="outline"
                      className="min-h-11 rounded-xl"
                      onPress={() => settings.chooseSaved(false)}
                    >
                      保留当前输入
                    </Button>
                    <Button
                      data-testid="processing-settings-use-saved"
                      className="min-h-11 rounded-xl"
                      onPress={() => {
                        setMode(
                          settings.saved.watermarkMode === 'image'
                            ? 'image'
                            : 'text',
                        );
                        settings.chooseSaved(true);
                      }}
                    >
                      使用已保存设置
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {Object.keys(settings.errors).length ? (
            <p
              id="processing-errors"
              tabIndex={-1}
              role="alert"
              className="mb-4 text-sm text-danger"
            >
              请修正字段：
              {Object.entries(settings.errors)
                .map(
                  ([field, message]) =>
                    `${fieldLabels[field as keyof typeof fieldLabels] ?? field}：${message}`,
                )
                .join('；')}
            </p>
          ) : null}
          <ProcessingForm
            input={settings.input}
            mode={mode}
            busy={busy}
            errors={settings.errors}
            change={settings.change}
            onSave={() => void settings.save()}
            onCompression={(value) => toggle('compression', value)}
            onToggle={(value) => toggle('watermark', value)}
            onMode={(value) => {
              setMode(value);
              settings.change('watermarkMode', value);
            }}
            onAssetBusy={setAssetBusy}
            onExpire={settings.expire}
          />
        </SettingsCategories>
      </section>
      <div hidden={view !== 'preview'}>
        <PreviewPane
          preview={preview}
          expired={settings.expired}
          onExpire={settings.expire}
          onRecreate={() => ask('recreate')}
          onReturn={() => returnToSettings()}
        />
      </div>
      <AlertDialog
        isOpen={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) closeConfirmation();
        }}
      >
        <AlertDialog.Backdrop isKeyboardDismissDisabled={false}>
          <AlertDialog.Container
            placement="center"
            className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
          >
            <AlertDialog.Dialog
              data-testid={
                confirmation === 'recreate'
                  ? 'processing-recreate-confirmation'
                  : 'processing-default-confirmation'
              }
              className="max-h-[calc(100dvh_-_32px)] w-full max-w-none gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6"
            >
              <AlertDialog.CloseTrigger
                aria-label="关闭确认"
                className="size-11"
              />
              <AlertDialog.Header className="p-0">
                <AlertDialog.Heading className="pr-8 text-xl font-medium">
                  {confirmation === 'recreate'
                    ? '重新创建预览？'
                    : '关闭当前默认版本？'}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="m-0! p-0 text-sm leading-normal">
                <p>
                  {confirmation === 'recreate'
                    ? '上次请求可能已创建临时预览，但没有返回可查询的 ID。继续将提交一次新的请求；旧临时预览由服务端到期清理。'
                    : '改为原图后再关闭此版本。默认链接会跟随原图，固定版本链接保持不变；不会自动生成历史缺失版本。'}
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer className="m-0! flex gap-3 p-0">
                <Button
                  slot="close"
                  variant="outline"
                  className="h-12 min-w-0 flex-1 rounded-xl"
                >
                  取消
                </Button>
                <Button
                  data-testid={
                    confirmation === 'recreate'
                      ? 'processing-confirm-recreate'
                      : 'processing-confirm-default'
                  }
                  className="h-12 min-w-0 flex-1 rounded-xl"
                  onPress={() => {
                    const action = confirmation;
                    closeConfirmation();
                    if (action === 'recreate') {
                      generate(true);
                    } else if (action) {
                      settings.change('defaultLinkVersion', 'original');
                      if (action === 'compression')
                        settings.change('compressionEnabled', false);
                      else settings.change('watermarkMode', 'off');
                    }
                  }}
                >
                  {confirmation === 'recreate'
                    ? '确认重新创建'
                    : '改为原图并继续'}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </OwnerShell>
  );
}
