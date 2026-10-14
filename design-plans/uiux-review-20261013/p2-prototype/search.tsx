import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Modal } from '@heroui/react/modal';
import { SearchField } from '@heroui/react/search-field';
import { Check, ListChecks, Search, X } from 'lucide-react';
import { BatchThumbnail } from '../../../src/components/library/batch-targets';
import { PageHeader, buttonClass, cardClass, usePrototype } from './shared';

const pictures = [
  '林间光影.jpg',
  '山间清晨.jpg',
  '海边日落.jpg',
  '旅行日记.jpg',
  '石桥清晨.jpg',
  '冬季山路.jpg',
].map((name, index) => ({
  name,
  storage: index % 2 ? '摄影归档' : '本地存储',
  visibility: index % 3 ? '公开' : '私有',
  libraryStatus: index % 4 ? '已就绪' : '处理中',
  trashStatus: index % 4 ? '待清理' : '清理失败',
}));

export function SearchDemo({ kind }: { kind: 'search' | 'trash' }) {
  const { mode } = usePrototype();
  const [list, setList] = useState<'library' | 'trash'>(
    kind === 'trash' ? 'trash' : 'library',
  );
  const [value, setValue] = useState('');
  const [applied, setApplied] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [storage, setStorage] = useState('全部存储');
  const [visibility, setVisibility] = useState('全部');
  const [status, setStatus] = useState('全部状态');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');
  const isTrash = list === 'trash';
  const filtered = pictures.filter(
    (picture) =>
      picture.name.includes(applied) &&
      !removed.includes(picture.name) &&
      (storage === '全部存储' || picture.storage === storage) &&
      (visibility === '全部' || picture.visibility === visibility) &&
      (status === '全部状态' ||
        (isTrash ? picture.trashStatus : picture.libraryStatus) === status),
  );
  const submit = (query: string) => {
    setApplied(query.trim());
    setSelected([]);
    setNotice('');
  };
  const toggle = (name: string) =>
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  const compactMobile = kind === 'trash' && mode === 'after';
  return (
    <div className="grid min-w-0 gap-5 pb-8">
      <PageHeader title={isTrash ? '回收站' : '图库'} />
      {kind === 'search' ? (
        <div className="flex gap-2" role="group" aria-label="搜索页面">
          <Button
            variant={!isTrash ? 'primary' : 'outline'}
            className={buttonClass}
            onPress={() => {
              setList('library');
              setValue('');
              submit('');
              setStatus('全部状态');
              setSelectionMode(false);
            }}
          >
            图库
          </Button>
          <Button
            variant={isTrash ? 'primary' : 'outline'}
            className={buttonClass}
            onPress={() => {
              setList('trash');
              setValue('');
              submit('');
              setStatus('全部状态');
              setSelectionMode(false);
            }}
          >
            回收站
          </Button>
        </div>
      ) : null}
      <p className="text-[13px]">
        {filtered.length} 条{isTrash ? '记录' : '图片'}
      </p>
      <div className="grid min-w-0 gap-3">
        <div
          className={`flex min-w-0 flex-wrap items-center gap-3 ${compactMobile ? 'max-[767px]:flex-nowrap' : ''}`}
          data-testid="search-toolbar"
        >
          <SearchField
            aria-label={isTrash ? '搜索回收图片名称' : '搜索图片名称'}
            value={value}
            onChange={setValue}
            onSubmit={submit}
            onClear={() => submit('')}
            className={`${mode === 'after' ? 'min-w-0 flex-1' : 'w-full min-w-0 sm:w-70'} ${kind === 'search' ? 'sm:max-w-sm' : ''}`}
          >
            <SearchField.Group className="h-12 min-w-0 rounded-lg border border-border bg-background shadow-none">
              {mode === 'before' ? (
                <SearchField.SearchIcon className="text-muted">
                  <Search size={17} aria-hidden />
                </SearchField.SearchIcon>
              ) : (
                <Button
                  isIconOnly
                  type="button"
                  slot={null}
                  variant="ghost"
                  aria-label={isTrash ? '搜索回收图片' : '搜索图库图片'}
                  className="size-11 shrink-0 rounded-lg text-muted"
                  onPress={() => submit(value)}
                >
                  <Search size={17} aria-hidden />
                </Button>
              )}
              <SearchField.Input
                placeholder={isTrash ? '搜索文件名称' : '搜索图片名称…'}
                enterKeyHint="search"
                className="h-12 min-w-0 text-base sm:text-sm"
              />
              {value ? (
                <SearchField.ClearButton
                  aria-label="清除搜索"
                  className="size-11 shrink-0"
                />
              ) : null}
            </SearchField.Group>
          </SearchField>
          {isTrash && !selected.length ? (
            <Button
              isIconOnly
              variant="outline"
              aria-label={selectionMode ? '取消选择' : '选择记录'}
              className="size-11 shrink-0 rounded-lg"
              onPress={() => setSelectionMode((current) => !current)}
            >
              <ListChecks size={18} aria-hidden />
            </Button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-muted">
            存储
            <select
              aria-label="存储筛选"
              value={storage}
              onChange={(event) => {
                setStorage(event.target.value);
                setSelected([]);
              }}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option>全部存储</option>
              <option>本地存储</option>
              <option>摄影归档</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            可见性
            <select
              aria-label="可见性筛选"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value);
                setSelected([]);
              }}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option>全部</option>
              <option>公开</option>
              <option>私有</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            状态
            <select
              aria-label="状态筛选"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setSelected([]);
              }}
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option>全部状态</option>
              {isTrash ? (
                <>
                  <option>待清理</option>
                  <option>清理失败</option>
                </>
              ) : (
                <>
                  <option>已就绪</option>
                  <option>处理中</option>
                </>
              )}
            </select>
          </label>
        </div>
        {isTrash && selectionMode && !selected.length ? (
          <Button
            variant="ghost"
            className={`${buttonClass} w-fit`}
            onPress={() => setSelected(filtered.map((picture) => picture.name))}
          >
            全选当前页
          </Button>
        ) : null}
        {selected.length ? (
          <div
            className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 text-sm"
            role="status"
          >
            <span className="px-2">已选 {selected.length} 条</span>
            <Button
              variant="outline"
              className={buttonClass}
              onPress={() => {
                setRemoved((current) => [
                  ...new Set([...current, ...selected]),
                ]);
                setNotice(`已恢复 ${selected.length} 条记录（原型模拟）。`);
                setSelected([]);
                setSelectionMode(false);
              }}
            >
              恢复
            </Button>
            <Button
              variant="outline"
              className={buttonClass}
              onPress={() => setConfirmDelete(true)}
            >
              永久删除
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="清除选择"
              className="size-11 rounded-lg"
              onPress={() => setSelected([])}
            >
              <X size={17} aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      ) : null}
      {filtered.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((picture, index) => (
            <Card key={picture.name} className={`${cardClass} gap-2`}>
              <div className="flex items-start gap-3">
                <BatchThumbnail
                  url={
                    index % 2 ? '/samples/mountain.jpg' : '/samples/forest.jpg'
                  }
                  className="size-16 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-medium">
                    {picture.name}
                  </h2>
                  <p className="text-xs text-muted">
                    {isTrash ? picture.trashStatus : picture.libraryStatus} ·{' '}
                    {picture.storage}
                  </p>
                </div>
                {isTrash && selectionMode ? (
                  <Button
                    isIconOnly
                    variant="outline"
                    className="size-11 shrink-0 rounded-lg"
                    aria-label={`${selected.includes(picture.name) ? '取消选择' : '选择'}记录：${picture.name}`}
                    onPress={() => toggle(picture.name)}
                  >
                    {selected.includes(picture.name) ? (
                      <Check size={17} aria-hidden />
                    ) : (
                      <span className="size-4 rounded border border-border" />
                    )}
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className={cardClass}>
          <p role="status" className="py-8 text-center text-sm text-muted">
            未找到匹配内容。可清除搜索查看全部。
          </p>
        </Card>
      )}
      <Modal isOpen={confirmDelete} onOpenChange={setConfirmDelete}>
        <Modal.Backdrop>
          <Modal.Container placement="center" className="p-4">
            <Modal.Dialog className="w-full max-w-md rounded-xl border border-border bg-surface p-5">
              <Modal.Header>
                <Modal.Heading className="text-lg font-medium">
                  永久删除 {selected.length} 条记录？
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="text-sm leading-6">
                永久删除后无法恢复。原型只会移除当前样例记录。
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  className={buttonClass}
                  onPress={() => setConfirmDelete(false)}
                >
                  取消
                </Button>
                <Button
                  className={buttonClass}
                  onPress={() => {
                    setRemoved((current) => [
                      ...new Set([...current, ...selected]),
                    ]);
                    setNotice(`已永久删除 ${selected.length} 条样例记录。`);
                    setSelected([]);
                    setSelectionMode(false);
                    setConfirmDelete(false);
                  }}
                >
                  确认永久删除
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
