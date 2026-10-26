import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@heroui/react';
import {
  ArrowLeft,
  CircleAlert,
  Link2,
  LoaderCircle,
  Settings2,
} from 'lucide-react';
import { UploadController } from '../../lib/controller';
import { defaultSettings } from '../../lib/settings';
import { resultText } from '../../lib/output';
import type {
  CopyFormat,
  ExtensionSettings,
  UploadItem,
} from '../../lib/types';
import { ConnectionDialog } from '../../components/connection-dialog';
import { QueuePanel } from '../../components/queue-panel';
import { SettingsPanel } from '../../components/settings-panel';
import { SourceList } from '../../components/source-list';
import {
  CopyDialog,
  Notice,
  ResultDialog,
  type NoticeValue,
} from '../../components/result-dialogs';
import { useConnection } from '../../components/use-connection';
import { useSources } from '../../components/use-sources';
import { messageOf, primary } from '../../components/ui';

export function App({ controller }: { controller: UploadController }) {
  const [view, setView] = useState<'upload' | 'settings'>('upload');
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [format, setFormat] = useState<CopyFormat>('url');
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [copyText, setCopyText] = useState('');
  const reportError = useCallback(
    (text: string) => setNotice({ text, error: true }),
    [],
  );
  const showUpload = useCallback(() => setView('upload'), []);
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot);
  const { connection, loading, issue, change, connectTo, remove } =
    useConnection(controller, reportError);
  const ready = !!connection && !loading && !issue;
  const source = useSources(
    controller,
    ready ? connection.capabilities.maxFileBytes : undefined,
    reportError,
    showUpload,
  );
  const settings = connection?.settings ?? defaultSettings;
  const visibility =
    settings.visibility ??
    connection?.capabilities.defaultVisibility ??
    'public';
  const review = snapshot.items.find((item) => item.id === reviewId);
  const hasStorage =
    !!connection &&
    (!!settings.storageId || connection.capabilities.defaultStorageAvailable);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dark',
      settings.theme === 'dark',
    );
    document.documentElement.classList.toggle(
      'light',
      settings.theme !== 'dark',
    );
  }, [settings.theme]);
  useEffect(() => () => controller.destroy(), [controller]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const addFiles = useCallback(
    (files: File[], origin: UploadItem['source'] = 'local') => {
      if (!ready) {
        reportError('请先连接 Ariso。');
        return;
      }
      const result = controller.addFiles(files, origin);
      if (result.message) reportError(result.message);
      if (result.added) setView('upload');
    },
    [controller, ready, reportError],
  );
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA'].includes(target.tagName) ||
          target.isContentEditable);
      const data = event.clipboardData;
      if (connectionOpen || editing || !data) return;
      const files = Array.from(data.items)
        .filter(
          (item) => item.kind === 'file' && item.type.startsWith('image/'),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length) {
        event.preventDefault();
        addFiles(files, 'clipboard');
      } else if (/^https?:\/\//i.test(data.getData('text/plain')))
        setNotice({ text: '请在网页图片上右键保存，或粘贴图片文件。' });
    }
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [addFiles, connectionOpen]);
  function start() {
    if (!ready || !connection) return;
    setNotice(null);
    void controller
      .start(connection.settings)
      .catch((error) => reportError(messageOf(error)));
  }
  async function copy(items: readonly UploadItem[]) {
    const output = items
      .map((item) => resultText(item, format))
      .filter((text): text is string => text !== null)
      .join('\n');
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setNotice({ text: '已复制' });
    } catch {
      setCopyText(output);
    }
  }
  function connected(next: ExtensionSettings) {
    return connectTo(next).then(() => {
      setConnectionOpen(false);
      setNotice({ text: '已连接' });
    });
  }
  function disconnected() {
    return remove().then(() => {
      setConnectionOpen(false);
      setReviewId(null);
      setView('upload');
      setNotice({ text: '已移除本机连接' });
    });
  }

  return (
    <div className="min-h-dvh bg-background p-2 text-foreground">
      <main
        aria-label="Ariso 上传小窗"
        className="mx-auto w-full max-w-[360px] overflow-hidden rounded-xl border border-border bg-surface"
      >
        <header className="flex h-14 items-center justify-between border-b border-border px-3">
          {view === 'settings' ? (
            <div className="flex items-center gap-1">
              <Button
                isIconOnly
                variant="ghost"
                aria-label="返回上传"
                className="size-11 rounded-lg"
                onPress={showUpload}
              >
                <ArrowLeft size={17} />
              </Button>
              <h1 className="text-sm font-semibold">设置</h1>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-1">
              <h1
                className="text-3xl leading-none"
                style={{ fontFamily: 'Caveat, cursive' }}
              >
                Ariso
              </h1>
              <span
                className={`size-1.5 rounded-full ${ready ? 'bg-[#26716a] dark:bg-[#82dbd3]' : 'bg-muted'}`}
                title={
                  ready
                    ? `已连接：${new URL(settings.siteUrl).host}`
                    : '尚未连接'
                }
              />
            </div>
          )}
          {view === 'upload' && (
            <Button
              isIconOnly
              isDisabled={loading || snapshot.busy || !connection}
              variant="ghost"
              aria-label="设置"
              className="size-11 rounded-lg text-muted"
              onPress={() => setView('settings')}
            >
              <Settings2 size={17} />
            </Button>
          )}
        </header>
        {loading ? (
          <div
            role="status"
            className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted"
          >
            <LoaderCircle
              size={18}
              className="animate-spin motion-reduce:animate-none"
            />
            正在连接站点…
          </div>
        ) : !ready ? (
          <section
            className="grid justify-items-center gap-4 px-5 py-8"
            aria-label="连接 Ariso"
          >
            <Link2 size={28} className="text-muted" />
            <h2 className="text-sm font-medium">连接你的 Ariso</h2>
            {issue && (
              <p role="alert" className="text-xs leading-5 text-danger">
                {issue}
              </p>
            )}
            {source.entries.length > 0 && (
              <p className="text-xs text-muted">
                有 {source.entries.length} 张网页图片等待加入
              </p>
            )}
            <Button className={primary} onPress={() => setConnectionOpen(true)}>
              {connection ? '重新测试连接' : '设置连接'}
            </Button>
          </section>
        ) : view === 'settings' ? (
          <SettingsPanel
            connection={connection}
            busy={snapshot.busy}
            onChange={change}
            onConnection={() => setConnectionOpen(true)}
          />
        ) : (
          <>
            <SourceList
              entries={source.entries}
              onAuthorize={source.authorize}
              onDismiss={(entry) => void source.dismiss(entry)}
            />
            {!hasStorage && (
              <div
                role="alert"
                className="border-b border-border bg-danger/5 px-4 py-3 text-xs leading-5"
              >
                <p className="flex items-start gap-1.5 text-danger">
                  <CircleAlert size={14} className="mt-0.5 shrink-0" />
                  没有可用默认存储，请在设置中指定存储。
                </p>
                <a
                  href={`${settings.siteUrl}/settings/storage`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  管理存储
                </a>
              </div>
            )}
            <QueuePanel
              snapshot={snapshot}
              capabilities={connection.capabilities}
              visibility={visibility}
              canStart={hasStorage}
              format={format}
              onFormat={setFormat}
              onFiles={(files) => addFiles(files)}
              onRemove={(id) => controller.remove(id)}
              onClear={() => {
                controller.clear();
                setNotice(null);
              }}
              onStart={start}
              onStop={() => controller.stop()}
              onCopy={(items) => void copy(items)}
              onReview={(item) => setReviewId(item.id)}
              onOriginal={(id) => controller.useVersion(id, 'original')}
            />
          </>
        )}
        <Notice value={notice} onClose={() => setNotice(null)} />
      </main>
      {connectionOpen && (
        <ConnectionDialog
          settings={settings}
          connected={!!connection}
          hasItems={snapshot.items.length > 0}
          onClose={() => setConnectionOpen(false)}
          onConnect={connected}
          onRemove={disconnected}
        />
      )}
      {review && (
        <ResultDialog
          item={review}
          onClose={() => setReviewId(null)}
          onVersion={(kind) => {
            controller.useVersion(review.id, kind);
            setReviewId(null);
          }}
          onCopy={() => void copy([review])}
        />
      )}
      {copyText && (
        <CopyDialog text={copyText} onClose={() => setCopyText('')} />
      )}
    </div>
  );
}
