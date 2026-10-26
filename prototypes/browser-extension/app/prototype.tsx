'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import {
  ArrowLeft,
  CircleAlert,
  Images,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import { Choice, secondary } from './ui';
import { UploadSettings } from './upload-settings';
import { ConnectionDialog } from './connection-dialog';
import {
  CopyFallbackDialog,
  ResultNotice,
  SourceErrorDialog,
  SourcePermissionDialog,
  UploadReviewDialog,
} from './result-dialogs';
import { QueuePanel } from './queue-panel';
import { SourcePage } from './source-page';
import {
  type QueueItem,
  type Visibility,
  resultText,
  samples,
  scenarioOptions,
  sourceName,
} from './model';

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function Prototype({ initialView }: { initialView: string }) {
  const [view, setView] = useState(initialView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [scenario, setScenario] = useState('normal');
  const [connected, setConnected] = useState(true);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [site, setSite] = useState('https://images.example');
  const [connectedSite, setConnectedSite] = useState('https://images.example');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [testing, setTesting] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [version, setVersion] = useState('site');
  const [album, setAlbum] = useState('');
  const [tag, setTag] = useState('');
  const [storageId, setStorageId] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [format, setFormat] = useState('url');
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [sourceAllowed, setSourceAllowed] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState<QueueItem | null>(null);
  const [copyFallback, setCopyFallback] = useState('');
  const [dark, setDark] = useState(false);
  const sequence = useRef(0);
  const run = useRef(0);
  const blobUrls = useRef<string[]>([]);
  const busy = items.some((item) =>
    ['uploading', 'processing'].includes(item.state),
  );
  const queued = items.filter((item) => item.state === 'queued').length;

  useEffect(() => {
    const roundCounter = run;
    const urls = blobUrls.current;
    return () => {
      roundCounter.current++;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  }, [dark]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function navigate(next: string) {
    setView(next);
    if (next === 'upload') setSettingsOpen(false);
    const url = new URL(window.location.href);
    if (next === 'web') url.searchParams.set('view', 'web');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  }
  function add(sample: (typeof samples)[number], source: QueueItem['source']) {
    const id = String(++sequence.current);
    setItems((current) => [
      ...current,
      { ...sample, id, source, state: 'queued', progress: 0 },
    ]);
  }
  function addFiles(
    files: FileList | File[],
    source: QueueItem['source'] = '本地图片',
  ) {
    let added = 0;
    let rejected = 0;
    for (const file of Array.from(files)) {
      if (
        (!file.type.startsWith('image/') &&
          !/\.(heic|heif|avif|tiff?)$/i.test(file.name)) ||
        file.size <= 0 ||
        file.size > 50 * 1024 * 1024
      ) {
        rejected++;
        continue;
      }
      const src = URL.createObjectURL(file);
      blobUrls.current.push(src);
      add(
        {
          name: file.name || `粘贴图片-${++sequence.current}.png`,
          src,
          bytes: file.size,
        },
        source,
      );
      added++;
    }
    setNotice(
      `${added ? `已加入 ${added} 张图片` : '没有可加入的图片'}${rejected ? `；${rejected} 项为空文件、超出 50 MiB 或不是图片` : ''}`,
    );
  }
  function changeScenario(next: string) {
    run.current++;
    setItems((current) =>
      current.map((item) =>
        ['uploading', 'processing'].includes(item.state)
          ? { ...item, state: 'unknown', message: '传输已中断，请先核对图库。' }
          : item,
      ),
    );
    setScenario(next);
    setSourceError(false);
    if (next === 'first-connection') {
      setConnected(false);
      setConnectionError('');
      setConnectionOpen(true);
    }
    if (next === 'token-invalid') setConnected(true);
    if (next === 'source-denied') navigate('web');
  }
  async function startUpload() {
    if (busy || !connected) return;
    if (scenario === 'token-invalid') {
      setConnected(false);
      setNotice('上传 Token 已失效。请在站点设置中更换。');
      return;
    }
    const batch = items.filter((item) => item.state === 'queued');
    const round = ++run.current;
    const snapshotVisibility = visibility;
    const update = (id: string, values: Partial<QueueItem>) =>
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...values } : item)),
      );
    for (const [index, item] of batch.entries()) {
      if (run.current !== round) return;
      update(item.id, {
        state: 'uploading',
        progress: 15,
        visibility: snapshotVisibility,
      });
      await pause(320);
      if (run.current !== round) return;
      update(item.id, { progress: 70 });
      await pause(380);
      if (run.current !== round) return;
      update(item.id, { state: 'processing', progress: 100 });
      await pause(650);
      if (run.current !== round) return;
      if (scenario === 'duplicate' && index === 0)
        update(item.id, {
          state: 'duplicate',
          message: '相同图片已存在，本次没有新增。请到图库查看。',
        });
      else if (scenario === 'upload-error' && index === 0)
        update(item.id, {
          state: 'failed',
          message: '存储暂时不可用，请先检查 Ariso 中的存储状态。',
        });
      else if (scenario === 'unknown' && index === 0)
        update(item.id, {
          state: 'unknown',
          message: '连接已中断，Ariso 可能仍在处理。请先核对图库。',
        });
      else if (scenario === 'version-unavailable' && index === 0)
        update(item.id, {
          state: 'version-unavailable',
          message: '图片已保存，但本次没有生成所选版本。无需重新上传。',
        });
      else update(item.id, { state: 'ready', message: undefined });
    }
    setNotice('');
  }
  function stopUpload() {
    run.current++;
    setItems((current) =>
      current.map((item) =>
        ['uploading', 'processing'].includes(item.state)
          ? {
              ...item,
              state: 'unknown',
              message: '已停止客户端传输。图片可能已被接收，请先核对图库。',
            }
          : item,
      ),
    );
    setNotice('传输已停止，未开始的图片保留在队列。');
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('已复制');
    } catch {
      setCopyFallback(text);
    }
  }
  function saveSource() {
    if (!connected) {
      setConnectionOpen(true);
      return;
    }
    if (sourceAllowed) finishSource();
    else setPermissionOpen(true);
  }
  function finishSource() {
    setPermissionOpen(false);
    setSourceAllowed(true);
    if (scenario === 'source-denied') {
      setSourceError(true);
      return;
    }
    add({ ...samples[0], name: '山海之间.jpg' }, '网页图片');
    navigate('upload');
    setNotice('');
  }
  function reset() {
    run.current++;
    setItems([]);
    setScenario('normal');
    setConnected(true);
    setConnectionOpen(false);
    setSettingsOpen(false);
    setSite('https://images.example');
    setConnectedSite('https://images.example');
    setAdvanced(false);
    setConnectionError('');
    setShowToken(false);
    setPermissionOpen(false);
    setVisibility('public');
    setVersion('site');
    setAlbum('');
    setTag('');
    setStorageId('');
    setFormat('url');
    setSourceAllowed(false);
    setSourceError(false);
    setReview(null);
    setCopyFallback('');
    setToken('');
    setNotice('');
    navigate('upload');
  }
  const host = new URL(connectedSite).host;

  return (
    <div
      className="min-h-dvh bg-default/20 text-foreground"
      onPaste={(event) => {
        const target = event.target as HTMLElement;
        if (connectionOpen || ['INPUT', 'TEXTAREA'].includes(target.tagName))
          return;
        const images = Array.from(event.clipboardData.items)
          .filter((item) => item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (images.length) {
          event.preventDefault();
          addFiles(images, '剪贴板');
          navigate('upload');
        }
      }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {view === 'web' ? (
          <SourcePage
            onSave={saveSource}
            onBack={() => navigate('upload')}
            onCopy={() =>
              void copy('https://' + sourceName + '/mountain-lake.jpg')
            }
          />
        ) : (
          <>
            <p className="mb-5 text-center text-xs text-muted">
              Ariso 浏览器插件 · 精简小窗原型
            </p>
            <main
              aria-label="Ariso 上传小窗"
              className="mx-auto w-full max-w-[360px] overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_48px_-20px_#27234340]"
            >
              <header className="flex h-14 items-center justify-between border-b border-border px-3">
                {settingsOpen ? (
                  <div className="flex items-center gap-1">
                    <Button
                      isIconOnly
                      variant="ghost"
                      aria-label="返回上传"
                      className="size-11 rounded-lg"
                      onPress={() => setSettingsOpen(false)}
                    >
                      <ArrowLeft size={17} />
                    </Button>
                    <h1 className="text-sm font-semibold">设置</h1>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pl-1">
                    <Images size={18} strokeWidth={1.5} />
                    <h1
                      className="text-3xl leading-none"
                      style={{ fontFamily: 'Caveat, cursive' }}
                    >
                      Ariso
                    </h1>
                    <span
                      className={
                        connected
                          ? 'size-1.5 rounded-full bg-[#26716a] dark:bg-[#82dbd3]'
                          : 'size-1.5 rounded-full bg-danger'
                      }
                      title={connected ? '已连接：' + host : '尚未连接'}
                    />
                  </div>
                )}
                {!settingsOpen && (
                  <Button
                    isIconOnly
                    isDisabled={busy}
                    variant="ghost"
                    aria-label="设置"
                    className="size-11 rounded-lg text-muted"
                    onPress={() => setSettingsOpen(true)}
                  >
                    <Settings2 size={17} />
                  </Button>
                )}
              </header>
              {settingsOpen ? (
                <UploadSettings
                  busy={busy}
                  visibility={visibility}
                  setVisibility={setVisibility}
                  version={version}
                  setVersion={setVersion}
                  album={album}
                  setAlbum={setAlbum}
                  tag={tag}
                  setTag={setTag}
                  storageId={storageId}
                  setStorageId={setStorageId}
                  advanced={advanced}
                  onToggleAdvanced={() => setAdvanced((value) => !value)}
                  host={host}
                  connected={connected}
                  onConnection={() => {
                    setSite(connectedSite);
                    setConnectionError('');
                    setConnectionOpen(true);
                  }}
                  dark={dark}
                  onTheme={() => setDark((value) => !value)}
                />
              ) : (
                <>
                  {!connected && (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-2 border-b border-border bg-danger/5 px-4 py-2"
                    >
                      <p className="flex items-center gap-1.5 text-xs">
                        <CircleAlert size={14} />
                        {scenario === 'token-invalid'
                          ? 'Token 已失效'
                          : '先连接你的 Ariso'}
                      </p>
                      <Button
                        variant="ghost"
                        className="min-h-11 rounded-lg px-2 text-xs"
                        onPress={() => setConnectionOpen(true)}
                      >
                        连接
                      </Button>
                    </div>
                  )}
                  <QueuePanel
                    items={items}
                    busy={busy}
                    connected={connected}
                    visibility={visibility}
                    format={format}
                    onFormat={setFormat}
                    onFiles={(files) => addFiles(files)}
                    onRemove={(id) =>
                      setItems((current) =>
                        current.filter((item) => item.id !== id),
                      )
                    }
                    onClear={() => setItems([])}
                    onStart={() => void startUpload()}
                    onStop={stopUpload}
                    onCopy={(list) =>
                      void copy(
                        list
                          .map((item) => resultText(item, format, version))
                          .join('\n'),
                      )
                    }
                    onReview={setReview}
                    onUseOriginal={(id) => {
                      setVersion('original');
                      setItems((current) =>
                        current.map((item) =>
                          item.id === id
                            ? { ...item, state: 'ready', message: undefined }
                            : item,
                        ),
                      );
                      setNotice('已选择原图');
                    }}
                  />
                </>
              )}
              <ResultNotice message={notice} onClose={() => setNotice('')} />
            </main>
          </>
        )}
        <details className="mx-auto mt-5 w-full max-w-[360px] text-xs text-muted">
          <summary className="flex min-h-11 cursor-pointer items-center justify-center">
            原型演示工具
          </summary>
          <div className="grid gap-3 rounded-xl border border-border bg-surface p-3">
            <p>仅演示，不连接真实后台</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                className={secondary}
                onPress={() =>
                  samples.forEach((sample) => add(sample, '示例图片'))
                }
              >
                加入示例图片
              </Button>
              <Button className={secondary} onPress={() => navigate('web')}>
                网页右键演示
              </Button>
            </div>
            <Choice
              label="演示场景"
              value={scenario}
              options={scenarioOptions}
              onChange={changeScenario}
            />
            <Button
              variant="ghost"
              aria-label="重置演示"
              className="min-h-11 rounded-lg text-xs"
              onPress={reset}
            >
              <RotateCcw size={14} />
              重置演示
            </Button>
          </div>
        </details>
      </div>
      <ConnectionDialog
        open={connectionOpen}
        connected={connected}
        testing={testing}
        site={site}
        setSite={setSite}
        token={token}
        setToken={setToken}
        showToken={showToken}
        onToggleToken={() => setShowToken((value) => !value)}
        connectionError={connectionError}
        onClose={() => {
          if (!testing) {
            setConnectionOpen(false);
            setToken('');
          }
        }}
        scenario={scenario}
        setTesting={setTesting}
        setConnectionError={setConnectionError}
        onConnected={() => {
          setConnected(true);
          setConnectedSite(site);
          setConnectionOpen(false);
          setToken('');
          setNotice('已连接');
        }}
        onRemove={() => {
          setConnected(false);
          setNotice('已移除本机演示连接，Ariso 中的图片保留。');
        }}
      />
      <SourcePermissionDialog
        open={permissionOpen}
        onClose={() => setPermissionOpen(false)}
        onAllow={finishSource}
      />
      <SourceErrorDialog
        open={sourceError}
        onClose={() => setSourceError(false)}
        onUseLocal={() => {
          setSourceError(false);
          navigate('upload');
        }}
      />
      <UploadReviewDialog review={review} onClose={() => setReview(null)} />
      <CopyFallbackDialog
        text={copyFallback}
        onClose={() => setCopyFallback('')}
      />
      <span className="sr-only" aria-live="polite">
        {queued} 张图片待上传
      </span>
    </div>
  );
}
