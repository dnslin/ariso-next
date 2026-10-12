import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Tooltip } from '@heroui/react/tooltip';
import {
  Check,
  CloudUpload,
  Folder,
  Globe,
  HardDrive,
  LockKeyhole,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { SelectField, usePrototype } from './shared';
import { useCollections, type Photo } from './collection-state';

type UploadDraft = {
  files: Photo[];
  storage: string;
  visibility: Photo['visibility'];
  albumId: string;
  expanded: boolean;
  error: string;
};

/* eslint-disable @next/next/no-img-element -- Local prototype file previews. */
export function QuickUploadDialog() {
  const { scenario } = usePrototype();
  const {
    albums,
    uploadTarget,
    uploadOpen,
    closeUpload,
    jobs,
    createLocalPhoto,
    startUpload,
    retryUpload,
  } = useCollections();
  const [drafts, setDrafts] = useState<Record<string, UploadDraft>>({});
  const key = uploadTarget?.albumId ?? '';
  const draft = drafts[key] ?? {
    files: [],
    storage: 'local',
    visibility: 'private',
    albumId: key,
    expanded: false,
    error: '',
  };
  const { files, storage, visibility, albumId, expanded, error } = draft;
  function updateDraft(changes: Partial<UploadDraft>) {
    setDrafts((current) => ({ ...current, [key]: { ...draft, ...changes } }));
  }
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const currentAlbum = albums.find((album) => album.id === albumId);
  const unavailable = scenario === 'attention' && storage === 'local';
  const targetJobs = jobs;
  function addFiles(chosen: File[]) {
    const valid = chosen.filter(
      (file) => file.type.startsWith('image/') && file.size <= 50 * 1024 * 1024,
    );
    updateDraft({
      files: [...files, ...valid.map(createLocalPhoto)],
      error:
        valid.length === chosen.length
          ? ''
          : '部分文件不是图片或超过 50 MB，未加入队列。',
    });
  }
  if (!uploadOpen) return null;
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) closeUpload();
      }}
    >
      <Modal.Container size="lg" placement="center" className="p-4 sm:p-4">
        <Modal.Dialog
          className="mx-0 my-auto flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-160 flex-col gap-0 overflow-hidden rounded-xl border border-border bg-surface p-0"
          data-testid="quick-upload"
        >
          <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3 text-left">
            <div className="grid min-w-0 gap-1">
              <Modal.Heading className="text-lg font-medium">
                上传图片
              </Modal.Heading>
              {currentAlbum ? (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
                  <Folder size={14} className="shrink-0" aria-hidden />
                  <span className="truncate">{currentAlbum.name}</span>
                </span>
              ) : null}
            </div>
            <CloseButton
              aria-label="收起上传窗口"
              className="prototype-icon-button"
              onPress={closeUpload}
            />
          </Modal.Header>
          <Modal.Body className="m-0 grid min-h-0 gap-4 overflow-y-auto px-5 py-4">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <HardDrive size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 break-words">
                {storage === 'local' ? '默认本地存储' : '图片归档'}
                {unavailable ? (
                  <span className="ml-2 text-danger">不可用</span>
                ) : null}
              </span>
              {visibility === 'private' ? (
                <LockKeyhole size={15} aria-hidden />
              ) : (
                <Globe size={15} aria-hidden />
              )}
              <span>{visibility === 'private' ? '私有' : '公开'}</span>
              <Tooltip>
                <Button
                  isIconOnly
                  variant="ghost"
                  className="prototype-icon-button"
                  aria-label="上传设置"
                  aria-expanded={expanded}
                  onPress={() => updateDraft({ expanded: !expanded })}
                >
                  <SlidersHorizontal size={17} aria-hidden />
                </Button>
                <Tooltip.Content>上传设置</Tooltip.Content>
              </Tooltip>
            </div>
            {unavailable ? (
              <p className="text-sm text-danger" role="alert">
                默认存储不可用，请在上传设置中选择其他存储。
              </p>
            ) : null}
            {expanded ? (
              <div
                className="grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-2"
                data-testid="quick-upload-settings"
              >
                <SelectField
                  label="存储"
                  value={storage}
                  onChange={(storage) => updateDraft({ storage })}
                  options={[
                    {
                      id: 'local',
                      label:
                        scenario === 'attention'
                          ? '默认本地存储（不可用）'
                          : '默认本地存储',
                      disabled: scenario === 'attention',
                    },
                    { id: 'archive', label: '图片归档' },
                  ]}
                />
                <SelectField
                  label="可见性"
                  value={visibility}
                  onChange={(value) =>
                    updateDraft({ visibility: value as Photo['visibility'] })
                  }
                  options={[
                    { id: 'private', label: '私有' },
                    { id: 'public', label: '公开' },
                  ]}
                />
                {!uploadTarget?.albumId ? (
                  <SelectField
                    label="相册"
                    value={albumId}
                    onChange={(albumId) => updateDraft({ albumId })}
                    options={[
                      { id: '', label: '不加入相册' },
                      ...albums.map((album) => ({
                        id: album.id,
                        label: album.name,
                      })),
                    ]}
                    className="sm:col-span-2"
                  />
                ) : null}
              </div>
            ) : null}
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="上传图片文件"
              tabIndex={-1}
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className={`prototype-dropzone flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus ${dragging ? 'border-accent bg-secondary' : 'border-border bg-background'}`}
              onClick={() => input.current?.click()}
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
            >
              <CloudUpload size={26} aria-hidden />
              <span className="font-medium">选择图片</span>
              <span className="text-xs text-muted">单文件最大 50 MB</span>
            </button>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            {files.length ? (
              <ul className="grid gap-2" aria-label="待上传图片">
                {files.map((file) => (
                  <li key={file.id} className="flex min-w-0 items-center gap-3">
                    <img
                      src={file.src}
                      alt=""
                      className="size-11 shrink-0 rounded-md object-cover"
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">{file.name}</span>
                      <span className="text-xs text-muted">{file.size}</span>
                    </span>
                    <Tooltip>
                      <Button
                        isIconOnly
                        variant="ghost"
                        className="prototype-icon-button"
                        aria-label={`移除 ${file.name}`}
                        onPress={() =>
                          updateDraft({
                            files: files.filter((item) => item.id !== file.id),
                          })
                        }
                      >
                        <X size={16} aria-hidden />
                      </Button>
                      <Tooltip.Content>移除</Tooltip.Content>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            ) : null}
            {targetJobs.length ? (
              <div
                className="grid gap-3 border-t border-border pt-4"
                aria-label="上传进度"
              >
                {targetJobs.map((job) => (
                  <div
                    key={job.id}
                    className="grid gap-2"
                    data-upload-job={job.phase}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {job.files.length === 1
                          ? job.files[0].name
                          : `${job.files.length} 张图片`}
                      </span>
                      {job.phase === 'done' ? (
                        <Check size={16} aria-hidden />
                      ) : null}
                      <span
                        className={
                          job.phase === 'failed' ? 'text-danger' : 'text-muted'
                        }
                      >
                        {job.phase === 'done'
                          ? '已完成'
                          : job.phase === 'processing'
                            ? '正在处理'
                            : job.phase === 'failed'
                              ? '上传失败'
                              : `${job.progress}%`}
                      </span>
                    </div>
                    <span className="break-words text-xs text-muted">
                      {job.albumName || '不加入相册'} ·{' '}
                      {job.storage === 'local' ? '默认本地存储' : '图片归档'} ·{' '}
                      {job.visibility === 'private' ? '私有' : '公开'}
                    </span>
                    {job.phase === 'uploading' || job.phase === 'processing' ? (
                      <ProgressBar
                        aria-label="上传进度"
                        value={job.progress}
                        className="w-full"
                      >
                        <ProgressBar.Track className="h-1">
                          <ProgressBar.Fill />
                        </ProgressBar.Track>
                      </ProgressBar>
                    ) : null}
                    {job.phase === 'failed' ? (
                      <div className="flex items-center justify-between gap-3">
                        <p role="alert" className="text-sm text-danger">
                          网络连接中断，文件和本次设置已保留。
                        </p>
                        <Tooltip>
                          <Button
                            variant="outline"
                            className="prototype-icon-button"
                            isIconOnly
                            aria-label="重试上传"
                            onPress={() => retryUpload(job.id)}
                          >
                            <RotateCcw size={16} aria-hidden />
                          </Button>
                          <Tooltip.Content>重试上传</Tooltip.Content>
                        </Tooltip>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="m-0 flex shrink-0 items-center justify-end gap-3 border-t border-border px-5 py-4">
            <Button
              variant="outline"
              className="prototype-button min-w-24"
              onPress={closeUpload}
            >
              {targetJobs.some(
                (job) =>
                  job.phase === 'uploading' || job.phase === 'processing',
              )
                ? '后台继续'
                : '取消'}
            </Button>
            <Button
              className="prototype-button min-w-32"
              isDisabled={!files.length || unavailable}
              onPress={() => {
                startUpload(files, { storage, visibility, albumId });
                updateDraft({ files: [] });
              }}
            >
              <CloudUpload size={17} aria-hidden />
              开始上传{files.length ? ` ${files.length} 张` : ''}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
