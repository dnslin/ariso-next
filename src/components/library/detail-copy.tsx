'use client';

import { useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { TextArea } from '@heroui/react/textarea';
import type {
  LibraryDetail,
  LibraryDetailLinks,
} from '../../server/library/detail-types';
import { versionLabels } from './detail-labels';

export function DetailCopy({
  detail,
  pending,
  error,
  onClose,
  onRetry,
  closeLabel,
}: {
  detail: LibraryDetail;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  closeLabel: string;
}) {
  const [mode, setMode] = useState('default');
  const [manual, setManual] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [writing, setWriting] = useState(false);
  const busy = useRef(false);
  const selected =
    mode === 'default'
      ? detail.defaultLink
      : detail.versions.find((v) => v.kind === mode);
  const restricted =
    detail.visibility === 'private' || detail.processingStatus !== 'ready';
  async function copy(
    format: keyof Pick<LibraryDetailLinks, 'url' | 'markdown' | 'html'>,
  ) {
    if (pending || error || !selected?.links || busy.current) return;
    const text = selected.links[format];
    busy.current = true;
    setWriting(true);
    setMessage('');
    try {
      await navigator.clipboard.writeText(text);
      setMessage('已复制到剪贴板');
    } catch {
      setManual(text);
    } finally {
      busy.current = false;
      setWriting(false);
    }
  }
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container
        size="sm"
        placement="center"
        scroll="inside"
        className="p-4 sm:p-4"
      >
        <Modal.Dialog
          aria-label="复制图片链接"
          className="gap-4 rounded-xl border border-border bg-background p-6 [&_.button]:min-h-12"
        >
          <Modal.Header>
            <Modal.Heading>
              {manual !== null ? '浏览器未允许自动复制' : '复制图片链接'}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="grid min-w-0 gap-4">
            {manual !== null ? (
              <>
                <p>请选中下面的文本，手动复制。</p>
                <div className="grid gap-3 rounded-lg bg-default p-3">
                  <TextArea
                    aria-label="手动复制文本"
                    value={manual}
                    readOnly
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-h-16 w-full resize-y bg-transparent text-sm"
                  />
                  {restricted ? (
                    <p className="text-sm">
                      私有或未就绪图片仍需所有者登录后访问。复制链接不会授予公开权限。
                    </p>
                  ) : null}
                  <p className="text-sm">公开原图可能包含 GPS 和拍摄信息。</p>
                </div>
              </>
            ) : (
              <>
                <p className="break-all">{detail.displayName}</p>
                <p className="rounded-lg bg-default p-3 text-sm">
                  默认链接跟随站点设置。当前预览版本不会自动改变复制模式。
                </p>
                <Select
                  value={mode}
                  onChange={(key) => {
                    if (key !== null) {
                      setMode(String(key));
                      setMessage('');
                    }
                  }}
                  isDisabled={pending || !!error || writing}
                >
                  <Label>复制版本</Label>
                  <Select.Trigger className="min-h-11">
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
                      {detail.versions.map((v) => (
                        <ListBox.Item
                          id={v.kind}
                          key={v.kind}
                          textValue={versionLabels[v.kind]}
                          isDisabled={!v.links}
                          className="min-h-11"
                        >
                          {versionLabels[v.kind]}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                {pending ? (
                  <p role="status">正在核对当前版本与访问状态…</p>
                ) : error ? (
                  <>
                    <Alert status="danger">
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                    <Button onPress={onRetry}>重试读取</Button>
                  </>
                ) : (
                  <p className="text-sm" data-testid="copy-resolution">
                    {selected?.unavailableReason ??
                      (mode === 'default'
                        ? `当前默认：${versionLabels[detail.defaultVersion]}；实际版本：${detail.defaultLink.actualVersion ? versionLabels[detail.defaultLink.actualVersion] : '不可用'}`
                        : `固定请求${versionLabels[mode as keyof typeof versionLabels]}`)}
                  </p>
                )}
                {(['url', 'markdown', 'html'] as const).map((format) => (
                  <Button
                    key={format}
                    variant="outline"
                    isDisabled={
                      pending || !!error || !selected?.links || writing
                    }
                    onPress={() => {
                      void copy(format);
                    }}
                  >
                    复制{' '}
                    {format === 'markdown' ? 'Markdown' : format.toUpperCase()}
                  </Button>
                ))}
                {message ? <p role="status">{message}</p> : null}
              </>
            )}
            {restricted && manual === null ? (
              <p className="rounded-lg bg-default p-3 text-sm">
                私有或未就绪图片仍需所有者登录后访问。复制链接不会授予公开权限。
              </p>
            ) : null}
            {manual === null ? (
              <p className="text-sm">公开原图可能包含 GPS 和拍摄信息。</p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button
              className="w-full"
              onPress={() => (manual !== null ? setManual(null) : onClose())}
            >
              {manual !== null ? '返回复制选项' : closeLabel}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
