import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { ImageIcon, Plus } from 'lucide-react';
import { CollectionGallery } from './collection-gallery';
import { useCollections, type Album } from './collection-state';
import { EmptyState, SearchInput, usePrototype } from './shared';

export function AlbumImagePicker({
  album,
  onClose,
}: {
  album: Album;
  onClose: () => void;
}) {
  const { photos, addToAlbum, consumeFailure } = useCollections();
  const { notify } = usePrototype();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const items = photos.filter((photo) => photo.name.includes(query.trim()));
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container size="lg" placement="center" className="p-4 sm:p-4">
        <Modal.Dialog
          className="mx-0 my-auto flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-200 flex-col gap-0 overflow-hidden rounded-xl border border-border bg-surface p-0"
          data-testid="album-picker"
        >
          <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3 text-left">
            <div className="grid min-w-0 gap-1">
              <Modal.Heading className="text-lg font-medium">
                从图库选择
              </Modal.Heading>
              <span className="truncate text-sm text-muted">{album.name}</span>
            </div>
            <CloseButton
              className="prototype-icon-button"
              aria-label="关闭选图"
              onPress={onClose}
            />
          </Modal.Header>
          <div className="shrink-0 px-5 pt-4">
            <SearchInput
              label="搜索图库图片"
              value={query}
              onChange={setQuery}
              placeholder="搜索图片名称"
            />
          </div>
          <Modal.Body className="m-0 min-h-0 overflow-y-auto px-5 py-4">
            {items.length ? (
              <CollectionGallery
                items={items}
                selected={selected}
                onSelect={setSelected}
                picker
                existing={photos
                  .filter((photo) => photo.albumIds.includes(album.id))
                  .map((photo) => photo.id)}
              />
            ) : (
              <EmptyState
                icon={<ImageIcon />}
                title={query ? '未找到图片' : '图库暂无图片'}
              />
            )}
          </Modal.Body>
          {error ? (
            <p role="alert" className="shrink-0 px-5 pb-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Modal.Footer className="m-0 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
            <span
              className="sr-only mr-auto text-sm text-muted min-[360px]:not-sr-only"
              role="status"
            >
              已选 {selected.length} 张
            </span>
            <Button
              variant="outline"
              className="prototype-button"
              onPress={onClose}
            >
              取消
            </Button>
            <Button
              className="prototype-button min-w-24"
              isDisabled={!selected.length}
              onPress={() => {
                if (consumeFailure('album-picker')) {
                  setError('添加失败，已保留选择，请重试。');
                  return;
                }
                addToAlbum(selected, album.id);
                notify(`已添加 ${selected.length} 张图片`);
                onClose();
              }}
            >
              <Plus size={17} aria-hidden />
              添加{selected.length ? ` ${selected.length} 张` : ''}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
