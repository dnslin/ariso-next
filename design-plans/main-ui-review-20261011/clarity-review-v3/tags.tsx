import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { toast } from '@heroui/react/toast';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { tagNameSchema } from '../../../src/server/collections/validation';
import {
  ActionIconButton,
  Dialog,
  Footer,
  Header,
  Help,
  SearchInput,
  buttonClass,
  groupClass,
  useApp,
} from './ui';

type Item = { id: number; name: string; count: number };
export function TagsPage() {
  const { scenario } = useApp();
  const [items, setItems] = useState<Item[]>(
    scenario === 'empty'
      ? []
      : [
          { id: 1, name: 'fellow', count: 4 },
          { id: 2, name: '旅行', count: 12 },
          { id: 3, name: '建筑', count: 8 },
        ],
  );
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<{
    kind: 'create' | 'edit' | 'delete';
    item?: Item;
  } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const attempts = useRef(0);
  const filtered = items.filter((item) =>
    item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  function open(kind: 'create' | 'edit' | 'delete', item?: Item) {
    setAction({ kind, item });
    setName(item?.name ?? '');
    setError('');
    attempts.current = 0;
  }
  function close() {
    if (!busy) setAction(null);
  }
  async function save() {
    if (!action || busy) return;
    const parsed = tagNameSchema.safeParse(name);
    if (action.kind !== 'delete') {
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      if (
        items.some(
          (item) =>
            item.id !== action.item?.id &&
            tagNameSchema.parse(item.name).normalizedKey ===
              parsed.data.normalizedKey,
        )
      ) {
        setError('已有同名标签，请换一个名称。');
        return;
      }
    }
    setBusy(true);
    setError('');
    await new Promise((resolve) =>
      setTimeout(resolve, scenario === 'slow' ? 1500 : 350),
    );
    if (scenario === 'error' && attempts.current++ === 0) {
      setBusy(false);
      setError('保存失败，输入已保留。请重试。');
      return;
    }
    if (action.kind === 'delete')
      setItems(items.filter((item) => item.id !== action.item!.id));
    else if (parsed.success)
      setItems(
        action.kind === 'create'
          ? [
              ...items,
              { id: Date.now(), name: parsed.data.displayName, count: 0 },
            ]
          : items.map((item) =>
              item.id === action.item!.id
                ? { ...item, name: parsed.data.displayName }
                : item,
            ),
      );
    setBusy(false);
    setAction(null);
    toast(
      action.kind === 'delete'
        ? '标签已删除，图片保留'
        : action.kind === 'create'
          ? '标签已创建'
          : '已保存',
    );
  }
  return (
    <section className="grid min-w-0 gap-6 pb-6" data-testid="clarity-tags">
      <Header
        title="标签"
        help={<Help label="标签">标签名称不可重复。删除标签不删除图片。</Help>}
      >
        <Button className={buttonClass} onPress={() => open('create')}>
          <Plus size={18} aria-hidden />
          新建标签
        </Button>
      </Header>
      <SearchInput
        label="搜索标签"
        placeholder="搜索标签…"
        value={query}
        onChange={setQuery}
      />
      <div className="min-w-0">
        <div className="hidden min-h-11 grid-cols-[minmax(0,1fr)_120px_140px_100px] items-center gap-4 border-b border-border px-3 text-xs text-muted md:grid">
          <span>名称</span>
          <span>图片</span>
          <span>创建日期</span>
          <span className="text-right">操作</span>
        </div>
        <ul aria-label="标签列表" className="divide-y divide-border">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-1 py-4 md:grid-cols-[minmax(0,1fr)_120px_140px_100px] md:px-3"
            >
              <span className="min-w-0 font-medium wrap-anywhere">
                {item.name}
              </span>
              <span className="col-start-1 text-xs text-muted md:col-auto md:text-sm">
                {item.count} 张
                <span className="ml-3 md:hidden">2026/10/11</span>
              </span>
              <span className="hidden text-sm text-muted md:block">
                2026/10/11
              </span>
              <ButtonGroup
                aria-label={`${item.name}操作`}
                variant="ghost"
                className={`${groupClass} col-start-2 row-span-2 row-start-1 justify-self-end border border-border md:col-auto md:row-auto`}
              >
                <ActionIconButton
                  label={`编辑标签：${item.name}`}
                  variant="ghost"
                  onPress={() => open('edit', item)}
                >
                  <Pencil size={18} aria-hidden />
                </ActionIconButton>
                <ActionIconButton
                  label={`删除标签：${item.name}`}
                  variant="ghost"
                  className="text-danger"
                  onPress={() => open('delete', item)}
                >
                  <ButtonGroup.Separator />
                  <Trash2 size={18} aria-hidden />
                </ActionIconButton>
              </ButtonGroup>
            </li>
          ))}
        </ul>
        {!filtered.length ? (
          <div className="grid min-h-60 place-content-center justify-items-center gap-3 text-muted">
            <Tag size={32} aria-hidden />
            <p>{query ? '没有匹配的标签' : '暂无标签'}</p>
            {query ? (
              <Button
                variant="ghost"
                className={buttonClass}
                onPress={() => setQuery('')}
              >
                清除搜索
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <Footer>
        <span className="mr-auto text-sm text-muted">{filtered.length} 项</span>
      </Footer>
      {action ? (
        <Dialog
          title={
            action.kind === 'create'
              ? '新建标签'
              : action.kind === 'edit'
                ? '编辑标签'
                : `删除「${action.item!.name}」？`
          }
          onClose={close}
          footer={
            <>
              <Button
                variant="outline"
                className={buttonClass}
                isDisabled={busy}
                onPress={close}
              >
                取消
              </Button>
              <Button
                className={buttonClass}
                variant={action.kind === 'delete' ? 'danger' : 'primary'}
                isPending={busy}
                onPress={() => void save()}
              >
                {action.kind === 'delete'
                  ? '删除'
                  : action.kind === 'create'
                    ? '创建'
                    : '保存'}
              </Button>
            </>
          }
        >
          {action.kind === 'delete' ? (
            <p className="text-sm leading-6">
              将移除 {action.item!.count} 张图片的标签关联。图片不会删除。
            </p>
          ) : (
            <TextField
              value={name}
              onChange={setName}
              isDisabled={busy}
              isInvalid={!!error}
              validationBehavior="aria"
              className="grid gap-2"
              autoFocus
            >
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">名称</Label>
                <Help label="标签名称">
                  1–50 个字符，不能重名。改名保留原有图片关联，不合并标签。
                </Help>
              </div>
              <InputGroup className="h-12 rounded-lg border border-border bg-background shadow-none">
                <InputGroup.Prefix>
                  <Tag size={16} aria-hidden />
                </InputGroup.Prefix>
                <InputGroup.Input placeholder="标签名称" className="text-sm" />
              </InputGroup>
              <FieldError>{error}</FieldError>
            </TextField>
          )}
          {action.kind === 'delete' && error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </section>
  );
}
