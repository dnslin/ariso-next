import { useEffect, useState } from 'react';
import { Accordion } from '@heroui/react/accordion';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Link } from '@heroui/react/link';
import { Modal } from '@heroui/react/modal';
import {
  ArrowRight,
  FolderOpen,
  Images,
  ListChecks,
  ScanLine,
  Upload,
} from 'lucide-react';
import { BatchThumbnail } from '../../../src/components/library/batch-targets';
import {
  Footer,
  Header,
  Help,
  buttonClass,
  panelClass,
  usePrototype,
} from './shared';

type ImageRecord = {
  id: string;
  name: string;
  storage: string;
  status: string;
  task?: string;
  trashed?: boolean;
  deletion?: string;
  photo: string;
};
const records: ImageRecord[] = [
  {
    id: 'forest',
    name: '雨后森林.jpg',
    storage: 'archive',
    status: '已就绪',
    task: '水印图重处理 · 处理中',
    photo: '/samples/forest.jpg',
  },
  {
    id: 'mountain',
    name: '暖秋山谷.jpg',
    storage: 'archive',
    status: '处理中',
    task: '首次处理 · 处理中',
    photo: '/samples/mountain.jpg',
  },
  {
    id: 'trail',
    name: '林间小路.jpg',
    storage: 'archive',
    status: '已就绪',
    photo: '/samples/forest.jpg',
  },
  {
    id: 'ridge',
    name: '山脊日落.jpg',
    storage: 'archive',
    status: '已就绪',
    photo: '/samples/mountain.jpg',
  },
  {
    id: 'coast',
    name: '清晨海岸.jpg',
    storage: 'archive',
    status: '已回收',
    trashed: true,
    deletion: '清理失败',
    photo: '/samples/mountain.jpg',
  },
  {
    id: 'leaves',
    name: '落叶记录.jpg',
    storage: 'archive',
    status: '已回收',
    trashed: true,
    photo: '/samples/forest.jpg',
  },
  {
    id: 'cloud',
    name: '云端备份照片.jpg',
    storage: 'cloud',
    status: '已就绪',
    photo: '/samples/mountain.jpg',
  },
];
const referenceHref = '/settings/storage/archive?view=references';
const stripHarness = (href: string) => {
  const url = new URL(href, location.origin);
  for (const key of ['frame', 'mode', 'scenario', 'demo'])
    url.searchParams.delete(key);
  return url.pathname + url.search;
};

export function StorageDemo() {
  const { href } = usePrototype();
  const url = new URL(href, location.origin);
  if (url.pathname === '/library' || url.pathname === '/trash')
    return <ObjectList />;
  return <References />;
}

