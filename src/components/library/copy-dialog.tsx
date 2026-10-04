'use client';

import { useEffect, useRef } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Dropdown } from '@heroui/react/dropdown';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { TextArea } from '@heroui/react/textarea';
import { ChevronDown } from 'lucide-react';
import type { LibraryCopyVersion } from '../../server/library/copy-types';
import { versionLabels } from './detail-labels';
import type { LibraryCopy } from './use-library-copy';

export function CopyDialog({ copy }: { copy: LibraryCopy }) {
  const workspace = copy.workspace;
  const loading = useRef<HTMLParagraphElement>(null);
  const feedback = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!copy.pending && workspace?.phase !== 'empty' && !workspace?.error)
      return;
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        (copy.pending ? loading.current : feedback.current)?.focus({
          preventScroll: true,
        }),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
    };
  }, [copy.pending, workspace?.phase, workspace?.error]);
  if (!workspace || (workspace.phase === 'result' && !copy.manual)) return null;
  const empty = workspace.phase === 'empty';
  const result = workspace.result;
  const warnings = [
    ...new Set(
      result?.items.flatMap((item) =>
        item.accessWarning ? [item.accessWarning] : [],
      ) ?? [],
    ),
  ];
  const title = copy.manual
    ? '浏览器未允许自动复制'
    : empty
      ? '没有可复制的链接'
      : '复制图片链接';
  const close = copy.manual
    ? copy.closeManual
    : empty
      ? copy.returnToSelection
      : () => copy.close();
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!copy.pending}
      isKeyboardDismissDisabled={copy.pending}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Container
        placement="center"
        scroll="inside"
        className="p-4 sm:p-4"
      >
        <Modal.Dialog
          data-testid="library-copy-dialog"
          aria-label={title}
          aria-busy={copy.pending}
          className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 rounded-xl border border-border bg-background p-6 dark:bg-surface"
        >
          <Modal.Header className="flex flex-row items-center justify-between gap-3">
            <Modal.Heading
              ref={feedback}
              tabIndex={-1}
              className="text-xl font-medium leading-normal"
            >
              {title}
            </Modal.Heading>
            {!empty && !copy.manual ? (
              <CloseButton
                aria-label="关闭批量复制"
                isDisabled={copy.pending}
                onPress={close}
                className="size-11 shrink-0 rounded-lg border border-border bg-background data-[pressed=true]:transform-none dark:bg-surface"
              />
            ) : null}
          </Modal.Header>
          <Modal.Body className="m-0 grid min-w-0 gap-4 p-0 text-sm leading-normal text-foreground">
            {copy.manual && result ? (
              <>
                <p>请选中下面的文本，手动复制。</p>
                <div className="grid gap-3 rounded-lg bg-default p-3">
                  <TextArea
                    data-testid="library-copy-manual"
                    aria-label="手动复制文本"
                    value={result.text}
                    readOnly
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-h-16 max-h-64 w-full resize-y bg-transparent text-[13px] leading-normal"
                  />
                  {warnings.map((warning) => (
                    <p key={warning} className="text-[13px]">
                      {warning}
                    </p>
                  ))}
                  {result.items.some((item) => item.originalDisclosure) ? (
                    <p className="text-[13px]">
                      公开原图可能包含 GPS 和拍摄信息。
                    </p>
                  ) : null}
                </div>
              </>
            ) : empty && result ? (
              <>
                <p>所选 {workspace.items.length} 张图片均无法复制。</p>
                <div className="grid rounded-lg bg-default p-3 text-[13px]">
                  {result.unavailable.map((item) => (
                    <p
                      key={item.imageId}
                      data-copy-unavailable={item.imageId}
                      className="[overflow-wrap:anywhere]"
                    >
                      {item.displayName}：{item.reason}
                    </p>
                  ))}
                  <p>剪贴板原内容保持不变。</p>
                </div>
              </>
            ) : (
              <>
                <p>
                  共选 {workspace.items.length} 张：当前页{' '}
                  {workspace.currentCount} 张，其他页{' '}
                  {workspace.items.length - workspace.currentCount} 张。
                </p>
                <p className="rounded-lg bg-default p-3 text-[13px]">
                  默认链接跟随站点设置。当前预览版本不会自动改变复制模式。
                </p>
                <Select
                  value={workspace.version}
                  onChange={(key) => {
                    if (key !== null)
                      copy.chooseVersion(String(key) as LibraryCopyVersion);
                  }}
                  isDisabled={copy.pending}
                >
                  <Label>复制版本</Label>
                  <Select.Trigger
                    data-testid="library-copy-version"
                    className="h-12 rounded-lg border border-border bg-background text-sm font-normal shadow-none dark:bg-surface"
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
                      {Object.entries(versionLabels).map(([kind, label]) => (
                        <ListBox.Item
                          key={kind}
                          id={kind}
                          textValue={label}
                          className="min-h-11"
                        >
                          {label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                {workspace.version !== 'default' ? (
                  <p className="text-[13px]">
                    链接以后始终请求所选版本。缺失或不适用版本不提供可用链接。
                  </p>
                ) : null}
                {copy.pending ? (
                  <p role="status" tabIndex={-1} ref={loading}>
                    正在按当前查询顺序生成链接…
                  </p>
                ) : null}
                {workspace.error ? (
                  <Alert status="danger" role="alert">
                    <Alert.Content>
                      <Alert.Title>链接生成失败</Alert.Title>
                      <Alert.Description>{workspace.error}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                <Dropdown>
                  <Button
                    data-testid="library-copy-format"
                    aria-label="选择批量复制格式"
                    variant="outline"
                    isDisabled={copy.pending}
                    isPending={copy.pending}
                    className="h-12 w-full rounded-lg text-sm font-normal"
                  >
                    复制链接
                    <ChevronDown size={16} aria-hidden />
                  </Button>
                  <Dropdown.Popover
                    placement="bottom"
                    className="w-[var(--trigger-width)] max-w-none rounded-xl border border-border bg-background dark:bg-surface"
                  >
                    <Dropdown.Menu aria-label="批量复制格式">
                      {(['url', 'markdown', 'html'] as const).map((format) => (
                        <Dropdown.Item
                          key={format}
                          id={format}
                          textValue={`复制 ${format === 'markdown' ? 'Markdown' : format.toUpperCase()}`}
                          isDisabled={copy.pending}
                          className="min-h-11 text-sm"
                          onAction={() => {
                            void copy.copy(format);
                          }}
                        >
                          复制{' '}
                          {format === 'markdown'
                            ? 'Markdown'
                            : format.toUpperCase()}
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
                <p className="text-[13px]">
                  复制链接不会把私有或未就绪图片改为公开。公开原图可能包含 GPS
                  和拍摄信息。
                </p>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="m-0 p-0">
            <Button
              data-testid={
                copy.manual
                  ? 'library-copy-manual-return'
                  : 'library-copy-return'
              }
              className="h-12 w-full rounded-lg font-normal"
              isDisabled={copy.pending}
              onPress={close}
            >
              {empty ? '返回已选清单' : '返回'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
