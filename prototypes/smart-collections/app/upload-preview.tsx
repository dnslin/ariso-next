'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card, ProgressBar } from '@heroui/react';
import {
  Check,
  CircleAlert,
  Clock3,
  Play,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { PrototypeFrame } from './frame';
import { ImageDetail } from './image-detail';
import { useDemo } from './providers';
import { initialImages, type DemoImage } from './data';
import { ApiPreview } from './api-preview';
import {
  SamplePicker,
  UploadQueue,
  UploadSettingsCard,
  terminal,
  type QueueItem,
  type SampleFile,
  type UploadDraft,
} from './upload-queue';

const defaultDraft: UploadDraft = {
  storage: '本地存储',
  visibility: 'private',
  albums: [],
  tags: ['截图'],
};
const source = (id: string) => initialImages.find((image) => image.id === id)!;
const samples: SampleFile[] = [
  {
    key: 'new',
    name: '网页布局-新截图.png',
    src: '/demo-new-screenshot.png',
    bytes: 2_400_000,
    targetId: 'uploaded-screenshot',
    kind: 'new',
  },
  {
    key: 'duplicate',
    name: '湖边清晨-副本.jpg',
    src: source('lake').src,
    bytes: source('lake').bytes,
    targetId: 'lake',
    kind: 'duplicate',
  },
  {
    key: 'trash',
    name: '海边日落.jpg',
    src: source('sunset').src,
    bytes: source('sunset').bytes,
    targetId: 'sunset',
    kind: 'trash',
  },
  {
    key: 'failure',
    name: '森林-裁剪版.jpg',
    src: source('forest').src,
    bytes: 4_600_000,
    targetId: 'uploaded-forest-crop',
    kind: 'failure',
  },
];

const draftDescription = (draft: UploadDraft) =>
  `${draft.storage} · ${draft.visibility === 'private' ? '私有' : '公开'} · ${draft.albums.length ? draft.albums.join('、') : '无相册'} · ${draft.tags.length ? draft.tags.join('、') : '无标签'}`;

export function UploadPreview({ active = true }: { active?: boolean }) {
  const { scenario } = useDemo();
  if (scenario === 'api') return <ApiPreview active={active} />;
  const scene =
    scenario === 'upload-error' || scenario === 'backfill'
      ? scenario
      : 'normal';
  return <UploadWorkspace key={scene} scene={scene} active={active} />;
}

function UploadWorkspace({
  scene,
  active,
}: {
  scene: string;
  active: boolean;
}) {
  const { images, setImages } = useDemo();
  const [draft, setDraft] = useState<UploadDraft>(defaultDraft);
  const [items, setItems] = useState<QueueItem[]>(() =>
    scene === 'upload-error'
      ? [
          {
            ...samples[3],
            id: 'failed-example',
            state: 'failed',
            progress: 35,
            draft: defaultDraft,
          },
        ]
      : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<
    { count: number; draft: UploadDraft }[]
  >(() =>
    scene === 'upload-error' ? [{ count: 1, draft: defaultDraft }] : [],
  );
  const [backfillTotal] = useState(images.length);
  const [indexed, setIndexed] = useState(Math.max(0, images.length - 3));
  const [indexing, setIndexing] = useState(false);
  const imageRef = useRef(images);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settingsRef = useRef<HTMLDivElement>(null);
  const detailTrigger = useRef<string | null>(null);
  const detailScroll = useRef(0);
  useEffect(() => {
    imageRef.current = images;
  }, [images]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function later(action: () => void, delay: number) {
    timers.current.push(setTimeout(action, delay));
  }
  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  function openDetail(id: string) {
    detailScroll.current =
      document.getElementById('main-content')?.scrollTop ?? 0;
    detailTrigger.current =
      document.activeElement instanceof HTMLElement
        ? (document.activeElement.closest<HTMLElement>('[data-upload-id]')
            ?.dataset.uploadId ?? null)
        : null;
    setDetailId(id);
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;
      main?.focus({ preventScroll: true });
    });
  }
  function closeDetail() {
    setDetailId(null);
    requestAnimationFrame(() => {
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = detailScroll.current;
      const trigger = detailTrigger.current
        ? document.querySelector<HTMLElement>(
            `[data-upload-id="${detailTrigger.current}"] button`,
          )
        : null;
      (trigger ?? document.getElementById('demo-upload-title'))?.focus({
        preventScroll: true,
      });
    });
  }

  function complete(item: QueueItem, frozen: UploadDraft) {
    const existing = imageRef.current.find(
      (image) => image.id === item.targetId,
    );
    if (existing) {
      updateItem(item.id, {
        state: existing.trashed ? 'trash' : 'duplicate',
        resultId: existing.id,
        progress: 100,
      });
      return;
    }
    updateItem(item.id, { state: 'processing', progress: 100 });
    later(() => {
      const image: DemoImage = {
        id: item.targetId,
        name: item.name,
        src: item.src,
        bytes: item.bytes,
        daysAgo: 0,
        tags: [...frozen.tags],
        visibility: frozen.visibility,
      };
      const simultaneous = imageRef.current.find(
        (current) => current.id === image.id,
      );
      if (simultaneous) {
        updateItem(item.id, {
          state: simultaneous.trashed ? 'trash' : 'duplicate',
          resultId: image.id,
        });
        return;
      }
      imageRef.current = [image, ...imageRef.current];
      setImages((current) => [image, ...current]);
      updateItem(item.id, { state: 'ready', resultId: image.id });
    }, 450);
  }

  function transfer(
    item: QueueItem,
    frozen: UploadDraft,
    retry = false,
    offset = 0,
  ) {
    updateItem(item.id, { state: 'uploading', progress: 0, draft: frozen });
    later(() => updateItem(item.id, { progress: 35 }), 250 + offset);
    later(() => {
      if (item.kind === 'failure' && !retry) {
        updateItem(item.id, { state: 'failed', progress: 35 });
        return;
      }
      updateItem(item.id, { progress: 100, state: 'checking' });
      later(() => complete(item, frozen), 400);
    }, 650 + offset);
  }

  function start() {
    const queued = items.filter((item) => item.state === 'queued');
    if (!queued.length) return;
    const frozen = structuredClone(draft);
    setSubmissions((current) => [
      ...current,
      { count: queued.length, draft: frozen },
    ]);
    queued.forEach((item, index) => transfer(item, frozen, false, index * 180));
  }

  function add(chosen: SampleFile[]) {
    setItems((current) => [
      ...current,
      ...chosen.map((sample) => ({
        ...sample,
        id: crypto.randomUUID(),
        state: 'queued' as const,
        progress: 0,
      })),
    ]);
  }
  function retry(id: string) {
    const item = items.find((item) => item.id === id);
    if (item?.state === 'failed')
      transfer(item, item.draft ?? structuredClone(draft), true);
  }
  function finishIndexing() {
    setIndexing(true);
    const total = backfillTotal;
    for (let count = indexed + 1; count <= total; count++)
      later(
        () => {
          setIndexed(count);
          if (count === total) setIndexing(false);
        },
        (count - indexed) * 500,
      );
  }

  const queued = items.filter((item) => item.state === 'queued').length;
  const ready = items.filter((item) => item.state === 'ready').length;
  const duplicates = items.filter(
    (item) => item.state === 'duplicate' || item.state === 'trash',
  ).length;
  const failed = items.filter((item) => item.state === 'failed').length;
  const processing = items.some(
    (item) => !terminal(item) && item.state !== 'queued',
  );
  const completed = items.filter(terminal).length;
  const footer = detailId ? undefined : (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
        aria-live="polite"
      >
        <span>
          新增成功{' '}
          <strong className="font-medium text-foreground">{ready}</strong>
        </span>
        <span>
          重复跳过{' '}
          <strong className="font-medium text-foreground">{duplicates}</strong>
        </span>
        <span>
          失败 <strong className="font-medium text-foreground">{failed}</strong>
        </span>
      </div>
      <div className="flex flex-1 gap-3 sm:flex-none">
        {completed > 0 && (
          <Button
            variant="outline"
            className="h-12 flex-1 rounded-lg px-4 sm:flex-none"
            onPress={() =>
              setItems((current) => current.filter((item) => !terminal(item)))
            }
          >
            清空已完成
          </Button>
        )}
        <Button
          className="h-12 flex-1 rounded-lg px-6 sm:min-w-44 sm:flex-none"
          isDisabled={queued === 0}
          onPress={start}
        >
          <Play size={16} aria-hidden />
          {queued
            ? `开始上传（${queued}）`
            : processing
              ? '正在处理'
              : '开始上传'}
        </Button>
      </div>
    </div>
  );

  if (!active) return null;
  return (
    <PrototypeFrame footer={footer}>
      {detailId ? (
        <ImageDetail imageId={detailId} onClose={closeDetail} />
      ) : (
        <section className="grid gap-6" aria-labelledby="demo-upload-title">
          <h1
            id="demo-upload-title"
            tabIndex={-1}
            className="text-2xl font-medium md:text-[28px]"
          >
            上传图片
          </h1>
          {scene === 'backfill' && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-default p-4"
            >
              {indexed >= backfillTotal ? (
                <Check size={20} aria-hidden />
              ) : (
                <Clock3 size={20} aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {indexed >= backfillTotal
                    ? '旧图库检查完成'
                    : '旧图库检查尚未完成'}{' '}
                  · {Math.min(indexed, backfillTotal)} / {backfillTotal}
                </p>
                {indexed < backfillTotal && (
                  <p className="mt-1 text-xs leading-5 text-muted">
                    未检查的旧图暂不能保证识别重复。新上传会立即检查。
                  </p>
                )}
                <ProgressBar
                  aria-label="旧图库指纹检查进度"
                  value={indexed}
                  maxValue={backfillTotal}
                  className="mt-3"
                >
                  <ProgressBar.Track className="h-1.5">
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </div>
              {indexed < backfillTotal && (
                <Button
                  variant="outline"
                  className="min-h-11 rounded-lg"
                  isDisabled={indexing}
                  onPress={finishIndexing}
                >
                  <RotateCcw size={15} aria-hidden />
                  {indexing ? '正在检查' : '继续检查'}
                </Button>
              )}
            </div>
          )}
          <div className="grid w-full max-w-320 items-start gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 gap-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 md:hidden">
                <p className="min-w-0 text-xs leading-5 text-muted">
                  {draft.storage} ·{' '}
                  {draft.visibility === 'private' ? '私有' : '公开'}
                  <br />
                  {draft.albums.length} 个相册 · {draft.tags.length} 个标签
                </p>
                <Button
                  variant="ghost"
                  className="min-h-11 shrink-0 rounded-lg px-2"
                  onPress={() => {
                    settingsRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                    settingsRef.current
                      ?.querySelector<HTMLElement>('[aria-haspopup="listbox"]')
                      ?.focus({ preventScroll: true });
                  }}
                >
                  <SlidersHorizontal size={15} aria-hidden />
                  修改
                </Button>
              </div>
              {submissions.length > 0 && (
                <Card className="gap-3 rounded-xl border border-border bg-default p-4 shadow-none">
                  {submissions.map((submission, index) => (
                    <div key={index} className="text-xs leading-5">
                      <p className="font-medium">
                        第 {index + 1} 次上传 · {submission.count} 张 ·
                        设置已固定
                      </p>
                      <p className="mt-1 text-muted">
                        {draftDescription(submission.draft)}
                      </p>
                    </div>
                  ))}
                </Card>
              )}
              <UploadQueue
                items={items}
                onChoose={() => setPickerOpen(true)}
                onView={openDetail}
                onRetry={retry}
                onRemove={(id) =>
                  setItems((current) =>
                    current.filter((item) => item.id !== id),
                  )
                }
              />
              {duplicates > 0 && (
                <p className="flex items-start gap-2 px-1 text-xs leading-5 text-muted">
                  <CircleAlert
                    size={15}
                    className="mt-0.5 shrink-0"
                    aria-hidden
                  />
                  重复项没有新增，也没有改变已有图片的标签、相册或可见性。
                </p>
              )}
            </div>
            <div ref={settingsRef} className="min-w-0 scroll-mt-4">
              <UploadSettingsCard
                draft={draft}
                onChange={setDraft}
                started={submissions.length > 0}
              />
            </div>
          </div>
        </section>
      )}
      <SamplePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        samples={samples}
        onAdd={add}
      />
    </PrototypeFrame>
  );
}
