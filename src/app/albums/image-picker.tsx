'use client';

import { useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { InputGroup } from '@heroui/react/input-group';
import { Modal } from '@heroui/react/modal';
import { Pagination } from '@heroui/react/pagination';
import { Spinner } from '@heroui/react/spinner';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import { ChevronDown, ChevronUp, Images, Plus, Search, X } from 'lucide-react';
import { BatchThumbnail } from '../../components/library/batch-targets';
import { LibraryLoading } from '../library/library-loading';
import { type Album } from './api';
import { AlbumImageChoice } from './image-choice';
import { useAlbumImagePicker } from './use-image-picker';

export function AlbumImagePicker({
  album,
  isOpen,
  onClose,
  onExpire,
  onChanged,
}: {
  album: Album;
  isOpen: boolean;
  onClose: () => void;
  onExpire: () => void;
  onChanged: () => Promise<void>;
}) {
  const [selectedExpanded, setSelectedExpanded] = useState(false);
  function closePicker() {
    setSelectedExpanded(false);
    onClose();
  }
  const picker = useAlbumImagePicker({
    albumId: album.id,
    isOpen,
    onClose: closePicker,
    onExpire,
    onChanged,
  });
  const { list } = picker;
  const locked = picker.pending || !!picker.unknownIds.length;
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !picker.pending) closePicker();
      }}
    >
      <Modal.Backdrop
        isDismissable={!picker.pending}
        isKeyboardDismissDisabled={picker.pending}
      >
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog
            data-testid="album-image-picker"
            render={(props) => (
              <section
                {...props}
                aria-busy={picker.pending || list.isFetching}
              />
            )}
            data-page={picker.page}
            className="mx-0 my-auto flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-200 flex-col gap-0 overflow-hidden rounded-xl border border-border bg-surface p-0"
          >
            <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3 text-left">
              <div className="grid min-w-0 gap-1">
                <Modal.Heading className="text-lg font-medium">
                  从图库选择
                </Modal.Heading>
                <p className="truncate text-sm text-muted">{album.name}</p>
              </div>
              <CloseButton
                aria-label="关闭选图"
                isDisabled={picker.pending}
                className="size-11 shrink-0 rounded-lg bg-transparent"
                onPress={closePicker}
              />
            </Modal.Header>
            <div className="shrink-0 px-5 pt-4">
              <TextField
                aria-label="搜索图库图片"
                value={picker.q}
                onChange={picker.setQuery}
                isDisabled={picker.pending}
              >
                <InputGroup className="h-12 w-full min-w-0 rounded-lg border border-border bg-background shadow-none">
                  <InputGroup.Prefix className="border-0 pr-2 text-muted">
                    <Search size={16} aria-hidden />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    placeholder="搜索图片名称"
                    className="h-12 min-w-0 py-0 text-base md:text-sm"
                  />
                </InputGroup>
              </TextField>
            </div>
            <Modal.Body className="m-0 min-h-0 overflow-y-auto px-5 py-4">
              {list.isPending ? (
                <LibraryLoading />
              ) : list.error ? (
                <Alert status="danger" data-testid="album-image-read-error">
                  <Alert.Content>
                    <Alert.Title>图片或成员状态读取失败</Alert.Title>
                    <Alert.Description>{list.error.message}</Alert.Description>
                    <Button
                      variant="outline"
                      className="mt-3 min-h-11 rounded-lg font-normal"
                      isDisabled={list.isFetching}
                      onPress={() => void list.refetch()}
                    >
                      重试读取
                    </Button>
                  </Alert.Content>
                </Alert>
              ) : list.data?.items.length ? (
                <div
                  className="grid grid-cols-2 items-start gap-x-3 gap-y-5 lg:grid-cols-3 xl:grid-cols-4"
                  aria-label="图库选图列表"
                >
                  {list.data.items.map((item) => {
                    const existing = list.data.memberIds.includes(item.id);
                    return (
                      <AlbumImageChoice
                        key={item.id}
                        item={item}
                        existing={existing}
                        selected={picker.selected.has(item.id)}
                        disabled={locked || list.isFetching}
                        onToggle={(item) => {
                          if (
                            picker.selected.size === 1 &&
                            picker.selected.has(item.id)
                          )
                            setSelectedExpanded(false);
                          picker.toggle(item);
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div
                  role="status"
                  className="grid min-h-48 content-center justify-items-center gap-3 text-center"
                >
                  <Images size={36} aria-hidden />
                  <h2 className="text-lg font-medium">
                    {picker.q
                      ? '未找到图片'
                      : list.data?.total
                        ? '本页已无图片'
                        : '图库暂无图片'}
                  </h2>
                  {picker.page > 1 ? (
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-lg"
                      onPress={() => picker.setPage(1)}
                    >
                      返回第一页
                    </Button>
                  ) : null}
                </div>
              )}
            </Modal.Body>
            {picker.error ? (
              <div
                role="alert"
                data-testid="album-image-submit-error"
                className="grid max-h-[min(8rem,14dvh)] shrink-0 gap-2 overflow-y-auto px-5 pb-4 text-sm text-danger"
              >
                <p>{picker.error}</p>
                {picker.failures.length ? (
                  <ul className="grid gap-1">
                    {picker.failures.map((item) => (
                      <li key={item.id}>
                        {picker.selected.get(item.id)?.displayName ?? item.id}：
                        {item.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <Modal.Footer className="m-0 flex max-h-[48dvh] shrink-0 flex-col gap-3 overflow-hidden border-t border-border px-5 py-4">
              <div
                data-testid="album-image-footer-scroll"
                className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain"
              >
                {picker.pages > 1 ? (
                  <Pagination aria-label="选图分页" className="w-full">
                    <Pagination.Content className="w-full gap-2">
                      <Pagination.Item className="flex-1">
                        <Pagination.Previous
                          className="h-11 w-full rounded-lg border border-border px-2 font-normal"
                          isDisabled={
                            picker.page <= 1 ||
                            list.isFetching ||
                            picker.pending
                          }
                          onPress={() => picker.setPage(picker.page - 1)}
                        >
                          上一页
                        </Pagination.Previous>
                      </Pagination.Item>
                      <Pagination.Item>
                        <Pagination.Summary className="text-xs">
                          {picker.page}/{picker.pages}
                        </Pagination.Summary>
                      </Pagination.Item>
                      <Pagination.Item className="flex-1">
                        <Pagination.Next
                          className="h-11 w-full rounded-lg border border-border px-2 font-normal"
                          isDisabled={
                            picker.page >= picker.pages ||
                            list.isFetching ||
                            picker.pending
                          }
                          onPress={() => picker.setPage(picker.page + 1)}
                        >
                          下一页
                        </Pagination.Next>
                      </Pagination.Item>
                    </Pagination.Content>
                  </Pagination>
                ) : null}
                {picker.selected.size ? (
                  <div className="rounded-lg border border-border bg-background">
                    <Button
                      data-testid="album-image-selected-toggle"
                      variant="ghost"
                      className="min-h-11 w-full justify-between rounded-lg px-3 text-sm font-normal"
                      aria-expanded={selectedExpanded}
                      aria-controls={
                        selectedExpanded
                          ? 'album-image-selected-list'
                          : undefined
                      }
                      onPress={() => setSelectedExpanded((value) => !value)}
                    >
                      已选 {picker.selected.size} 张 · 查看与移除
                      {selectedExpanded ? (
                        <ChevronUp size={16} aria-hidden />
                      ) : (
                        <ChevronDown size={16} aria-hidden />
                      )}
                    </Button>
                    {selectedExpanded ? (
                      <ul
                        id="album-image-selected-list"
                        data-testid="album-image-selected-list"
                        className="grid max-h-[min(11rem,20dvh)] gap-1 overflow-y-auto border-t border-border p-2"
                      >
                        {[...picker.selected.values()].map((item) => (
                          <li
                            key={item.id}
                            data-image-id={item.id}
                            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
                          >
                            <BatchThumbnail
                              key={item.thumbnailUrl}
                              url={
                                item.storage.enabled ? item.thumbnailUrl : null
                              }
                              className="size-10 rounded-md"
                            />
                            <span
                              className="min-w-0 flex-1 truncate text-sm"
                              title={item.displayName}
                            >
                              {item.displayName}
                            </span>
                            <Button
                              isIconOnly
                              variant="ghost"
                              className="size-11 shrink-0 rounded-lg"
                              aria-label={`移除已选图片：${item.displayName}`}
                              isDisabled={locked}
                              onPress={() => {
                                picker.remove(item.id);
                                if (picker.selected.size === 1)
                                  setSelectedExpanded(false);
                              }}
                            >
                              <X size={16} aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2">
                <div className="mr-auto flex min-w-0 items-center gap-1">
                  {!picker.selected.size ? (
                    <span
                      role="status"
                      data-testid="album-image-selected"
                      className="sr-only text-sm text-muted min-[360px]:not-sr-only"
                    >
                      已选 0 张
                    </span>
                  ) : null}
                  {picker.selected.size ? (
                    <Tooltip>
                      <Button
                        isIconOnly
                        aria-label="清空选图"
                        variant="ghost"
                        className="size-11 shrink-0 rounded-lg"
                        isDisabled={locked}
                        onPress={() => {
                          picker.clear();
                          setSelectedExpanded(false);
                        }}
                      >
                        <X size={16} aria-hidden />
                      </Button>
                      <Tooltip.Content>清空选图</Tooltip.Content>
                    </Tooltip>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  className="h-12 rounded-lg font-normal"
                  isDisabled={picker.pending}
                  onPress={closePicker}
                >
                  取消
                </Button>
                <Button
                  data-testid="album-image-add"
                  className="h-12 min-w-24 gap-2 rounded-lg font-normal"
                  isDisabled={picker.pending || !picker.selected.size}
                  onPress={picker.submit}
                >
                  {picker.pending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Plus size={16} aria-hidden />
                  )}
                  {picker.pending
                    ? '正在处理…'
                    : picker.unknownIds.length
                      ? '核对结果'
                      : `添加${picker.selected.size ? ` ${picker.selected.size} 张` : ''}`}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
