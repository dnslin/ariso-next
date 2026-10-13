import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react';
import { BatchThumbnail } from '../../../src/components/library/batch-targets';
import { PageHeader, buttonClass, cardClass, usePrototype } from './shared';

const pictures = [
  '林间光影.jpg',
  '山间清晨.jpg',
  '溪边散步.jpg',
  '树影与路.jpg',
  '海边日落.jpg',
  '石桥清晨.jpg',
  '旅行日记.jpg',
  '冬季山路.jpg',
].map((name, index) => ({
  id: String(index + 1),
  name,
  image: index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg',
}));

export function PickerDemo() {
  const { mode } = usePrototype();
  const [view, setView] = useState<'detail' | 'list'>('detail');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const filtered = pictures.filter((picture) => picture.name.includes(query));
  const pages = Math.max(1, Math.ceil(filtered.length / 4));
  const visible = filtered.slice((page - 1) * 4, page * 4);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  if (view === 'list')
    return (
      <div className="grid min-w-0 gap-5 pb-8">
        <PageHeader title="相册" />
        <Card className={cardClass}>
          <h2 className="text-lg font-medium">山间旅行</h2>
          <p className="text-sm text-muted">24 张图片 · 最近更新于今天</p>
          <Button
            variant="outline"
            className={`${buttonClass} w-fit`}
            onPress={() => setView('detail')}
          >
            打开山间旅行
          </Button>
        </Card>
      </div>
    );
  return (
    <div className="grid min-w-0 gap-5 pb-8">
      <PageHeader title="山间旅行" back={() => setView('list')} />
      <p className="text-sm text-muted">24 张图片 · 已有图片保持不变</p>
      <Card className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">相册图片</h2>
          <Button
            className={buttonClass}
            onPress={() => {
              setOpen(true);
              setFeedback('');
            }}
          >
            <Plus size={17} aria-hidden />
            从图库添加
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            '封面 · 枫叶小径.jpg',
            '原有图片 · 秋日笔记.jpg',
            ...added.map(
              (id) => pictures.find((picture) => picture.id === id)!.name,
            ),
          ].map((name, index) => (
            <figure
              key={`${name}-${index}`}
              className="min-w-0 overflow-hidden rounded-lg border border-border"
            >
              <BatchThumbnail
                url={
                  index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg'
                }
                className="aspect-[4/3] w-full rounded-lg"
              />
              <figcaption className="truncate p-2 text-sm">{name}</figcaption>
            </figure>
          ))}
        </div>
      </Card>
      {feedback ? (
        <p role="status" className="text-sm text-muted">
          {feedback}
        </p>
      ) : null}
      <Modal isOpen={open} onOpenChange={setOpen}>
        <Modal.Backdrop isDismissable>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog className="mx-0 my-auto flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-200 flex-col gap-0 overflow-hidden rounded-xl border border-border bg-surface p-0">
              <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3 text-left">
                <div className="grid min-w-0 gap-1">
                  <Modal.Heading className="text-lg font-medium">
                    从图库选择
                  </Modal.Heading>
                  <p className="truncate text-sm text-muted">山间旅行</p>
                </div>
                <CloseButton
                  aria-label="关闭选图"
                  className="size-11 shrink-0 rounded-lg bg-transparent"
                  onPress={() => setOpen(false)}
                />
              </Modal.Header>
              <div className="shrink-0 px-5 pt-4">
                <label className="flex h-12 items-center gap-2 rounded-lg border border-border bg-background px-3">
                  <Search size={17} aria-hidden className="text-muted" />
                  <input
                    aria-label="搜索图库图片"
                    placeholder="搜索图片名称"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </label>
              </div>
              <Modal.Body className="m-0 min-h-0 overflow-y-auto px-5 py-4">
                {visible.length ? (
                  <div
                    className="grid grid-cols-2 items-start gap-x-3 gap-y-5 lg:grid-cols-3 xl:grid-cols-4"
                    aria-label="图库选图列表"
                  >
                    {visible.map((picture) => (
                      <Button
                        key={picture.id}
                        variant="ghost"
                        aria-label={`${selected.includes(picture.id) ? '取消选择' : '选择'}图片：${picture.name}`}
                        className="grid h-auto min-w-0 justify-normal gap-2 rounded-lg bg-transparent p-0 text-left font-normal"
                        onPress={() => toggle(picture.id)}
                      >
                        <span
                          className={`relative block aspect-[4/3] w-full overflow-hidden rounded-lg border-2 ${selected.includes(picture.id) ? 'border-accent' : 'border-transparent'}`}
                        >
                          <BatchThumbnail
                            url={picture.image}
                            className="size-full"
                          />
                          {selected.includes(picture.id) ? (
                            <span className="absolute top-2 left-2 rounded-md bg-surface px-2 py-1 text-xs">
                              已选
                            </span>
                          ) : null}
                        </span>
                        <span className="w-full truncate text-sm">
                          {picture.name}
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p
                    role="status"
                    className="py-12 text-center text-sm text-muted"
                  >
                    未找到图片
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer className="m-0 grid shrink-0 grid-cols-1 gap-3 border-t border-border px-5 py-4">
                {pages > 1 ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className={`${buttonClass} flex-1`}
                      isDisabled={page === 1}
                      onPress={() => setPage(page - 1)}
                    >
                      上一页
                    </Button>
                    <span className="text-xs">
                      {page}/{pages}
                    </span>
                    <Button
                      variant="outline"
                      className={`${buttonClass} flex-1`}
                      isDisabled={page === pages}
                      onPress={() => setPage(page + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                ) : null}
                {mode === 'after' && selected.length ? (
                  <div className="rounded-lg border border-border bg-background">
                    <Button
                      variant="ghost"
                      className="min-h-11 w-full justify-between rounded-lg px-3 text-sm font-normal"
                      aria-expanded={expanded}
                      aria-controls="selected-pictures"
                      onPress={() => setExpanded(!expanded)}
                    >
                      已选 {selected.length} 张 · 查看与移除{' '}
                      {expanded ? (
                        <ChevronUp size={16} aria-hidden />
                      ) : (
                        <ChevronDown size={16} aria-hidden />
                      )}
                    </Button>
                    {expanded ? (
                      <ul
                        id="selected-pictures"
                        className="grid max-h-44 gap-1 overflow-y-auto border-t border-border p-2"
                      >
                        {selected.map((id) => {
                          const picture = pictures.find(
                            (item) => item.id === id,
                          )!;
                          return (
                            <li
                              key={id}
                              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
                            >
                              <BatchThumbnail
                                url={picture.image}
                                className="size-10 rounded-md"
                              />
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {picture.name}
                              </span>
                              <Button
                                isIconOnly
                                variant="ghost"
                                className="size-11 shrink-0 rounded-lg"
                                aria-label={`移除已选图片：${picture.name}`}
                                onPress={() => toggle(id)}
                              >
                                <X size={17} aria-hidden />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                  {mode === 'before' ? (
                    <span role="status" className="mr-auto text-sm text-muted">
                      已选 {selected.length} 张
                    </span>
                  ) : null}
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label="清空选图"
                    className="size-11 rounded-lg"
                    isDisabled={!selected.length}
                    onPress={() => setSelected([])}
                  >
                    <X size={17} aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    className={buttonClass}
                    onPress={() => setOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    className={buttonClass}
                    isDisabled={!selected.length}
                    onPress={() => {
                      setAdded((current) => [
                        ...new Set([...current, ...selected]),
                      ]);
                      setFeedback(`已添加 ${selected.length} 张图片`);
                      setSelected([]);
                      setExpanded(false);
                      setOpen(false);
                    }}
                  >
                    添加 {selected.length ? `${selected.length} 张` : ''}
                  </Button>
                </div>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
