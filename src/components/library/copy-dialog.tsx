'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { TextArea } from '@heroui/react/textarea';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { versionLabels } from './detail-labels';
import type { LibraryCopy } from './use-library-copy';
import type { LibraryCopyVersion } from '../../server/library/copy-types';

export function CopyDialog({ copy }: { copy: LibraryCopy }) {
  const workspace = copy.workspace;
  const loading = useRef<HTMLParagraphElement>(null);
  const feedback = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (
      copy.manual ||
      (!copy.pending && workspace?.phase !== 'feedback' && !workspace?.error)
    )
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
  }, [copy.pending, copy.manual, workspace?.phase, workspace?.error]);
  if (!workspace) return null;
  const result = workspace.result;
  const restricted =
    result?.items.filter((item) => item.accessWarning).length ?? 0;
  const originalDisclosure = result?.items.some(
    (item) => item.originalDisclosure,
  );
  const title = copy.manual ? '手动复制' : '复制链接';
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!copy.pending}
      isKeyboardDismissDisabled={copy.pending}
      onOpenChange={(open) => {
        if (!open) copy.close();
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
          className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-0 rounded-[14px] border border-border bg-background p-6 dark:bg-surface"
        >
          <Modal.Header className="mb-1 flex flex-row items-center justify-between gap-3">
            <Modal.Heading
              ref={feedback}
              tabIndex={-1}
              className="text-xl font-semibold leading-normal"
            >
              {title}
            </Modal.Heading>
            <CloseButton
              aria-label="关闭批量复制"
              isDisabled={copy.pending}
              onPress={copy.close}
              className="size-11 shrink-0 rounded-lg bg-transparent data-[pressed=true]:transform-none"
            />
          </Modal.Header>
          <Modal.Body className="m-0 grid min-w-0 gap-5 p-0 text-sm leading-normal text-foreground">
            {copy.manual && result ? (
              <>
                <p className="text-[13px] text-muted">
                  浏览器未允许自动复制，请选中文本后复制。
                </p>
                <TextArea
                  data-testid="library-copy-manual"
                  aria-label="手动复制文本"
                  value={result.text}
                  readOnly
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-44 min-h-16 max-h-64 w-full resize-y rounded-lg border border-border bg-background p-3 text-[13px] leading-relaxed shadow-none"
                />
              </>
            ) : (
              <>
                <p className="text-[13px] text-muted">
                  已选 {workspace.items.length} 张 · 当前页{' '}
                  {workspace.currentCount} 张 · 其他页{' '}
                  {workspace.items.length - workspace.currentCount} 张
                </p>
                <Select
                  value={workspace.version}
                  onChange={(key) => {
                    if (key !== null)
                      copy.chooseVersion(String(key) as LibraryCopyVersion);
                  }}
                  isDisabled={copy.pending}
                >
                  <Label className="font-medium">复制版本</Label>
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
                        textValue="默认（跟随站点）"
                        className="min-h-11"
                      >
                        默认（跟随站点）
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
                <div className="grid gap-2">
                  <Label id="library-copy-format-label" className="font-medium">
                    格式
                  </Label>
                  <ToggleButtonGroup
                    data-testid="library-copy-format"
                    aria-labelledby="library-copy-format-label"
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[workspace.format]}
                    onSelectionChange={(keys) => {
                      const value = [...keys][0];
                      if (
                        value === 'url' ||
                        value === 'markdown' ||
                        value === 'html'
                      )
                        copy.chooseFormat(value);
                    }}
                    isDisabled={copy.pending}
                    isDetached
                    className="grid h-13 w-full grid-cols-3 gap-[3px] rounded-[10px] border border-border bg-transparent p-[3px]"
                  >
                    {(['url', 'markdown', 'html'] as const).map((format) => (
                      <ToggleButton
                        key={format}
                        id={format}
                        data-copy-format={format}
                        variant="ghost"
                        className="h-11 w-full min-w-0 rounded-[7px] px-1 text-[13px] font-medium data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        {format === 'markdown'
                          ? 'Markdown'
                          : format.toUpperCase()}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </div>
              </>
            )}
            {copy.pending ? (
              <p
                role="status"
                tabIndex={-1}
                ref={loading}
                className="text-[13px] text-muted"
              >
                正在复制…
              </p>
            ) : null}
            {workspace.error ? (
              <div role="alert" className="grid gap-2 text-[13px]">
                <strong className="font-medium text-danger">
                  链接生成失败
                </strong>
                <p>{workspace.error}</p>
              </div>
            ) : null}
            {result &&
            (result.unavailable.length || restricted || originalDisclosure) ? (
              <div
                role="status"
                data-testid="library-copy-feedback"
                className="grid min-w-0 gap-2 text-[13px]"
              >
                {result.unavailable.length ? (
                  <>
                    <strong
                      className={`text-sm font-medium ${result.items.length ? '' : 'text-danger'}`}
                    >
                      {result.items.length
                        ? `${workspace.copied ? '已复制' : '已生成'} ${result.items.length} 条，${result.unavailable.length} 张不可复制`
                        : '没有可复制的链接'}
                    </strong>
                    <ul className="grid gap-2 border-t border-border pt-3">
                      {result.unavailable.map((item) => (
                        <li
                          key={item.imageId}
                          data-copy-unavailable={item.imageId}
                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 text-xs [overflow-wrap:anywhere]"
                        >
                          <span>{item.displayName}</span>
                          <span className="text-right text-muted">
                            {item.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!result.items.length ? (
                      <p className="text-muted">
                        剪贴板未改变，请更换版本后重试。
                      </p>
                    ) : null}
                  </>
                ) : null}
                {restricted ? (
                  <p className="text-muted">
                    {restricted} 条链接仅供所有者登录后访问。
                  </p>
                ) : null}
                {originalDisclosure ? (
                  <p className="text-muted">
                    公开原图可能包含 GPS 和拍摄信息。
                  </p>
                ) : null}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer
            className={`mt-6 p-0 ${copy.manual ? 'flex justify-end' : 'grid grid-cols-2 gap-3'}`}
          >
            {!copy.manual ? (
              <Button
                data-testid="library-copy-return"
                variant="outline"
                className="h-12 w-full rounded-lg font-normal"
                isDisabled={copy.pending}
                onPress={copy.close}
              >
                {result?.items.length ? '关闭' : '取消'}
              </Button>
            ) : null}
            <Button
              data-testid={
                copy.manual
                  ? 'library-copy-manual-return'
                  : 'library-copy-submit'
              }
              className={`h-12 rounded-lg font-medium ${copy.manual ? 'min-w-30' : 'w-full'}`}
              isDisabled={copy.pending}
              isPending={copy.pending}
              onPress={() => {
                if (copy.manual) copy.close();
                else void copy.copy();
              }}
            >
              {copy.manual
                ? '完成'
                : copy.pending
                  ? '正在复制…'
                  : workspace.error
                    ? '重试'
                    : '复制'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
