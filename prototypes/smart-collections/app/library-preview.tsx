'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Header,
  Label,
  Modal,
  Popover,
  Separator,
  Skeleton,
  TextField,
  toast,
} from '@heroui/react';
import {
  ArrowDownWideNarrow,
  Bookmark,
  Check,
  ChevronDown,
  Grid2X2,
  Images,
  LayoutList,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { LibraryCard } from '../../../src/app/library/library-card';
import { PrototypeFrame } from './frame';
import { useDemo } from './providers';
import {
  emptyRules,
  initialCollections,
  matchingImages,
  toLibraryItem,
  type FilterRules,
} from './data';
import { RuleControls } from './rule-controls';
import { CollectionDialog } from './collection-dialog';
import { ImageDetail } from './image-detail';

export function LibraryPreview({
  collectionId,
  trash = false,
}: {
  collectionId?: string;
  trash?: boolean;
}) {
  const {
    images,
    setImages,
    collections,
    setCollections,
    scenario,
    setScenario,
  } = useDemo();
  const collection = collections.find((item) => item.id === collectionId);
  const [rules, setRules] = useState<FilterRules>(
    collection?.rules ?? emptyRules,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [layout, setLayout] = useState<'grid' | 'waterfall'>('grid');
  const [dialog, setDialog] = useState<'save' | 'rename' | 'delete' | null>(
    null,
  );
  const [saveFailure, setSaveFailure] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const dirty =
    !!collection && JSON.stringify(rules) !== JSON.stringify(collection.rules);
  const missingTag = scenario === 'stale-tag' && rules.tag === 'screenshot';
  const visible =
    scenario === 'empty' || missingTag
      ? []
      : trash
        ? images.filter((item) => item.trashed)
        : matchingImages(images, rules);
  const visibleSelection = selected.filter((id) =>
    visible.some((image) => image.id === id),
  );
  const name = trash ? '回收站' : (collection?.name ?? '全部图片');
  const filterCount =
    Number(rules.tag !== 'all') +
    Number(rules.recentDays !== null) +
    Number(rules.minMB !== null) +
    Number(!!rules.name);

  useEffect(() => {
    if (!dirty) return;
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.origin !== location.origin ||
        link.hash
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(link.pathname);
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, [dirty]);

  function navigate(href: string) {
    if (dirty) setPendingHref(href);
    else router.push(href);
  }
  function updateRules(value: FilterRules) {
    setRules(value);
    setSelected([]);
  }
  function openDialog(mode: 'save' | 'rename' | 'delete') {
    setSaveFailure(false);
    setDialog(mode);
  }
  function submitCollection(nextName: string) {
    if (scenario === 'save-error' && dialog !== 'delete') {
      setSaveFailure(true);
      setScenario('normal');
      return;
    }
    if (dialog === 'delete') {
      setCollections((current) =>
        current.filter((item) => item.id !== collectionId),
      );
      setDialog(null);
      toast.success('集合已删除，图片已保留');
      router.push('/library');
      return;
    }
    if (dialog === 'rename' && collection) {
      setCollections((current) =>
        current.map((item) =>
          item.id === collection.id ? { ...item, name: nextName } : item,
        ),
      );
      setDialog(null);
      toast.success('集合已重命名');
      return;
    }
    const id = `collection-${crypto.randomUUID()}`;
    setCollections((current) => [
      ...current,
      { id, name: nextName, rules: { ...rules } },
    ]);
    setDialog(null);
    toast.success('智能集合已保存');
    router.push(`/library/collections/${id}`);
  }
  function saveChanges() {
    if (scenario === 'save-error') {
      setSaveFailure(true);
      setScenario('normal');
      return;
    }
    setCollections((current) =>
      current.map((item) =>
        item.id === collectionId ? { ...item, rules: { ...rules } } : item,
      ),
    );
    setSaveFailure(false);
    toast.success('集合条件已更新');
  }
  function closeDetail() {
    setDetailId(null);
    requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus();
      else document.getElementById('library-title')?.focus();
    });
  }
  function batchTag() {
    const ids = [...visibleSelection];
    setImages((current) =>
      current.map((item) =>
        ids.includes(item.id)
          ? { ...item, tags: [...new Set([...item.tags, '截图'])] }
          : item,
      ),
    );
    setSelected([]);
    toast.success(`已为 ${ids.length} 张图片添加“截图”标签`);
  }
  const footer = detailId ? null : (
    <div className="flex w-full items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        共 {visible.length} 张
        {visibleSelection.length > 0
          ? ` · 已选 ${visibleSelection.length} 张`
          : ''}
      </span>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted sm:block">每页 40 张</span>
        <span className="rounded-lg border border-border px-4 py-2">1 / 1</span>
      </div>
    </div>
  );

  if (collectionId && !collection) {
    return (
      <PrototypeFrame>
        <section className="grid justify-items-start gap-5">
          <h1>集合已删除或不存在</h1>
          <p className="text-sm text-muted">
            这个地址已无法打开原来的筛选条件。
          </p>
          <Button className="min-h-11" onPress={() => router.push('/library')}>
            返回图库
          </Button>
        </section>
      </PrototypeFrame>
    );
  }

  return (
    <PrototypeFrame footer={footer}>
      {detailId ? (
        <ImageDetail imageId={detailId} onClose={closeDetail} />
      ) : (
        <section
          className="grid min-w-0 gap-5 md:gap-6"
          aria-labelledby="library-title"
        >
          <div className="flex items-center justify-between gap-4">
            <h1 id="library-title" tabIndex={-1}>
              {trash ? '回收站' : '图库'}
            </h1>
            {!trash && (
              <Popover>
                <Button
                  variant="ghost"
                  isIconOnly
                  className="size-11"
                  aria-label="智能集合说明"
                >
                  <Bookmark size={18} />
                </Button>
                <Popover.Content className="max-w-72">
                  <Popover.Dialog>
                    <Popover.Heading>智能集合</Popover.Heading>
                    <p className="mt-2 text-sm text-muted">
                      保存筛选条件，下次直接打开。符合条件的图片会自动显示在集合中。
                    </p>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            )}
          </div>
          {!trash && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Dropdown>
                  <Button
                    variant="secondary"
                    className="min-h-12 min-w-0 max-w-full justify-between gap-3 px-4"
                    aria-label={`切换集合：${name}`}
                  >
                    <Bookmark size={17} className="shrink-0" />
                    <span className="truncate">{name}</span>
                    <ChevronDown size={16} className="shrink-0" />
                  </Button>
                  <Dropdown.Popover className="w-[min(340px,calc(100vw-32px))]">
                    <Dropdown.Menu
                      aria-label="智能集合"
                      onAction={(key) => {
                        if (key === 'all') navigate('/library');
                        else if (String(key).startsWith('template-')) {
                          const template = initialCollections.find(
                            (item) => `template-${item.id}` === key,
                          );
                          if (template) updateRules({ ...template.rules });
                        } else navigate(`/library/collections/${key}`);
                      }}
                    >
                      <Dropdown.Item id="all" textValue="全部图片">
                        <Images size={16} />
                        <Label>全部图片</Label>
                      </Dropdown.Item>
                      <Separator />
                      <Dropdown.Section>
                        <Header className="px-3 py-2 text-xs text-muted">
                          已保存的集合
                        </Header>
                        {collections.map((item) => (
                          <Dropdown.Item
                            key={item.id}
                            id={item.id}
                            textValue={item.name}
                          >
                            <Bookmark size={16} />
                            <Label>{item.name}</Label>
                            {collectionId === item.id && (
                              <Check size={15} className="ml-auto" />
                            )}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Section>
                      <Separator />
                      <Dropdown.Section>
                        <Header className="px-3 py-2 text-xs text-muted">
                          从条件模板开始
                        </Header>
                        {initialCollections.map((item) => (
                          <Dropdown.Item
                            id={`template-${item.id}`}
                            key={`template-${item.id}`}
                            textValue={`模板：${item.name}`}
                          >
                            <Label>{item.name}</Label>
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Section>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
                {collection && (
                  <Dropdown>
                    <Button
                      variant="ghost"
                      isIconOnly
                      className="size-11"
                      aria-label="集合操作"
                    >
                      <MoreHorizontal size={20} />
                    </Button>
                    <Dropdown.Popover>
                      <Dropdown.Menu
                        aria-label="集合操作"
                        onAction={(key) =>
                          openDialog(key === 'rename' ? 'rename' : 'delete')
                        }
                      >
                        <Dropdown.Item id="rename" textValue="重命名">
                          <Pencil size={16} />
                          <Label>重命名</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                          id="delete"
                          textValue="删除集合"
                          variant="danger"
                        >
                          <Trash2 size={16} />
                          <Label>删除集合</Label>
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    isIconOnly
                    variant={layout === 'grid' ? 'secondary' : 'ghost'}
                    className="size-11"
                    aria-label="网格布局"
                    aria-pressed={layout === 'grid'}
                    onPress={() => setLayout('grid')}
                  >
                    <Grid2X2 size={18} />
                  </Button>
                  <Button
                    isIconOnly
                    variant={layout === 'waterfall' ? 'secondary' : 'ghost'}
                    className="size-11"
                    aria-label="瀑布流布局"
                    aria-pressed={layout === 'waterfall'}
                    onPress={() => setLayout('waterfall')}
                  >
                    <LayoutList size={18} />
                  </Button>
                  <Button
                    isIconOnly
                    variant="ghost"
                    className="relative size-11"
                    aria-label="刷新结果"
                    onPress={() => {
                      if (scenario === 'loading') setScenario('normal');
                      if (rules.recentDays !== null) setSelected([]);
                      toast.success('已更新匹配结果');
                    }}
                  >
                    <RefreshCw size={17} />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TextField
                  aria-label="搜索图片名称"
                  value={rules.name}
                  onChange={(name) => updateRules({ ...rules, name })}
                  className="relative min-w-0 flex-1 basis-44"
                >
                  <Search
                    aria-hidden
                    size={17}
                    className="pointer-events-none absolute top-3.5 left-3 z-10"
                  />
                  <Input className="h-11 pl-10" placeholder="搜索图片名称" />
                </TextField>
                <Dropdown>
                  <Button
                    variant="secondary"
                    className="min-h-11 gap-2"
                    aria-label="排序方式"
                  >
                    <ArrowDownWideNarrow size={16} />
                    {rules.sort === 'recent' ? '最新上传' : '原图从大到小'}
                    <ChevronDown size={14} />
                  </Button>
                  <Dropdown.Popover>
                    <Dropdown.Menu
                      aria-label="排序方式"
                      onAction={(key) =>
                        updateRules({
                          ...rules,
                          sort: key === 'size' ? 'size' : 'recent',
                        })
                      }
                    >
                      <Dropdown.Item id="recent" textValue="最新上传">
                        最新上传
                      </Dropdown.Item>
                      <Dropdown.Item id="size" textValue="原图从大到小">
                        原图从大到小
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <RuleControls rules={rules} onChange={updateRules} />
                <div className="flex flex-wrap items-center gap-2">
                  {dirty && (
                    <>
                      <span className="text-xs text-muted">未保存更改</span>
                      <Button className="min-h-11" onPress={saveChanges}>
                        保存更改
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-11"
                        onPress={() => openDialog('save')}
                      >
                        另存为
                      </Button>
                    </>
                  )}
                  {!dirty && filterCount > 0 && !collection && (
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      onPress={() => openDialog('save')}
                    >
                      <Bookmark size={16} />
                      保存为智能集合
                    </Button>
                  )}
                </div>
              </div>
              {saveFailure && !dialog && (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>保存失败，修改已保留</Alert.Title>
                    <Alert.Description>请重新保存集合条件。</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              {visibleSelection.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-default/60 px-3 py-2">
                  <span className="text-sm">
                    已选 {visibleSelection.length} 张
                  </span>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onPress={batchTag}
                  >
                    <Tags size={16} />
                    添加“截图”标签
                  </Button>
                  <Button
                    variant="ghost"
                    isIconOnly
                    className="ml-auto size-11"
                    aria-label="取消选择"
                    onPress={() => setSelected([])}
                  >
                    <X size={16} />
                  </Button>
                </div>
              )}
            </>
          )}
          {missingTag ? (
            <div className="grid justify-items-center gap-4 rounded-2xl border border-border px-6 py-14 text-center">
              <Tags size={28} />
              <h2 className="text-base font-medium">“截图”标签已被删除</h2>
              <p className="max-w-sm text-sm text-muted">
                集合保留了原条件。移除失效条件后，可以重新选择标签。
              </p>
              <Button
                variant="secondary"
                className="min-h-11"
                onPress={() => {
                  updateRules({ ...rules, tag: 'all' });
                }}
              >
                移除失效条件
              </Button>
            </div>
          ) : scenario === 'loading' ? (
            <div
              className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
              aria-busy="true"
              aria-label="正在加载图片"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-60 rounded-2xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="grid min-h-72 content-center justify-items-center gap-3 text-center">
              <Images size={32} className="text-muted" />
              <h2 className="text-base">
                {trash ? '回收站为空' : '没有符合条件的图片'}
              </h2>
              {!trash && (
                <p className="text-sm text-muted">
                  可以调整上方条件，或稍后再来查看。
                </p>
              )}
            </div>
          ) : (
            <div
              className={
                layout === 'waterfall'
                  ? 'columns-2 gap-3 sm:gap-4 md:columns-3 min-[1440px]:columns-4 [&_[data-testid=library-card]]:h-auto [&_[data-testid=library-card]>div:first-of-type]:h-auto [&_img]:h-auto [&_img]:object-contain'
                  : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 min-[1440px]:grid-cols-4'
              }
              aria-label="图片列表"
            >
              {visible.map((image) => (
                <div
                  key={image.id}
                  className={
                    layout === 'waterfall' ? 'mb-4 break-inside-avoid' : ''
                  }
                >
                  <LibraryCard
                    item={toLibraryItem(image)}
                    readRevision={0}
                    isSelected={visibleSelection.includes(image.id)}
                    onToggle={
                      trash
                        ? undefined
                        : () =>
                            setSelected((current) =>
                              current.includes(image.id)
                                ? current.filter((id) => id !== image.id)
                                : [...current, image.id],
                            )
                    }
                    onOpen={(_id, element) => {
                      detailTrigger.current = element;
                      setDetailId(image.id);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {dialog && (
        <CollectionDialog
          key={`${dialog}-${collectionId}`}
          mode={dialog}
          initialName={dialog === 'save' ? '' : name}
          rules={rules}
          failure={saveFailure}
          onSubmit={submitCollection}
          onClose={() => {
            setDialog(null);
            setSaveFailure(false);
          }}
        />
      )}
      <Modal.Backdrop
        isOpen={!!pendingHref}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <Modal.Container size="sm" placement="center">
          <Modal.Dialog
            aria-label="放弃未保存的条件"
            className="max-w-[calc(100vw-32px)] rounded-2xl p-6"
          >
            <Modal.Header>
              <Modal.Heading>条件尚未保存</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm">
                离开后会放弃本次条件修改，已保存的集合不会改变。
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                className="min-h-12"
                onPress={() => setPendingHref(null)}
              >
                继续编辑
              </Button>
              <Button
                className="min-h-12"
                onPress={() => {
                  const href = pendingHref;
                  setPendingHref(null);
                  setRules(collection?.rules ?? emptyRules);
                  setSelected([]);
                  setSaveFailure(false);
                  if (href) router.push(href);
                }}
              >
                放弃并离开
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </PrototypeFrame>
  );
}
