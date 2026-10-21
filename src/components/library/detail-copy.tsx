'use client';

import { useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { toast } from '@heroui/react/toast';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { TextArea } from '@heroui/react/textarea';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { Copy, RefreshCw } from 'lucide-react';
import type {
  LibraryDetail,
  LibraryDetailLinks,
} from '../../server/library/detail-types';
import type { SizePreset } from '../../server/media/size-types';
import { bytesLabel, versionLabels } from './detail-labels';
import { PreviewImage } from './detail-preview';
import { useImageSizeLinks } from './use-image-size-links';
import { ImageSizeFeedback, ImageSizeOptions } from './image-size-options';

type CopyFormat = keyof Pick<LibraryDetailLinks, 'url' | 'markdown' | 'html'>;

export function DetailCopy({
  detail,
  pending,
  error,
  onClose,
  onRetry,
}: {
  detail: LibraryDetail;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [mode, setMode] = useState('default');
  const [preset, setPreset] = useState<SizePreset | 'native'>('native');
  const [format, setFormat] = useState<CopyFormat>('url');
  const [manual, setManual] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const busy = useRef(false);
  const selected =
    mode === 'default'
      ? detail.defaultLink
      : detail.versions.find((version) => version.kind === mode);
  const actualVersion =
    mode === 'default' ? detail.defaultLink.actualVersion : mode;
  const preview = detail.versions.find(
    (version) => version.kind === actualVersion,
  );
  const restricted =
    detail.visibility === 'private' || detail.processingStatus !== 'ready';
  const sizeVersion =
    mode === 'compressed' || mode === 'watermark' ? mode : null;
  const sizeCompatible =
    !!sizeVersion &&
    detail.classification === 'static' &&
    detail.processingStatus === 'ready' &&
    !!selected?.links;
  const sized = preset !== 'native' && sizeCompatible;
  const sizes = useImageSizeLinks(
    detail.id,
    sizeVersion,
    preset,
    preview?.contentId ?? null,
    sized && !pending && !error,
    onRetry,
  );
  const links = sized
    ? sizes.result?.status === 'ready'
      ? sizes.result.links
      : null
    : selected?.links;
  const locked = pending || !!error || writing || sizes.pending;
  const needsGeneration = sized && !links;
  const actionLabel = writing
    ? '正在复制…'
    : pending
      ? '正在读取…'
      : error
        ? '重试读取'
        : sizes.pending
          ? sizes.generating
            ? '正在生成尺寸图片'
            : '正在读取尺寸状态'
          : sized && sizes.error
            ? '重新读取尺寸'
            : needsGeneration
              ? sizes.result?.status === 'failed' ||
                sizes.result?.status === 'cancelled'
                ? '重新生成尺寸图片'
                : '生成尺寸图片'
              : '复制链接';
  async function copy() {
    if (pending || error || sizes.pending || !links || busy.current) return;
    const text = links[format];
    busy.current = true;
    setWriting(true);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制到剪贴板');
    } catch {
      setManual(text);
    } finally {
      busy.current = false;
      setWriting(false);
    }
  }
  function act() {
    if (error) onRetry();
    else if (sized && sizes.error) sizes.retry();
    else if (needsGeneration) void sizes.generate();
    else void copy();
  }
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container
        placement="center"
        scroll="inside"
        className="p-0 md:p-6"
      >
        <Modal.Dialog
          data-testid="detail-copy-dialog"
          aria-label="复制图片链接"
          className="flex h-full max-h-[var(--visual-viewport-height)] w-full max-w-none flex-col gap-0 rounded-none bg-background p-4 dark:bg-surface md:h-auto md:max-h-[calc(var(--visual-viewport-height)-48px)] md:max-w-5xl md:rounded-[14px] md:border md:border-border md:p-6"
        >
          <Modal.Header className="mb-5 flex flex-row items-center justify-between gap-3">
            <Modal.Heading className="text-xl font-medium leading-normal">
              {manual !== null ? '浏览器未允许自动复制' : '复制图片链接'}
            </Modal.Heading>
            <CloseButton
              aria-label="关闭复制链接"
              className="size-11 shrink-0 rounded-lg border border-border data-[pressed=true]:transform-none"
              onPress={onClose}
            />
          </Modal.Header>
          <Modal.Body className="m-0 grid min-h-0 min-w-0 gap-6 overflow-y-auto p-0 text-sm leading-normal text-foreground md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div
              data-testid="detail-copy-source-preview"
              className="grid min-w-0 content-start gap-3 md:sticky md:top-0 md:self-start"
            >
              {preview ? (
                <PreviewImage
                  key={`${previewRevision}:${preview.kind}:${preview.contentId}:${preview.previewPath}`}
                  version={preview}
                  name={detail.displayName}
                  width={preview.width ?? detail.width}
                  height={preview.height ?? detail.height}
                  onRetry={() => {
                    setPreviewRevision((value) => value + 1);
                    onRetry();
                  }}
                />
              ) : (
                <p
                  role="status"
                  className="grid min-h-48 place-items-center rounded-xl bg-default p-5"
                >
                  当前默认版本不可用，无法展示预览。
                </p>
              )}
              <p className="text-sm font-medium [overflow-wrap:anywhere]">
                {detail.displayName}
              </p>
              {preview ? (
                <p className="text-xs text-muted">
                  {versionLabels[preview.kind]}
                  {preview.width && preview.height
                    ? ` · ${preview.width} × ${preview.height} px`
                    : ''}
                  {preview.byteSize !== null
                    ? ` · ${bytesLabel(preview.byteSize)}`
                    : ''}
                </p>
              ) : null}
            </div>
            <div className="grid min-w-0 content-start gap-5">
              {manual !== null ? (
                <>
                  <p>请选中下面的完整文本，手动复制。</p>
                  <TextArea
                    aria-label="手动复制文本"
                    readOnly
                    autoFocus
                    wrap="soft"
                    onFocus={(event) => event.currentTarget.select()}
                    value={manual}
                    className="min-h-40 w-full resize-y whitespace-pre-wrap break-all rounded-lg border border-border bg-default p-3 font-mono text-xs leading-6"
                  />
                </>
              ) : (
                <>
                  <p className="text-[13px] leading-6 text-muted">
                    默认链接跟随站点设置。需要指定尺寸时，请选择压缩图或水印图。
                  </p>
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <Select
                      value={mode}
                      isDisabled={locked}
                      onChange={(key) => {
                        if (key !== null) {
                          setMode(String(key));
                          setPreset('native');
                        }
                      }}
                    >
                      <Label>复制版本</Label>
                      <Select.Trigger
                        data-testid="detail-copy-version"
                        className="min-h-12 rounded-lg border border-border bg-background text-sm shadow-none dark:bg-surface"
                      >
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBox.Item
                            id="default"
                            textValue="默认链接"
                            className="min-h-11"
                          >
                            默认链接
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          {detail.versions.map((version) => (
                            <ListBox.Item
                              id={version.kind}
                              key={version.kind}
                              textValue={versionLabels[version.kind]}
                              isDisabled={!version.links}
                              className="min-h-11"
                            >
                              {versionLabels[version.kind]}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                    <ImageSizeOptions
                      preset={preset}
                      onChange={setPreset}
                      compatible={sizeCompatible}
                      disabled={locked}
                      sizes={sizes}
                    />
                  </div>
                  <ImageSizeFeedback
                    compatible={sizeCompatible}
                    preset={preset}
                    sizes={sizes}
                  />
                  <div className="grid gap-2">
                    <Label id="detail-copy-format-label">复制格式</Label>
                    <ToggleButtonGroup
                      data-testid="detail-copy-format"
                      aria-label="复制格式"
                      aria-labelledby="detail-copy-format-label"
                      selectionMode="single"
                      disallowEmptySelection
                      selectedKeys={[format]}
                      isDisabled={pending || !!error || writing}
                      onSelectionChange={(keys) => {
                        const value = [...keys][0];
                        if (
                          value === 'url' ||
                          value === 'markdown' ||
                          value === 'html'
                        )
                          setFormat(value);
                      }}
                      isDetached
                      className="grid h-13 w-full grid-cols-3 gap-[3px] rounded-[10px] border border-border bg-transparent p-[3px]"
                    >
                      {(['url', 'markdown', 'html'] as const).map((value) => (
                        <ToggleButton
                          key={value}
                          id={value}
                          data-copy-format={value}
                          variant="ghost"
                          className="h-11 w-full min-w-0 rounded-[7px] px-1 text-[13px] font-medium data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        >
                          {value === 'markdown'
                            ? 'Markdown'
                            : value.toUpperCase()}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <Label>链接预览</Label>
                    <TextArea
                      data-testid="detail-copy-preview"
                      aria-label="链接预览"
                      value={links?.[format] ?? ''}
                      readOnly
                      wrap="soft"
                      placeholder={
                        sized
                          ? '尺寸图片生成成功后显示可复制链接'
                          : '当前版本没有可复制链接'
                      }
                      className="min-h-28 max-h-52 w-full resize-y whitespace-pre-wrap break-all rounded-lg border border-border bg-default p-3 font-mono text-xs leading-6"
                    />
                  </div>
                  {pending ? (
                    <p role="status">正在核对当前版本与访问状态…</p>
                  ) : error ? (
                    <Alert status="danger">
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : (
                    <p
                      className="text-xs text-muted"
                      data-testid="copy-resolution"
                    >
                      {selected?.unavailableReason ??
                        (mode === 'default'
                          ? `当前默认：${versionLabels[detail.defaultVersion]}；实际版本：${detail.defaultLink.actualVersion ? versionLabels[detail.defaultLink.actualVersion] : '不可用'}`
                          : `固定请求${versionLabels[mode as keyof typeof versionLabels]}`)}
                    </p>
                  )}
                </>
              )}
              {restricted ? (
                <p className="rounded-lg bg-default p-3 text-xs leading-6">
                  私有或未就绪图片仍需所有者登录后访问。复制链接不会授予公开权限。
                </p>
              ) : null}
              {actualVersion === 'original' ? (
                <p className="text-xs leading-6 text-muted">
                  公开原图可能包含 GPS 和拍摄信息。
                </p>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer className="mt-5 grid grid-cols-1 gap-6 p-0 md:grid-cols-2">
            <span aria-hidden className="hidden md:block" />
            {manual !== null ? (
              <Button
                className="min-h-12 w-full rounded-lg"
                aria-label="返回复制选项"
                onPress={() => setManual(null)}
              >
                返回
              </Button>
            ) : (
              <Button
                data-testid="detail-copy-submit"
                className="min-h-12 w-full gap-2 rounded-lg md:max-w-50 md:justify-self-end"
                isDisabled={
                  pending ||
                  writing ||
                  sizes.pending ||
                  (!error && !needsGeneration && !links)
                }
                isPending={writing || sizes.pending}
                onPress={act}
              >
                {needsGeneration ? (
                  <RefreshCw size={18} aria-hidden />
                ) : (
                  <Copy size={18} aria-hidden />
                )}
                {actionLabel}
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
