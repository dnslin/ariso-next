/* eslint-disable @next/next/no-img-element -- Standalone prototype has no Next.js image server. */
import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Popover } from '@heroui/react/popover';
import { toast } from '@heroui/react/toast';
import { CloudUpload, Plus, X, Folder, Check, ChevronDown } from 'lucide-react';
import {
  Header,
  Footer,
  SelectField,
  useApp,
  buttonClass,
  iconClass,
} from './ui';
import { useDataStore, type Photo, type UploadDraft } from './state';
export function UploadPage() {
  const { navigate } = useApp();
  const { albums, drafts, setDrafts, setPhotos, consumeFailure } =
    useDataStore();
  const params = new URLSearchParams(window.location.search);
  const albumId = params.get('albumId') ?? '';
  const returnTo =
    params.get('returnTo') ?? (albumId ? `/albums/${albumId}` : '/library');
  const key = albumId || 'library';
  const defaults: UploadDraft = {
    files: [],
    storage: 'local',
    visibility: 'private',
    albumIds: albumId ? [albumId] : [],
    phase: 'draft',
  };
  const draft = drafts[key] ?? defaults;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const pending = draft.phase === 'uploading';
  const done = draft.phase === 'done';
  function update(patch: Partial<UploadDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? defaults), ...patch },
    }));
  }
  function addFiles(files: File[]) {
    if (pending) return;
    const accepted = files.filter((file) => file.type.startsWith('image/'));
    if (accepted.length !== files.length) setError('请选择图片文件。');
    else setError('');
    const next = accepted.map(
      (file) =>
        ({
          id: crypto.randomUUID(),
          name: file.name,
          src: URL.createObjectURL(file),
          size: `${(file.size / 1048576).toFixed(1)} MB`,
          visibility: draft.visibility,
          albumIds: [],
          tags: [],
        }) satisfies Photo,
    );
    update({ files: done ? next : [...draft.files, ...next], phase: 'draft' });
  }
  function start() {
    setError('');
    const snapshot = {
      ...draft,
      files: [...draft.files],
      albumIds: [...draft.albumIds],
    };
    update({ phase: 'uploading' });
    setTimeout(() => {
      if (consumeFailure(`upload-${key}`)) {
        update({ phase: 'failed' });
        setError('上传失败，文件和本次设置已保留。');
        return;
      }
      const next = snapshot.files.map((photo) => ({
        ...photo,
        albumIds: snapshot.albumIds,
        visibility: snapshot.visibility,
      }));
      setPhotos((current) => [...next, ...current]);
      update({ phase: 'done' });
      toast.success(`已上传 ${next.length} 张图片`);
    }, 1100);
  }
  return (
    <div
      className="grid min-w-0 gap-6 pb-8"
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (files.length) addFiles(files);
      }}
    >
      <Header title="上传" back={() => navigate(returnTo)} />
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="grid min-w-0 gap-5">
          <div
            data-testid="upload-dropzone"
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
            className={`flex min-h-48 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-6 ${dragging ? 'border-accent bg-secondary' : 'border-border'}`}
          >
            <CloudUpload size={32} strokeWidth={1.5} className="text-muted" />
            <Button
              variant="outline"
              className={buttonClass}
              isDisabled={pending}
              onPress={() => input.current?.click()}
            >
              <Plus size={18} />
              选择图片
            </Button>
            <input
              ref={input}
              data-testid="upload-input"
              aria-label="选择上传图片"
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])]);
                event.target.value = '';
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">
              {done ? '本次已上传' : '待上传'}{' '}
              <span className="text-muted">{draft.files.length}</span>
            </h2>
            {draft.files.length && !pending && !done ? (
              <Button
                variant="ghost"
                className={buttonClass}
                onPress={() => {
                  draft.files.forEach((file) => URL.revokeObjectURL(file.src));
                  update({ files: [], phase: 'draft' });
                  setError('');
                }}
              >
                <X size={16} />
                清空
              </Button>
            ) : null}
          </div>
          <ul className="divide-y divide-border">
            {draft.files.map((file) => (
              <li
                key={file.id}
                className="flex min-w-0 items-center gap-3 py-3"
              >
                <img
                  src={file.src}
                  alt=""
                  className="size-14 shrink-0 rounded-md object-cover"
                />
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate text-sm">{file.name}</span>
                  <span className="text-xs text-muted">
                    {file.size}
                    {pending
                      ? ' · 正在上传'
                      : done
                        ? ' · 已完成'
                        : draft.phase === 'failed'
                          ? ' · 待重试'
                          : ''}
                  </span>
                </span>
                {done ? (
                  <Check size={18} className="text-success" />
                ) : (
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label={`移除 ${file.name}`}
                    className={iconClass}
                    isDisabled={pending}
                    onPress={() => {
                      URL.revokeObjectURL(file.src);
                      update({
                        files: draft.files.filter(
                          (item) => item.id !== file.id,
                        ),
                      });
                    }}
                  >
                    <X size={16} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!draft.files.length ? (
            <p className="py-4 text-center text-sm text-muted">
              暂无待上传图片
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
        </section>
        <aside className="grid min-w-0 gap-5 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <h2 className="text-base font-medium">本次设置</h2>
          <fieldset
            disabled={pending || done}
            className="grid min-w-0 gap-5 disabled:opacity-70"
          >
            <SelectField
              label="存储"
              value={draft.storage}
              onChange={(storage) => update({ storage })}
              options={[
                { id: 'local', label: '默认本地存储' },
                { id: 'cloud', label: '照片云存储' },
              ]}
            />
            <SelectField
              label="可见性"
              value={draft.visibility}
              onChange={(visibility) =>
                update({ visibility: visibility as Photo['visibility'] })
              }
              options={[
                { id: 'private', label: '私有' },
                { id: 'public', label: '公开' },
              ]}
            />
            <div className="grid gap-2">
              <span className="text-sm">相册</span>
              <Popover>
                <Button
                  aria-label="选择上传相册"
                  isDisabled={pending || done}
                  variant="outline"
                  className="h-auto min-h-12 w-full justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-normal"
                >
                  <Folder size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 break-words">
                    {draft.albumIds.length
                      ? draft.albumIds
                          .map(
                            (id) =>
                              albums.find((album) => album.id === id)?.name ??
                              '相册不存在',
                          )
                          .join('、')
                      : '不加入相册'}
                  </span>
                  <ChevronDown size={15} className="shrink-0" />
                </Button>
                <Popover.Content className="w-[min(320px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-3 shadow-lg">
                  <Popover.Dialog
                    aria-label="选择上传相册"
                    className="grid max-h-80 gap-1 overflow-y-auto"
                  >
                    {albums.map((album) => (
                      <Checkbox
                        key={album.id}
                        isSelected={draft.albumIds.includes(album.id)}
                        onChange={(checked) =>
                          update({
                            albumIds: checked
                              ? [...draft.albumIds, album.id]
                              : draft.albumIds.filter((id) => id !== album.id),
                          })
                        }
                      >
                        <Checkbox.Content className="flex min-h-12 items-center gap-3 rounded-md px-2">
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <span className="min-w-0 break-words text-sm">
                            {album.name}
                          </span>
                        </Checkbox.Content>
                      </Checkbox>
                    ))}
                    {!albums.length ? (
                      <p className="p-4 text-sm text-muted">暂无相册</p>
                    ) : null}
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            </div>
          </fieldset>
        </aside>
      </div>
      <Footer>
        {done ? (
          <Button className={buttonClass} onPress={() => navigate(returnTo)}>
            <Folder size={17} />
            返回{albumId ? '相册' : '图库'}
          </Button>
        ) : (
          <Button
            className={`${buttonClass} min-w-32`}
            isDisabled={!draft.files.length || !draft.storage}
            isPending={pending}
            onPress={start}
          >
            <CloudUpload size={18} />
            {pending
              ? '正在上传'
              : draft.phase === 'failed'
                ? '重试上传'
                : '开始上传'}
          </Button>
        )}
      </Footer>
    </div>
  );
}
