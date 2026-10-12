import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { CloseButton } from '@heroui/react/close-button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
/* eslint-disable @next/next/no-img-element -- This standalone prototype has no Next.js image server. */
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  FolderOpen,
  ImageIcon,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  EmptyState,
  Footer,
  Help,
  PageHeader,
  SearchInput,
  SelectField,
  usePrototype,
} from './shared';

const photos = [
  {
    id: 'forest',
    name: '林间清晨.jpg',
    src: '/samples/forest.jpg',
    size: '3.8 MB',
    dimensions: '3000 × 2000',
    tag: '旅行',
  },
  {
    id: 'mountain',
    name: '远山与湖.jpg',
    src: '/samples/mountain.jpg',
    size: '5.2 MB',
    dimensions: '3840 × 2560',
    tag: '风景',
  },
];

function IconButton({
  label,
  children,
  onPress,
}: {
  label: string;
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Tooltip>
      <Button
        variant="ghost"
        isIconOnly
        aria-label={label}
        className="prototype-icon-button shrink-0"
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

export function NameDialog({
  title,
  label,
  value: initialValue = '',
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  value?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [invalid, setInvalid] = useState(false);
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container size="sm" placement="center">
        <Modal.Dialog className="gap-5 rounded-xl border border-border bg-surface p-6">
          <Modal.Header className="flex flex-row items-center justify-between gap-3 text-left">
            <Modal.Heading className="text-xl font-medium">
              {title}
            </Modal.Heading>
            <CloseButton
              aria-label="关闭"
              className="size-11 rounded-lg"
              onPress={onClose}
            />
          </Modal.Header>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (value.trim()) onSave(value.trim());
              else setInvalid(true);
            }}
          >
            <TextField
              value={value}
              onChange={(next) => {
                setValue(next);
                setInvalid(false);
              }}
              isInvalid={invalid}
            >
              <Label>{label}</Label>
              <Input
                autoFocus
                maxLength={100}
                className="h-12 rounded-lg border border-border bg-background px-3 text-base"
              />
              {invalid ? (
                <p role="alert" className="text-sm text-danger">
                  请输入{label}
                </p>
              ) : null}
            </TextField>
            <Modal.Footer className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="prototype-button"
                onPress={onClose}
              >
                取消
              </Button>
              <Button type="submit" className="prototype-button">
                {initialValue ? '保存' : '创建'}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type QueueItem = {
  id: string;
  name: string;
  src: string;
  size: string;
  local?: boolean;
};

export function UploadPage() {
  const { scenario, notify } = usePrototype();
  const [items, setItems] = useState<QueueItem[]>(
    scenario === 'empty' ? [] : photos,
  );
  const [storage, setStorage] = useState('local');
  const [visibility, setVisibility] = useState('private');
  const [album, setAlbum] = useState('none');
  const [tag, setTag] = useState('none');
  const [phase, setPhase] = useState<'ready' | 'uploading' | 'done'>('ready');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(
    scenario === 'attention',
  );
  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  useEffect(() => {
    folderPicker.current?.setAttribute('webkitdirectory', '');
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    if (phase !== 'uploading') return;
    const timer = window.setTimeout(() => {
      setPhase('done');
      notify(`已完成 ${items.length} 张图片`);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [phase, items.length, notify]);
  function addFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/'));
    const accepted = images.filter((file) => file.size <= 50 * 1024 * 1024);
    setError(
      accepted.length !== files.length
        ? '部分文件未加入：仅支持图片，单文件最大 50 MB。'
        : '',
    );
    const next = accepted.map((file) => {
      const src = URL.createObjectURL(file);
      objectUrls.current.push(src);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        src,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        local: true,
      };
    });
    if (next.length) {
      setItems((current) => [...current, ...next]);
      setPhase('ready');
    }
  }
  return (
    <div className="prototype-page">
      <PageHeader title={phase === 'done' ? '本次上传结果' : '上传图片'} />
      {phase === 'done' ? (
        <div role="status" className="flex items-center gap-2 text-sm">
          <CheckCircle2 size={18} className="text-success" />
          成功 {items.length} 张
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {storageWarning ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/10 px-4 py-3 text-sm"
        >
          <span>对象存储已停用，请选择可用存储。</span>
          <Button
            variant="ghost"
            className="min-h-11"
            onPress={() => {
              setStorage('local');
              setStorageWarning(false);
              notify('已选择默认本地存储');
            }}
          >
            使用本地存储
          </Button>
        </div>
      ) : null}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="选择图片文件"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <input
        ref={folderPicker}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="选择图片文件夹"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          className={`min-w-0 ${dragging ? 'rounded-lg outline-2 outline-focus outline-offset-4' : ''}`}
          aria-label="上传队列"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length) {
              event.preventDefault();
              addFiles(files);
            }
          }}
        >
          {items.length ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="prototype-heading">
                  {phase === 'done'
                    ? `已完成 ${items.length} 张`
                    : `待上传 ${items.length} 张`}
                </h2>
                <Button
                  variant="outline"
                  className="prototype-button"
                  isDisabled={phase === 'uploading'}
                  onPress={() => picker.current?.click()}
                >
                  <Plus size={18} />
                  继续添加
                </Button>
              </div>
              <ul>
                {items.map((item) => (
                  <li key={item.id} className="prototype-row gap-4 py-4">
                    <img
                      src={item.src}
                      alt=""
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <span className="break-all text-sm">{item.name}</span>
                      <span className="prototype-muted text-xs">
                        {item.size} ·{' '}
                        {phase === 'done'
                          ? '已完成'
                          : phase === 'uploading'
                            ? '正在上传'
                            : '等待上传'}
                      </span>
                    </div>
                    {phase === 'done' ? (
                      <Check
                        size={18}
                        className="shrink-0 text-success"
                        aria-label="已完成"
                      />
                    ) : (
                      <IconButton
                        label={`移除 ${item.name}`}
                        onPress={() => {
                          if (phase !== 'uploading')
                            setItems((current) =>
                              current.filter((entry) => entry.id !== item.id),
                            );
                        }}
                      >
                        <X size={18} />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div
              className="grid min-h-[360px] content-center justify-items-center gap-4 rounded-lg border border-dashed border-border bg-surface p-6 text-center"
              tabIndex={0}
            >
              <CloudUpload size={42} strokeWidth={1.5} />
              <h2 className="text-xl font-medium">拖入图片或粘贴截图</h2>
              <div className="flex w-full flex-wrap justify-center gap-3 sm:w-auto">
                <Button
                  className="prototype-button min-w-32 flex-1 sm:flex-none"
                  onPress={() => picker.current?.click()}
                >
                  <ImageIcon size={18} />
                  选择图片
                </Button>
                <Button
                  variant="outline"
                  className="prototype-button min-w-32 flex-1 sm:flex-none"
                  onPress={() => folderPicker.current?.click()}
                >
                  <FolderOpen size={18} />
                  选择文件夹
                </Button>
              </div>
              <p className="prototype-muted text-xs">单文件最大 50 MB</p>
            </div>
          )}
        </section>
        <section
          className="prototype-section grid min-w-0 gap-5 lg:border-l lg:border-border lg:pl-6"
          aria-labelledby="upload-settings-heading"
        >
          <div className="flex items-center gap-2">
            <h2 id="upload-settings-heading" className="prototype-heading">
              本次上传设置
            </h2>
            <Help label="上传设置说明">
              开始上传时固定本次设置。之后调整只影响下一次上传。
            </Help>
          </div>
          <SelectField
            label="存储位置"
            value={storage}
            onChange={setStorage}
            options={[
              { id: 'local', label: '默认本地存储' },
              {
                id: 's3',
                label: '对象存储',
                disabled: scenario === 'attention',
              },
            ]}
          />
          <SelectField
            label="可见性"
            value={visibility}
            onChange={setVisibility}
            options={[
              { id: 'public', label: '公开' },
              { id: 'private', label: '私有' },
            ]}
          />
          <SelectField
            label="相册"
            value={album}
            onChange={setAlbum}
            options={[
              { id: 'none', label: '不加入相册' },
              { id: 'forest', label: '林间日记' },
              { id: 'mountain', label: '山与湖' },
            ]}
          />
          <SelectField
            label="标签"
            value={tag}
            onChange={setTag}
            options={[
              { id: 'none', label: '不添加标签' },
              { id: 'travel', label: '旅行' },
              { id: 'landscape', label: '风景' },
            ]}
          />
        </section>
      </div>
      <Footer>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="prototype-muted text-sm">{items.length} 张图片</span>
          <div className="flex gap-3">
            {phase === 'done' ? (
              <Button
                variant="outline"
                className="prototype-button"
                onPress={() => {
                  setItems([]);
                  setPhase('ready');
                }}
              >
                清空已完成
              </Button>
            ) : null}
            <Button
              className="prototype-button min-w-32"
              isDisabled={
                !items.length || phase === 'uploading' || phase === 'done'
              }
              onPress={() => setPhase('uploading')}
            >
              <CloudUpload size={18} />
              {phase === 'uploading' ? '正在上传' : '开始上传'}
            </Button>
          </div>
        </div>
      </Footer>
    </div>
  );
}

export function TrashPage() {
  const { scenario, notify } = usePrototype();
  const [items, setItems] = useState(scenario === 'empty' ? [] : photos);
  const [query, setQuery] = useState('');
  const [storage, setStorage] = useState('all');
  const [status, setStatus] = useState('all');
  const [deletion, setDeletion] = useState('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [attention, setAttention] = useState(scenario === 'attention');
  const filtered = items.filter(
    (item) =>
      item.name.includes(query.trim()) &&
      storage !== 's3' &&
      (status === 'all' || status === 'ready') &&
      (deletion === 'all' ||
        deletion === (attention && item.id === 'forest' ? 'failed' : 'none')),
  );
  function removeSelected(message: string) {
    setItems((current) =>
      current.filter((item) => !selected.includes(item.id)),
    );
    notify(message);
    setSelected([]);
    setSelecting(false);
    setConfirming(false);
  }
  return (
    <div className="prototype-page">
      <PageHeader
        title="回收站"
        help={
          <Help label="回收站规则">
            回收的图片仍占存储空间，不会自动清理。恢复后可在图库查看。永久删除无法撤销。
          </Help>
        }
      >
        <IconButton label="刷新回收站" onPress={() => notify('回收站已刷新')}>
          <RotateCcw size={18} />
        </IconButton>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchInput
            label="搜索回收图片"
            value={query}
            onChange={setQuery}
            placeholder="搜索文件名称"
          />
        </div>
        <Button
          variant="outline"
          className="prototype-button min-w-28"
          isDisabled={!items.length}
          onPress={() => {
            setSelecting(!selecting);
            setSelected([]);
          }}
        >
          {selecting ? '取消选择' : '选择记录'}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="存储"
          value={storage}
          onChange={setStorage}
          options={[
            { id: 'all', label: '全部存储' },
            { id: 'local', label: '默认本地存储' },
            { id: 's3', label: '对象存储' },
          ]}
        />
        <SelectField
          label="处理状态"
          value={status}
          onChange={setStatus}
          options={[
            { id: 'all', label: '全部处理状态' },
            { id: 'ready', label: '已就绪' },
            { id: 'failed', label: '处理失败' },
          ]}
        />
        <SelectField
          label="删除状态"
          value={deletion}
          onChange={setDeletion}
          options={[
            { id: 'all', label: '全部删除状态' },
            { id: 'none', label: '已回收' },
            { id: 'failed', label: '清理失败' },
          ]}
        />
      </div>
      {attention && items.some((item) => item.id === 'forest') ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger/10 px-4 py-3 text-sm"
        >
          <span>林间清晨.jpg 清理失败，文件仍保留。</span>
          <Button
            variant="outline"
            className="prototype-button"
            onPress={() => {
              setAttention(false);
              notify('已重新核对，记录保留在回收站');
            }}
          >
            <RotateCcw size={16} />
            重新核对
          </Button>
        </div>
      ) : null}
      {filtered.length ? (
        <ul>
          {filtered.map((item) => (
            <li key={item.id} className="prototype-row gap-3 py-4">
              {selecting ? (
                <Checkbox
                  aria-label={`选择 ${item.name}`}
                  isSelected={selected.includes(item.id)}
                  onChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                >
                  <Checkbox.Content className="flex size-11 items-center justify-center">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              ) : null}
              <img
                src={item.src}
                alt=""
                className="size-16 shrink-0 rounded-lg object-cover"
              />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="break-all text-sm">{item.name}</span>
                <span className="prototype-muted text-xs">
                  {item.size} · 默认本地存储
                </span>
                <span
                  className={`text-xs ${attention && item.id === 'forest' ? 'text-danger' : 'prototype-muted'}`}
                >
                  {attention && item.id === 'forest'
                    ? '清理失败'
                    : '已回收 · 10月10日'}
                </span>
              </div>
              {!selecting ? (
                <IconButton
                  label={`恢复 ${item.name}`}
                  onPress={() => {
                    setItems((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    );
                    notify('图片已恢复');
                  }}
                >
                  <RotateCcw size={18} />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Trash2 size={36} />}
          title={
            query || storage !== 'all' || status !== 'all' || deletion !== 'all'
              ? '未找到回收记录'
              : '回收站为空'
          }
        />
      )}
      <Footer>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="prototype-muted text-sm">
            {selecting
              ? `已选 ${selected.length} 项`
              : `${items.length} 条记录`}
          </span>
          {selecting ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="prototype-button"
                isDisabled={!selected.length}
                onPress={() => setConfirming(true)}
              >
                <Trash2 size={17} />
                永久删除
              </Button>
              <Button
                className="prototype-button"
                isDisabled={!selected.length}
                onPress={() =>
                  removeSelected(`已恢复 ${selected.length} 张图片`)
                }
              >
                <RotateCcw size={17} />
                恢复
              </Button>
            </div>
          ) : null}
        </div>
      </Footer>
      {confirming ? (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) setConfirming(false);
          }}
        >
          <Modal.Container size="sm">
            <Modal.Dialog className="gap-5 rounded-xl border border-border bg-surface p-6">
              <Modal.Header className="flex items-center justify-between gap-3">
                <Modal.Heading className="text-xl font-medium">
                  永久删除 {selected.length} 张图片？
                </Modal.Heading>
                <CloseButton
                  aria-label="关闭"
                  onPress={() => setConfirming(false)}
                />
              </Modal.Header>
              <Modal.Body className="m-0 p-0 text-sm">
                图片和文件将被永久删除，无法恢复。
              </Modal.Body>
              <Modal.Footer className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="prototype-button"
                  onPress={() => setConfirming(false)}
                >
                  取消
                </Button>
                <Button
                  className="prototype-button bg-danger text-white"
                  onPress={() =>
                    removeSelected(`已删除 ${selected.length} 张图片`)
                  }
                >
                  永久删除
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </div>
  );
}

export function TagsPage() {
  const { scenario, navigate, notify } = usePrototype();
  const [tags, setTags] = useState(
    scenario === 'empty'
      ? []
      : [
          { id: 'travel', name: '旅行', count: 24 },
          { id: 'landscape', name: '风景', count: 18 },
        ],
  );
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(
    null,
  );
  const filtered = tags.filter((tag) => tag.name.includes(query.trim()));
  return (
    <div className="prototype-page">
      <PageHeader
        title="标签"
        help={<Help label="标签数量说明">数量包含图库和回收站中的图片。</Help>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-96">
          <SearchInput
            label="搜索标签"
            value={query}
            onChange={setQuery}
            placeholder="搜索标签"
          />
        </div>
        <Button
          className="prototype-button"
          onPress={() => setEditing({ name: '' })}
        >
          <Plus size={18} />
          新建标签
        </Button>
      </div>
      {filtered.length ? (
        <ul>
          {filtered.map((tag) => (
            <li key={tag.id} className="prototype-row gap-3 py-3">
              <Tag size={18} className="shrink-0" />
              <button
                type="button"
                className="min-h-11 min-w-0 flex-1 break-all text-left text-sm hover:underline"
                onClick={() => navigate(`/library?tag=${tag.id}`)}
              >
                {tag.name}
              </button>
              <span className="prototype-muted mr-2 shrink-0 text-sm">
                {tag.count} 张
              </span>
              <IconButton
                label={`编辑 ${tag.name}`}
                onPress={() => setEditing(tag)}
              >
                <Pencil size={17} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Tag size={36} />}
          title={query ? '未找到标签' : '暂无标签'}
        />
      )}
      <Footer>
        <span className="prototype-muted text-sm">共 {tags.length} 个标签</span>
      </Footer>
      {editing ? (
        <NameDialog
          title={editing.id ? '编辑标签' : '新建标签'}
          label="标签名称"
          value={editing.name}
          onClose={() => setEditing(null)}
          onSave={(name) => {
            setTags((current) =>
              editing.id
                ? current.map((tag) =>
                    tag.id === editing.id ? { ...tag, name } : tag,
                  )
                : [...current, { id: crypto.randomUUID(), name, count: 0 }],
            );
            setEditing(null);
            setQuery('');
            notify('标签已保存');
          }}
        />
      ) : null}
    </div>
  );
}

export function SharesPage() {
  const { scenario, navigate, notify } = usePrototype();
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [settings, setSettings] = useState<{
    enabled: boolean;
    password: string;
    expiry: string;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('never');
  const visible = scenario !== 'empty' && '林间日记'.includes(query.trim());
  return (
    <div className="prototype-page">
      <PageHeader title="分享管理" />
      <div className="sm:max-w-96">
        <SearchInput
          label="搜索分享相册"
          value={query}
          onChange={setQuery}
          placeholder="搜索相册名称"
        />
      </div>
      {visible ? (
        <div className="prototype-row flex-wrap gap-4 py-4">
          <img
            src={photos[0].src}
            alt=""
            className="size-16 shrink-0 rounded-lg object-cover"
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <button
              type="button"
              className="min-h-8 break-all text-left text-sm font-medium hover:underline"
              onClick={() => navigate('/albums')}
            >
              林间日记
            </button>
            <span className="prototype-muted text-xs">
              24 张图片 · {enabled ? '分享中' : '已停用'}
            </span>
          </div>
          <div className="flex gap-2">
            <IconButton
              label="复制分享链接"
              onPress={() => {
                void navigator.clipboard
                  .writeText(`${location.origin}/s/forest`)
                  .then(
                    () => notify('分享链接已复制'),
                    () => notify('复制失败，请重试'),
                  );
              }}
            >
              <Copy size={18} />
            </IconButton>
            <IconButton
              label="分享设置"
              onPress={() => setSettings({ enabled, password, expiry })}
            >
              <MoreHorizontal size={19} />
            </IconButton>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Link2 size={36} />}
          title={query ? '未找到分享' : '暂无分享'}
        />
      )}
      <Footer>
        <span className="prototype-muted text-sm">
          共 {scenario === 'empty' ? 0 : 1} 个分享
        </span>
      </Footer>
      {settings ? (
        <Modal.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open) setSettings(null);
          }}
        >
          <Modal.Container size="sm">
            <Modal.Dialog className="gap-5 rounded-xl border border-border bg-surface p-6">
              <Modal.Header className="flex items-center justify-between gap-3">
                <Modal.Heading className="text-xl font-medium">
                  分享设置
                </Modal.Heading>
                <CloseButton
                  aria-label="关闭"
                  onPress={() => setSettings(null)}
                />
              </Modal.Header>
              <Modal.Body className="m-0 grid gap-5 p-0">
                <Switch
                  isSelected={settings.enabled}
                  onChange={(enabled) => setSettings({ ...settings, enabled })}
                  className="flex items-center justify-between"
                >
                  <Label>启用分享</Label>
                  <Switch.Content className="flex min-h-11 items-center gap-3">
                    <span className="prototype-muted text-sm">
                      {settings.enabled ? '已启用' : '已停用'}
                    </span>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
                <TextField
                  value={settings.password}
                  onChange={(value) =>
                    setSettings({ ...settings, password: value })
                  }
                >
                  <Label>访问密码（选填）</Label>
                  <Input
                    type="password"
                    className="h-12 rounded-lg border border-border bg-background px-3"
                  />
                </TextField>
                <SelectField
                  label="有效期"
                  value={settings.expiry}
                  onChange={(value) =>
                    setSettings({ ...settings, expiry: value })
                  }
                  options={[
                    { id: 'never', label: '永不过期' },
                    { id: 'week', label: '7 天' },
                    { id: 'month', label: '30 天' },
                  ]}
                />
              </Modal.Body>
              <Modal.Footer className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="prototype-button"
                  onPress={() => setSettings(null)}
                >
                  取消
                </Button>
                <Button
                  className="prototype-button"
                  onPress={() => {
                    setEnabled(settings.enabled);
                    setPassword(settings.password);
                    setExpiry(settings.expiry);
                    setSettings(null);
                    notify('分享设置已保存');
                  }}
                >
                  保存
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </div>
  );
}
