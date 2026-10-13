/* eslint-disable @next/next/no-img-element -- Isolated prototype uses local samples and user-selected Blob URLs. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Alert } from '@heroui/react/alert';
import { CloudUpload } from 'lucide-react';
import { UploadRelations } from '../../../src/components/upload/relations';
import { UploadSubmissionSummaries } from '../../../src/components/upload/submission-summary';
import type {
  UploadItem,
  UploadRelation,
  UploadState,
  UploadSubmissionSummary,
} from '../../../src/components/upload/types';
import {
  Field,
  Footer,
  Header,
  Help,
  SelectField,
  buttonClass,
  usePrototype,
} from './shared';

const initialAlbums: UploadRelation[] = [
  { id: 'album-forest', name: '森林漫步' },
  { id: 'album-mountain', name: '山野旅行' },
  { id: 'album-daily', name: '日常片刻' },
];
const initialTags: UploadRelation[] = [
  { id: 'tag-nature', name: '自然' },
  { id: 'tag-autumn', name: '秋日' },
  { id: 'tag-travel', name: '旅行' },
];
const storages = [
  { id: 'local', label: '本地存储' },
  { id: 's3', label: '旅行照片 · S3' },
];
const labels: Partial<Record<UploadState, string>> = {
  queued: '等待上传',
  'waiting-upload': '等待传输',
  uploading: '正在上传',
  saving: '正在核验和保存',
  processing: '图片处理中',
  ready: '成功',
  'upload-failed': '上传失败 · 未创建图片',
  unknown: '结果待核对',
  cancelled: '已取消',
};
const terminal = new Set<UploadState>([
  'ready',
  'upload-failed',
  'processing-failed',
  'cancelled',
]);
const transmitting = new Set<UploadState>([
  'waiting-upload',
  'uploading',
  'saving',
]);

function initialQueue(): UploadItem[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `sample-${index + 1}`,
    name: `${index % 2 ? '山间清晨' : '森林小径'}_${String(index + 1).padStart(2, '0')}.jpg`,
    size: 1_900_000 + index * 125_000,
    previewUrl: index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg',
    state: 'queued',
    progress: 0,
  }));
}

/** Local queue simulation; the product upload provider and APIs are deliberately not mounted. */
export function UploadDemo() {
  const { mode, scenario } = usePrototype();
  const [items, setItems] = useState<UploadItem[]>(initialQueue);
  const [storage, setStorage] = useState('local');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [albums, setAlbums] = useState<UploadRelation[]>(initialAlbums);
  const [tags, setTags] = useState<UploadRelation[]>(initialTags);
  const [selectedAlbums, setSelectedAlbums] = useState<UploadRelation[]>([
    initialAlbums[0],
  ]);
  const [selectedTags, setSelectedTags] = useState<UploadRelation[]>([
    initialTags[0],
    initialTags[1],
  ]);
  const [inputError, setInputError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [createKind, setCreateKind] = useState<'albums' | 'tags' | null>(null);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [detail, setDetail] = useState<UploadItem | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [checking, setChecking] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  const settingsSection = useRef<HTMLDivElement>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());
  const objectUrls = useRef(new Set<string>());
  const submissionNumber = useRef(0);
  const nextTransferAt = useRef(0);
  const queuedCount = items.filter((item) => item.state === 'queued').length;
  const readyCount = items.filter((item) => item.state === 'ready').length;
  const failedCount = items.filter(
    (item) => item.state === 'upload-failed',
  ).length;
  const cancelledCount = items.filter(
    (item) => item.state === 'cancelled',
  ).length;
  const completedCount = items.filter((item) =>
    terminal.has(item.state),
  ).length;
  const hasStarted = items.some((item) => !!item.frozenSubmission);
  const allTerminal = items.length > 0 && completedCount === items.length;
  const cancelItem = items.find((item) => item.id === cancelId);
  const canConfirmCancel =
    !!cancelItem &&
    (transmitting.has(cancelItem.state) || cancelItem.state === 'unknown');

  useEffect(() => {
    directory.current?.setAttribute('webkitdirectory', '');
    const timeouts = timers.current;
    const urls = objectUrls.current;
    return () => {
      timeouts.forEach((entries) => entries.forEach(clearTimeout));
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function schedule(id: string, delay: number, action: () => void) {
    const timer = setTimeout(action, delay);
    timers.current.set(id, [...(timers.current.get(id) ?? []), timer]);
  }

  function stopTimers(id: string) {
    timers.current.get(id)?.forEach(clearTimeout);
    timers.current.delete(id);
  }

  function patch(id: string, update: Partial<UploadItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  function release(item: UploadItem) {
    stopTimers(item.id);
    if (item.previewUrl && objectUrls.current.has(item.previewUrl)) {
      URL.revokeObjectURL(item.previewUrl);
      objectUrls.current.delete(item.previewUrl);
    }
  }

  function addFiles(files: File[]) {
    const accepted = files.filter(
      (file) => file.type.startsWith('image/') && file.size <= 50 * 1048576,
    );
    setInputError(
      accepted.length < files.length
        ? '仅接受不超过 50 MiB 的图片。其他文件未加入，已有队列保留。'
        : '',
    );
    const next: UploadItem[] = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.add(previewUrl);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        previewUrl,
        state: 'queued',
        progress: 0,
      };
    });
    setItems((current) => [...current, ...next]);
  }

  function simulate(
    ids: string[],
    outcome: typeof scenario,
    startedAt: number,
  ) {
    const duration = outcome === 'slow' ? 6000 : 1500;
    const wait = Math.max(0, nextTransferAt.current - startedAt);
    nextTransferAt.current =
      startedAt + wait + Math.ceil(ids.length / 3) * duration;
    ids.forEach((id, index) => {
      stopTimers(id);
      const delay = wait + Math.floor(index / 3) * duration;
      patch(id, {
        state: 'waiting-upload',
        progress: 0,
        error: undefined,
        canRetry: false,
      });
      schedule(id, delay + 30, () => patch(id, { state: 'uploading' }));
      [20, 45, 70, 100].forEach((progress, step) => {
        schedule(id, delay + (duration * (step + 1)) / 4, () =>
          patch(id, { progress }),
        );
      });
      schedule(id, delay + duration, () => {
        if (index === 0 && outcome === 'error') {
          patch(id, {
            state: 'upload-failed',
            canRetry: true,
            error: '存储写入失败，未创建图片。原文件与本次设置已保留，可重试。',
          });
        } else if (index === 0 && outcome === 'unknown') {
          patch(id, {
            state: 'unknown',
            error: '文件已传输，但保存响应未收到。请先核对结果，避免重复提交。',
          });
        } else {
          patch(id, { state: 'saving' });
        }
      });
      if (index !== 0 || (outcome !== 'error' && outcome !== 'unknown')) {
        schedule(id, delay + duration + 850, () =>
          patch(id, {
            state: 'processing',
            imageId: `image-${id}`,
            step: '生成缩略图',
          }),
        );
        schedule(id, delay + duration + 1850, () =>
          patch(id, { state: 'ready', progress: 100, step: undefined }),
        );
      }
    });
  }

  function start(startedAt: number) {
    const ids = items
      .filter((item) => item.state === 'queued')
      .map((item) => item.id);
    if (!ids.length) return;
    const summary: UploadSubmissionSummary = {
      id: crypto.randomUUID(),
      number: ++submissionNumber.current,
      count: ids.length,
      groups: Array.from({ length: Math.ceil(ids.length / 20) }, (_, index) =>
        Math.min(20, ids.length - index * 20),
      ),
      storageName: storages.find((item) => item.id === storage)!.label,
      visibility,
      albums: selectedAlbums.map((item) => ({ ...item })),
      tags: selectedTags.map((item) => ({ ...item })),
    };
    setItems((current) =>
      current.map((item) =>
        ids.includes(item.id)
          ? {
              ...item,
              frozenSubmission: summary,
              storageId: storage,
              visibility,
            }
          : item,
      ),
    );
    simulate(ids, scenario, startedAt);
  }

  function checkResult(item: UploadItem) {
    if (checking.includes(item.id)) return;
    setChecking((current) => [...current, item.id]);
    schedule(item.id, 1100, () => {
      patch(item.id, {
        state: 'ready',
        imageId: `image-${item.id}`,
        error: undefined,
      });
      setChecking((current) => current.filter((id) => id !== item.id));
    });
  }

  function editSettings() {
    const section = settingsSection.current;
    section?.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    requestAnimationFrame(() =>
      section
        ?.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')
        ?.focus({ preventScroll: true }),
    );
  }

  function openCreate(kind: 'albums' | 'tags') {
    setCreateName('');
    setCreateError('');
    setCreateKind(kind);
  }

  function createRelation() {
    const name = createName.trim();
    if (!name) {
      setCreateError('请输入名称。');
      return;
    }
    const choices = createKind === 'albums' ? albums : tags;
    if (choices.some((item) => item.name === name)) {
      setCreateError('名称已存在，请选择已有项或使用其他名称。');
      return;
    }
    const relation = { id: crypto.randomUUID(), name };
    if (createKind === 'albums') {
      setAlbums((current) => [...current, relation]);
      setSelectedAlbums((current) => [...current, relation]);
    } else {
      setTags((current) => [...current, relation]);
      setSelectedTags((current) => [...current, relation]);
    }
    setCreateKind(null);
  }

  return (
    <section
      className="grid min-w-0 gap-5 md:gap-6"
      aria-label="上传图片原型"
      onPaste={(event) => {
        if (event.clipboardData.files.length)
          addFiles([...event.clipboardData.files]);
      }}
    >
      <div className="grid gap-1.5">
        <Header title={allTerminal ? '本次上传结果' : '上传图片'} />
        {allTerminal ? (
          <p className="text-sm">
            成功 {readyCount} 张 · 失败 {failedCount} 张 · 取消 {cancelledCount}{' '}
            张。清空结果不会删除图片。
          </p>
        ) : null}
      </div>
      <input
        ref={input}
        aria-label="选择图片文件"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <input
        ref={directory}
        aria-label="选择图片文件夹"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      {inputError ? (
        <p role="alert" className="text-sm text-[var(--ariso-error-text)]">
          {inputError}
        </p>
      ) : null}
      <div
        data-testid="upload-composition"
        className="grid min-w-0 items-start gap-3 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6 min-[1200px]:max-w-[1280px]"
      >
        <div
          className={`grid min-w-0 gap-3 rounded-[20px] ${dragging ? 'outline-2 outline-offset-2 outline-focus' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles([...event.dataTransfer.files]);
          }}
        >
          {mode === 'after' && items.length ? (
            <Card
              data-testid="upload-draft-summary"
              aria-label="当前草稿上传设置"
              className="min-w-0 gap-0 rounded-2xl border border-border bg-surface px-4 py-3 shadow-none md:hidden"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <h2 className="text-sm font-medium">
                    {hasStarted ? '下一次设置' : '本次设置'}
                  </h2>
                  <p
                    data-testid="upload-draft-primary"
                    className="text-sm leading-5 [overflow-wrap:anywhere]"
                  >
                    {storages.find((item) => item.id === storage)?.label} ·{' '}
                    {visibility === 'private' ? '私有' : '公开'}
                  </p>
                  <p
                    data-testid="upload-draft-relations"
                    className="text-xs leading-5 text-muted"
                  >
                    {selectedAlbums.length} 个相册 · {selectedTags.length}{' '}
                    个标签
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="min-h-11 min-w-11 shrink-0 rounded-lg px-2 text-sm font-normal"
                  aria-label="修改上传设置"
                  onPress={editSettings}
                >
                  修改
                </Button>
              </div>
            </Card>
          ) : null}
          <UploadSubmissionSummaries items={items} />
          {items.length ? (
            <Card
              data-testid="upload-queue"
              className="min-w-0 gap-4 rounded-2xl border border-border bg-background px-3 py-4 shadow-none md:rounded-[20px] md:p-6"
            >
              <div className="hidden min-h-11 w-full flex-wrap items-center justify-between gap-3 md:flex">
                <h2 className="text-lg font-medium">
                  {queuedCount
                    ? `待上传 ${queuedCount} 张`
                    : `共 ${items.length} 张`}
                </h2>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-lg text-sm"
                    onPress={() => directory.current?.click()}
                  >
                    选择文件夹
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-lg text-sm"
                    onPress={() => input.current?.click()}
                  >
                    继续添加
                  </Button>
                </div>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid="upload-item"
                  data-queue-id={item.id}
                  data-state={item.state}
                  className="grid min-w-0 gap-3 py-2"
                >
                  <div
                    data-testid="upload-file-row"
                    className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_88px] items-center gap-2 md:min-h-20 xl:grid-cols-[64px_minmax(0,1fr)_140px] xl:gap-4"
                  >
                    <img
                      src={item.previewUrl ?? ''}
                      alt=""
                      className="size-14 rounded-lg object-cover xl:size-16"
                    />
                    <div className="grid min-w-0 gap-1 xl:grid-cols-3 xl:items-center xl:gap-4">
                      <p className="min-w-0 text-sm leading-normal [overflow-wrap:anywhere]">
                        {item.name}
                      </p>
                      <p className="text-xs leading-normal">
                        {(item.size / 1048576).toFixed(1)} MiB
                      </p>
                      <div
                        role="status"
                        className="grid min-w-0 gap-1.5 text-xs leading-5"
                      >
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                          <span>上传状态：</span>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              item.state === 'ready'
                                ? 'success'
                                : item.state === 'upload-failed'
                                  ? 'danger'
                                  : item.state === 'unknown'
                                    ? 'warning'
                                    : 'default'
                            }
                            className="h-auto min-h-6 max-w-full whitespace-normal py-0.5 text-xs"
                          >
                            {labels[item.state]}
                          </Chip>
                        </div>
                        {item.visibility ? (
                          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                            <span>图片状态：</span>
                            <Chip
                              size="sm"
                              variant="soft"
                              className="bg-default text-foreground"
                            >
                              {item.visibility === 'private' ? '私有' : '公开'}
                            </Chip>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="w-22 xl:w-35">
                      {item.state === 'queued' ? (
                        <Button
                          variant="outline"
                          className="h-11 w-full rounded-lg text-sm font-normal"
                          onPress={() => {
                            release(item);
                            setItems((current) =>
                              current.filter((entry) => entry.id !== item.id),
                            );
                          }}
                        >
                          移除
                        </Button>
                      ) : null}
                      {transmitting.has(item.state) ||
                      item.state === 'unknown' ? (
                        <Button
                          variant="outline"
                          className="h-11 w-full rounded-lg text-sm font-normal"
                          isDisabled={checking.includes(item.id)}
                          onPress={() => setCancelId(item.id)}
                        >
                          请求取消
                        </Button>
                      ) : null}
                      {item.state === 'upload-failed' ? (
                        <Button
                          variant="outline"
                          className="h-11 w-full rounded-lg text-sm font-normal"
                          onPress={() =>
                            simulate([item.id], 'normal', performance.now())
                          }
                        >
                          重试上传
                        </Button>
                      ) : null}
                      {item.imageId ? (
                        <Button
                          variant="outline"
                          className="h-11 w-full rounded-lg text-sm font-normal"
                          onPress={() => setDetail(item)}
                        >
                          查看详情
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {item.state === 'uploading' ? (
                    <ProgressBar
                      aria-label={`${item.name}文件传输进度`}
                      value={item.progress}
                    >
                      <ProgressBar.Output />
                      <ProgressBar.Track>
                        <ProgressBar.Fill />
                      </ProgressBar.Track>
                    </ProgressBar>
                  ) : null}
                  {item.state === 'processing' ? (
                    <p className="text-sm">
                      已交给服务端处理，不能取消。处理步骤：生成缩略图。
                    </p>
                  ) : null}
                  {item.error ? (
                    <Alert
                      status={item.state === 'unknown' ? 'warning' : 'danger'}
                      role="alert"
                    >
                      <Alert.Content>
                        <Alert.Description className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {item.error}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : null}
                  {item.state === 'unknown' ? (
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-lg text-sm"
                      isDisabled={checking.includes(item.id)}
                      onPress={() => checkResult(item)}
                    >
                      {checking.includes(item.id)
                        ? '正在核对结果…'
                        : '核对结果'}
                    </Button>
                  ) : null}
                </div>
              ))}
            </Card>
          ) : (
            <Card className="min-w-0 items-center justify-center gap-4 rounded-[20px] border border-dashed border-border bg-surface p-6 text-center shadow-none min-[1200px]:min-h-90">
              <CloudUpload size={32} aria-hidden />
              <h2 className="text-xl font-medium">
                <span className="md:hidden">选择要上传的图片</span>
                <span className="hidden md:inline">拖入图片或粘贴截图</span>
              </h2>
              <div className="grid w-full grid-cols-2 gap-3 min-[1200px]:w-auto">
                <Button
                  className={buttonClass}
                  onPress={() => input.current?.click()}
                >
                  选择图片
                </Button>
                <Button
                  variant="outline"
                  className={buttonClass}
                  onPress={() => directory.current?.click()}
                >
                  选择文件夹
                </Button>
              </div>
              <p className="text-xs text-muted">支持多选 · 单文件最大 50 MiB</p>
            </Card>
          )}
          {items.length ? (
            <Button
              variant="outline"
              className="mt-3 min-h-11 w-full rounded-lg text-sm md:hidden"
              onPress={() => directory.current?.click()}
            >
              选择文件夹
            </Button>
          ) : null}
        </div>
        <div
          ref={settingsSection}
          data-testid="upload-settings"
          className="min-w-0 scroll-mt-6"
        >
          <Card className="min-w-0 gap-4 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none md:min-h-90 md:p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium">
                {hasStarted ? '下一次上传设置' : '本次上传设置'}
              </h2>
              <Help label="上传设置">
                {hasStarted
                  ? '这里只影响下一次开始上传。已提交的批次沿用冻结设置。'
                  : '开始上传时固定本次设置。自动拆出的各批共用这些设置。'}
              </Help>
            </div>
            <SelectField
              label="存储位置"
              value={storage}
              onChange={setStorage}
              options={storages}
            />
            <SelectField
              label="可见性"
              value={visibility}
              onChange={(value) =>
                setVisibility(value === 'public' ? 'public' : 'private')
              }
              options={[
                { id: 'public', label: '公开' },
                { id: 'private', label: '私有' },
              ]}
            />
            <UploadRelations
              kind="albums"
              choices={albums}
              selected={selectedAlbums}
              onChange={setSelectedAlbums}
              onCreate={() => openCreate('albums')}
              onRefresh={async () => {}}
              loading={false}
              error={null}
            />
            <UploadRelations
              kind="tags"
              choices={tags}
              selected={selectedTags}
              onChange={setSelectedTags}
              onCreate={() => openCreate('tags')}
              onRefresh={async () => {}}
              loading={false}
              error={null}
            />
          </Card>
        </div>
      </div>
      <Footer>
        <div className="flex w-full flex-wrap items-center gap-3 md:justify-end">
          {completedCount ? (
            <Button
              variant="outline"
              className={`${buttonClass} flex-1 md:max-w-45`}
              onPress={() => {
                items
                  .filter((item) => terminal.has(item.state))
                  .forEach(release);
                setItems((current) =>
                  current.filter((item) => !terminal.has(item.state)),
                );
              }}
            >
              清空已完成
            </Button>
          ) : null}
          {items.length ? (
            <Button
              variant="outline"
              className={`${buttonClass} flex-1 md:hidden`}
              onPress={() => input.current?.click()}
            >
              继续添加
            </Button>
          ) : null}
          <Button
            data-testid="upload-start"
            className={`${buttonClass} flex-1 md:max-w-50`}
            isDisabled={queuedCount === 0}
            onPress={() => start(performance.now())}
          >
            开始上传
          </Button>
        </div>
      </Footer>
      {createKind ? (
        <Modal
          isOpen
          onOpenChange={(open) => {
            if (!open) setCreateKind(null);
          }}
        >
          <Modal.Backdrop>
            <Modal.Container placement="center" className="p-4">
              <Modal.Dialog className="max-h-[calc(100dvh-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
                <Modal.Header className="flex flex-row items-center justify-between gap-3">
                  <Modal.Heading className="text-xl font-medium">
                    新建{createKind === 'albums' ? '相册' : '标签'}
                  </Modal.Heading>
                  <CloseButton
                    aria-label="关闭新建"
                    className="size-11 shrink-0 rounded-lg border border-border"
                    onPress={() => setCreateKind(null)}
                  />
                </Modal.Header>
                <Modal.Body className="m-0 grid gap-4 p-0">
                  <Field
                    label={createKind === 'albums' ? '相册名称' : '标签名称'}
                    value={createName}
                    onChange={setCreateName}
                    error={createError}
                  />
                </Modal.Body>
                <Modal.Footer className="m-0 grid w-full grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className={buttonClass}
                    onPress={() => setCreateKind(null)}
                  >
                    取消
                  </Button>
                  <Button className={buttonClass} onPress={createRelation}>
                    创建并选择
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}
      {cancelId ? (
        <Modal
          isOpen
          onOpenChange={(open) => {
            if (!open) setCancelId(null);
          }}
        >
          <Modal.Backdrop>
            <Modal.Container placement="center" className="p-4">
              <Modal.Dialog className="w-full max-w-120 gap-4 rounded-xl border border-border bg-surface p-6">
                <Modal.Header>
                  <Modal.Heading className="text-xl font-medium">
                    取消这次上传？
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body className="m-0 grid gap-3 p-0 text-sm">
                  <p>
                    {canConfirmCancel
                      ? '仅在原图交给服务端处理前可以取消。结果以服务器确认为准。'
                      : '图片已交给服务端处理或已完成，无法取消。'}
                  </p>
                  <p className="break-all">
                    {items.find((item) => item.id === cancelId)?.name}
                  </p>
                </Modal.Body>
                <Modal.Footer className="m-0 grid w-full gap-3">
                  <Button
                    variant="outline"
                    className={buttonClass}
                    onPress={() => setCancelId(null)}
                  >
                    继续上传
                  </Button>
                  <Button
                    className={buttonClass}
                    isDisabled={!canConfirmCancel}
                    onPress={() => {
                      if (!canConfirmCancel) return;
                      stopTimers(cancelId);
                      patch(cancelId, { state: 'cancelled', error: undefined });
                      setCancelId(null);
                    }}
                  >
                    确认取消
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}
      {detail ? (
        <Modal
          isOpen
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
        >
          <Modal.Backdrop>
            <Modal.Container placement="center" className="p-4">
              <Modal.Dialog className="max-h-[calc(100dvh-32px)] w-full max-w-160 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6">
                <Modal.Header className="flex flex-row items-center justify-between gap-3">
                  <Modal.Heading className="min-w-0 break-all text-xl font-medium">
                    {detail.name}
                  </Modal.Heading>
                  <CloseButton
                    aria-label="关闭图片详情"
                    className="size-11 shrink-0 rounded-lg border border-border"
                    onPress={() => setDetail(null)}
                  />
                </Modal.Header>
                <Modal.Body className="m-0 grid gap-4 p-0">
                  <img
                    src={detail.previewUrl ?? ''}
                    alt={detail.name}
                    className="max-h-[45dvh] w-full rounded-lg object-contain"
                  />
                  <p className="text-sm">
                    {detail.frozenSubmission?.storageName} ·{' '}
                    {detail.visibility === 'private' ? '私有' : '公开'}
                  </p>
                  <p className="text-sm">
                    相册：
                    {detail.frozenSubmission?.albums
                      .map((item) => item.name)
                      .join('、') || '未选择'}
                  </p>
                  <p className="text-sm">
                    标签：
                    {detail.frozenSubmission?.tags
                      .map((item) => item.name)
                      .join('、') || '未选择'}
                  </p>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}
    </section>
  );
}
