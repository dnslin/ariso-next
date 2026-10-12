/* eslint-disable @next/next/no-img-element -- Standalone prototype serves existing local sample images. */
import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { Dropdown } from '@heroui/react/dropdown';
import { toast } from '@heroui/react/toast';
import {
  Eye,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  ActionIconButton,
  Dialog,
  Footer,
  Header,
  Help,
  SearchInput,
  SelectField,
  VisibilityBadge,
  buttonClass,
  groupClass,
  useApp,
} from './ui';
export function TrashPage() {
  const { scenario } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(false);
  const [exists, setExists] = useState(scenario !== 'empty');
  const [storage, setStorage] = useState('all');
  const [status, setStatus] = useState('all');
  const [deletion, setDeletion] = useState('all');
  const [dialog, setDialog] = useState<'view' | 'delete' | 'progress' | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const visible =
    exists &&
    '界面预览验证'.includes(query.trim()) &&
    deletion !== 'deleting' &&
    deletion !== 'failed';
  async function action(remove: boolean) {
    if (pending) return;
    setMenuOpen(false);
    setPending(true);
    setError('');
    await new Promise((resolve) =>
      setTimeout(resolve, scenario === 'slow' ? 1500 : 350),
    );
    if (scenario === 'error' && !failed) {
      setPending(false);
      setFailed(true);
      setError('操作失败，记录已保留。请重试。');
      return;
    }
    if (remove) {
      setDialog('progress');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    setPending(false);
    setExists(false);
    setSelected(false);
    setDialog(null);
    toast(remove ? '已永久删除 1 张' : '已恢复 1 张');
  }
  return (
    <section className="grid min-w-0 gap-5 pb-6" data-testid="clarity-trash">
      <Header
        title="回收站"
        help={
          <Help label="回收站">
            恢复后可重新使用图片。永久删除无法撤销；回收文件仍占空间。
          </Help>
        }
      >
        <ActionIconButton
          label="刷新回收站"
          variant="ghost"
          className="border border-border"
          onPress={() => toast('已刷新')}
        >
          <RefreshCw size={18} />
        </ActionIconButton>
      </Header>
      <p className="text-sm text-muted">{exists ? 1 : 0} 条记录</p>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchInput
            label="搜索文件"
            placeholder="搜索文件…"
            value={query}
            onChange={setQuery}
          />
        </div>
        <ButtonGroup
          className={`${groupClass} border border-border`}
          variant="ghost"
        >
          <ActionIconButton
            label={selected ? '取消选择' : '选择记录'}
            variant="ghost"
            isDisabled={!visible}
            onPress={() => setSelected(!selected)}
          >
            <ListChecks size={18} />
          </ActionIconButton>
          {selected ? (
            <>
              <ActionIconButton
                label="恢复"
                variant="ghost"
                isDisabled={pending}
                onPress={() => void action(false)}
              >
                <ButtonGroup.Separator />
                <RotateCcw size={18} />
              </ActionIconButton>
              <ActionIconButton
                label="永久删除"
                variant="ghost"
                className="text-danger"
                isDisabled={pending}
                onPress={() => setDialog('delete')}
              >
                <ButtonGroup.Separator />
                <Trash2 size={18} />
              </ActionIconButton>
            </>
          ) : null}
        </ButtonGroup>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField
          label="存储"
          value={storage}
          onChange={setStorage}
          options={[
            ['all', '全部存储'],
            ['local', '默认本地存储'],
          ].map(([id, label]) => ({ id, label }))}
        />
        <SelectField
          label="处理状态"
          value={status}
          onChange={setStatus}
          options={[
            ['all', '全部状态'],
            ['ready', '已就绪'],
          ].map(([id, label]) => ({ id, label }))}
        />
        <SelectField
          label="删除状态"
          value={deletion}
          onChange={setDeletion}
          options={[
            ['all', '全部状态'],
            ['none', '未删除'],
            ['deleting', '删除中'],
            ['failed', '清理失败'],
          ].map(([id, label]) => ({ id, label }))}
        />
      </div>
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 text-sm text-danger"
        >
          <span>{error}</span>
          <Button
            variant="outline"
            className={buttonClass}
            onPress={() => void action(dialog === 'delete')}
          >
            重试
          </Button>
        </div>
      ) : null}
      {visible ? (
        <article
          data-testid="trash-row"
          data-selected={selected}
          className="trash-review-row flex min-w-0 items-center gap-2 rounded-lg border border-border p-3"
        >
          <Button
            variant="ghost"
            data-testid="trash-row-open"
            className="trash-review-open grid h-auto min-h-24 min-w-0 flex-1 grid-cols-[64px_minmax(0,1fr)] justify-items-start gap-3 rounded-lg px-2 py-2 text-left font-normal whitespace-normal md:min-h-20 md:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
            onPress={() => setDialog('view')}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'F10' && event.shiftKey) {
                event.preventDefault();
                setMenuOpen(true);
              }
            }}
          >
            <img
              src="/samples/mountain.jpg"
              alt="界面预览验证"
              className="size-16 rounded-md object-cover"
            />
            <span className="grid min-w-0 gap-2 text-sm">
              <span className="wrap-anywhere">界面预览验证</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted md:hidden">
                <VisibilityBadge value="private" />
                6.5 KiB · 默认本地存储<span>已回收 · 已就绪</span>
              </span>
            </span>
            <span className="hidden text-xs text-muted md:block">
              6.5 KiB · 默认本地存储 · 私有
            </span>
            <span className="hidden text-xs text-muted md:block">
              已回收 · 已就绪
              <br />
              2026/10/11 15:51
            </span>
          </Button>
          <Dropdown isOpen={menuOpen} onOpenChange={setMenuOpen}>
            <ActionIconButton label="图片操作" variant="ghost">
              <MoreHorizontal size={18} />
            </ActionIconButton>
            <Dropdown.Popover className="rounded-lg border border-border bg-surface p-1.5 shadow-lg">
              <Dropdown.Menu
                aria-label="图片操作"
                onAction={(key) => {
                  setMenuOpen(false);
                  if (key === 'view') setDialog('view');
                  else if (key === 'restore') void action(false);
                  else setDialog('delete');
                }}
              >
                <Dropdown.Item
                  id="view"
                  textValue="查看"
                  className="min-h-11 gap-3 rounded-md px-3"
                >
                  <Eye size={18} />
                  查看
                </Dropdown.Item>
                <Dropdown.Item
                  id="restore"
                  textValue="恢复"
                  isDisabled={pending}
                  className="min-h-11 gap-3 rounded-md px-3"
                >
                  <RotateCcw size={18} />
                  恢复
                </Dropdown.Item>
                <Dropdown.Item
                  id="delete"
                  textValue="永久删除"
                  isDisabled={pending}
                  className="min-h-11 gap-3 rounded-md px-3 text-danger"
                >
                  <Trash2 size={18} />
                  永久删除
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </article>
      ) : (
        <div className="grid min-h-60 place-content-center justify-items-center gap-3 text-muted">
          <Trash2 size={32} />
          <p>{exists ? '没有匹配的记录' : '回收站为空'}</p>
        </div>
      )}
      <Footer>
        <span className="mr-auto text-sm text-muted">
          {visible ? 1 : 0} 项{selected ? ' · 已选 1 项' : ''}
        </span>
      </Footer>
      {dialog ? (
        <Dialog
          title={
            dialog === 'view'
              ? '界面预览验证'
              : dialog === 'delete'
                ? '永久删除这张图片？'
                : '正在清理'
          }
          onClose={() => {
            if (!pending) setDialog(null);
          }}
          footer={
            dialog === 'delete' ? (
              <>
                <Button
                  variant="outline"
                  className={buttonClass}
                  isDisabled={pending}
                  onPress={() => setDialog(null)}
                >
                  取消
                </Button>
                <Button
                  variant="danger"
                  className={buttonClass}
                  isPending={pending}
                  onPress={() => void action(true)}
                >
                  永久删除
                </Button>
              </>
            ) : null
          }
        >
          {dialog === 'view' ? (
            <img
              src="/samples/mountain.jpg"
              alt="界面预览验证"
              className="max-h-[55dvh] w-full rounded-lg object-contain"
            />
          ) : dialog === 'delete' ? (
            <p className="text-sm leading-6">
              原图和已有版本将被清理，无法恢复。
            </p>
          ) : (
            <p role="status" className="text-sm leading-6">
              删除已受理，正在清理原图和已有版本。
            </p>
          )}
        </Dialog>
      ) : null}
    </section>
  );
}