function References() {
  const { mode, scenario, navigate } = usePrototype();
  const after = mode === 'after';
  const [failed, setFailed] = useState(scenario === 'error');
  const [busy, setBusy] = useState(scenario === 'slow');
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setBusy(false), 1400);
    return () => window.clearTimeout(timer);
  }, [busy]);
  const gallery = '/library?storageId=archive';
  const trash = '/trash?storageId=archive';
  const target = (path: string, image?: string) => {
    const url = new URL(path, location.origin);
    if (image) url.searchParams.set('image', image);
    url.searchParams.set('returnTo', referenceHref);
    return url.pathname + url.search;
  };
  return (
    <section className="grid gap-5 pb-10" data-testid="reference-demo">
      <Header title="引用与清理" />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-sm">摄影归档 · 本地存储</span>
        <Chip color="warning" size="sm">
          <Chip.Label>仍有引用</Chip.Label>
        </Chip>
        <Help label="引用">
          <p>
            图片与版本包含图库和回收站。不同分类可能关联同一图片，数量不相加。
          </p>
          <p>处理任务与删除清理对应不同对象；重处理时原图可能仍可用。</p>
        </Help>
      </div>
      {failed ? (
        <Card className={panelClass}>
          <p role="alert">暂时无法读取引用。上次确认的内容仍保留。</p>
          <Button
            className={`${buttonClass} w-fit`}
            variant="outline"
            onPress={() => setFailed(false)}
          >
            重试读取
          </Button>
        </Card>
      ) : null}
      {busy ? (
        <p className="text-sm" role="status">
          正在刷新引用，暂不能操作旧结果。
        </p>
      ) : null}
      <dl aria-busy={busy} className="min-w-0">
        <ReferenceRow
          icon={<Images size={20} />}
          title="图片与版本"
          detail={
            after
              ? '4 张图库图片 · 2 张回收图片 · 12 个版本'
              : '6 张图片 / 12 个版本'
          }
        >
          {after ? (
            <>
              <Destination
                label="查看图库"
                href={target(gallery)}
                disabled={busy || failed}
              />
              <Destination
                label="查看回收记录"
                href={target(trash)}
                disabled={busy || failed}
              />
            </>
          ) : (
            <Destination
              label="查看图片"
              href="/library"
              disabled={busy || failed}
            />
          )}
        </ReferenceRow>
        <ReferenceRow
          icon={<Upload size={20} />}
          title="未结束上传"
          detail="0 个会话"
        />
        <ReferenceRow
          icon={<ListChecks size={20} />}
          title="处理与删除任务"
          detail="处理 2 项 / 删除清理 1 项"
        >
          {after ? (
            <Destination
              label="查看删除清理"
              href={target(trash, 'coast')}
              disabled={busy || failed}
            />
          ) : (
            <Destination
              label="前往回收站"
              href="/trash"
              disabled={busy || failed}
            />
          )}
        </ReferenceRow>
        {after ? (
          <div className="border-b border-border py-2 pl-9">
            <Accordion variant="surface" className="rounded-lg bg-transparent">
              <Accordion.Item id="processing">
                <Accordion.Heading>
                  <Accordion.Trigger className="min-h-11 px-0 text-sm font-normal">
                    查看处理中的图片（2）
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="grid gap-0 px-0 pb-3">
                    {records
                      .filter((item) => item.task)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-3 border-t border-border py-3"
                        >
                          <BatchThumbnail
                            url={item.photo}
                            className="h-10 w-12 rounded-lg"
                          />
                          <div className="grid min-w-0 gap-1">
                            <span className="text-sm wrap-anywhere">
                              {item.name}
                            </span>
                            <span className="text-xs text-muted">
                              {item.task}
                            </span>
                            <span className="text-xs text-muted">
                              图片：{item.status}
                            </span>
                          </div>
                          <Button
                            aria-label={`查看任务图片：${item.name}`}
                            variant="ghost"
                            isIconOnly
                            className="size-11 rounded-lg"
                            isDisabled={busy || failed}
                            onPress={() => navigate(target(gallery, item.id))}
                          >
                            <ArrowRight size={17} />
                          </Button>
                        </div>
                      ))}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </div>
        ) : null}
        <ReferenceRow
          icon={<ScanLine size={20} />}
          title="测试与受管对象"
          detail="0 个探测 / 0 个孤儿 / 18 个对象"
        >
          <Help label="对象说明">
            这些对象由图片与版本引用，需先处理上方相应内容。原型不执行删除或远端扫描。
          </Help>
        </ReferenceRow>
      </dl>
    </section>
  );
}

function ReferenceRow({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 border-b border-border py-5 md:grid-cols-[24px_minmax(0,1fr)_auto] md:items-center">
      <span className="mt-0.5" aria-hidden>
        {icon}
      </span>
      <div className="grid min-w-0 gap-2">
        <dt className="text-sm font-medium">{title}</dt>
        <dd className="text-base tabular-nums">{detail}</dd>
      </div>
      {children ? (
        <dd className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto">
          {children}
        </dd>
      ) : null}
    </div>
  );
}

function Destination({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Link
      href={href}
      isDisabled={disabled}
      className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm no-underline"
    >
      {label}
      <ArrowRight size={16} aria-hidden />
    </Link>
  );
}

