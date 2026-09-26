'use client';

import { useRef, type ComponentProps } from 'react';
import { TrashAction } from './trash-actions';
import { Dropdown } from '@heroui/react/dropdown';
import { useMediaQuery } from '@heroui/react';

export interface DetailDownloadAction {
  label: string;
  isDisabled: boolean;
  onDownload: () => void;
}

function MoreMenu({
  trash,
  download,
  refreshing,
  onRefresh,
}: {
  trash: { open: () => void; isDisabled: boolean; label: string };
  download: DetailDownloadAction;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const mobile = useMediaQuery('(max-width: 767px)', {
    initializeWithValue: false,
  });
  return (
    <Dropdown>
      <Dropdown.Trigger
        ref={trigger}
        className="h-12 w-full rounded-lg border border-border bg-background px-4 text-sm"
      >
        更多操作
      </Dropdown.Trigger>
      <Dropdown.Popover
        placement="top end"
        className="max-w-[calc(100vw-32px)]"
      >
        <Dropdown.Menu aria-label="图片更多操作">
          {mobile ? (
            <Dropdown.Item
              id="download"
              className="min-h-11"
              isDisabled={download.isDisabled}
              onAction={download.onDownload}
            >
              {download.label}
            </Dropdown.Item>
          ) : null}
          <Dropdown.Item
            id="refresh"
            className="min-h-11"
            isDisabled={refreshing}
            onAction={onRefresh}
          >
            刷新详情
          </Dropdown.Item>
          <Dropdown.Item
            id="trash"
            className="min-h-11"
            isDisabled={trash.isDisabled}
            onAction={() => {
              // The menu item disappears when selected. Capture a persistent
              // focus destination before opening the separately mounted dialog.
              trigger.current?.focus();
              trash.open();
            }}
          >
            {trash.label}
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function DetailMoreActions({
  trash,
  ...menu
}: {
  trash: ComponentProps<typeof TrashAction>;
  download: DetailDownloadAction;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <TrashAction
      {...trash}
      renderTrigger={(trigger) => <MoreMenu {...menu} trash={trigger} />}
    />
  );
}