function ObjectList() {
  const { href, mode, navigate } = usePrototype();
  const url = new URL(href, location.origin);
  const trash = url.pathname === '/trash';
  const storage = url.searchParams.get('storageId');
  const image = url.searchParams.get('image');
  const returnTo = url.searchParams.get('returnTo');
  const list = records.filter(
    (item) =>
      Boolean(item.trashed) === trash && (!storage || item.storage === storage),
  );
  const selected = list.find((item) => item.id === image);
  function close() {
    const next = new URL(href, location.origin);
    next.searchParams.delete('image');
    navigate(stripHarness(next.href));
  }
  function open(item: ImageRecord) {
    const next = new URL(href, location.origin);
    next.searchParams.set('image', item.id);
    navigate(stripHarness(next.href));
  }
  return (
    <section className="grid gap-5 pb-10" data-testid="storage-object-list">
      <Header
        title={trash ? '回收站' : '图库'}
        back={
          mode === 'after' && returnTo ? () => navigate(returnTo) : undefined
        }
      />
      {storage ? (
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FolderOpen size={16} aria-hidden />
          <span>存储：摄影归档</span>
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {list.map((item) => (
          <Card
            key={item.id}
            className="min-w-0 gap-0 overflow-hidden rounded-2xl border border-border bg-surface p-0 shadow-none"
          >
            <Button
              aria-label={`查看${trash ? '记录' : '图片'}：${item.name}`}
              variant="ghost"
              className="grid h-auto min-w-0 gap-0 rounded-none p-0 text-left font-normal"
              onPress={() => open(item)}
            >
              <BatchThumbnail
                url={item.photo}
                className="h-32 w-full md:h-44"
              />
              <span className="grid min-w-0 gap-2 p-4">
                <span className="text-sm wrap-anywhere">{item.name}</span>
                <span className="text-xs text-muted">
                  {item.storage === 'archive' ? '摄影归档' : '云端备份'} ·{' '}
                  {item.status}
                </span>
                {item.deletion ? (
                  <span className="text-xs text-danger">{item.deletion}</span>
                ) : null}
                {item.task ? (
                  <span className="text-xs text-muted">{item.task}</span>
                ) : null}
              </span>
            </Button>
          </Card>
        ))}
      </div>
      {!list.length ? (
        <p className="py-16 text-center text-sm text-muted">暂无记录</p>
      ) : null}
      <Footer>
        <span className="mr-auto text-sm">
          {list.length} {trash ? '条记录' : '张图片'}
        </span>
      </Footer>
      <Modal
        isOpen={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Modal.Backdrop isDismissable>
          <Modal.Container size="lg" className="p-4">
            <Modal.Dialog
              aria-label={trash ? '回收记录' : '图片详情'}
              className="max-h-[calc(100dvh-32px)] w-full max-w-160 overflow-auto rounded-xl border border-border bg-surface p-6"
            >
              <Modal.Header>
                <Modal.Heading className="text-xl font-medium">
                  {selected?.name}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-4">
                <BatchThumbnail
                  url={selected?.photo ?? null}
                  className="h-64 w-full rounded-xl [&_img]:object-contain"
                />
                <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 text-sm">
                  <dt>存储</dt>
                  <dd>
                    {selected?.storage === 'cloud' ? '云端备份' : '摄影归档'}
                  </dd>
                  <dt>图片状态</dt>
                  <dd>{selected?.status}</dd>
                  {selected?.task ? (
                    <>
                      <dt>当前任务</dt>
                      <dd>{selected.task}</dd>
                    </>
                  ) : null}
                  {selected?.deletion ? (
                    <>
                      <dt>删除清理</dt>
                      <dd className="text-danger">{selected.deletion}</dd>
                    </>
                  ) : null}
                </dl>
                {selected?.id === 'forest' ? (
                  <p className="text-sm text-muted">
                    原图仍可查看，新的水印图正在处理中。
                  </p>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button className={buttonClass} onPress={close}>
                  返回{trash ? '回收记录' : '图库'}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}
