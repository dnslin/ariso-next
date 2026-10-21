'use client';

import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { Dropdown } from '@heroui/react/dropdown';
import { Download, FolderDown } from 'lucide-react';
import {
  archiveVersions,
  type ArchiveVersion,
} from '../../server/library/archive-types';
import { versionLabels } from './detail-labels';

type ArchiveMenuProps = {
  disabled: boolean;
  pending: boolean;
  onDownload: (version: ArchiveVersion) => void;
};

export function ArchiveVersionMenu({
  disabled,
  onDownload,
}: Pick<ArchiveMenuProps, 'disabled' | 'onDownload'>) {
  return (
    <>
      <p className="px-2.5 py-2 text-xs text-muted">下载版本</p>
      <Dropdown.Menu
        data-testid="library-archive-menu"
        aria-label="打包下载版本"
        disabledKeys={disabled ? archiveVersions : []}
        onAction={(key) => onDownload(key as ArchiveVersion)}
      >
        {archiveVersions.map((version) => (
          <Dropdown.Item
            key={version}
            id={version}
            textValue={versionLabels[version]}
            className="group min-h-11 gap-3 rounded-lg px-2.5 text-sm"
          >
            {versionLabels[version]}
            <Download
              size={15}
              aria-hidden
              className="ml-auto text-muted opacity-0 group-hover:opacity-100 group-data-[focused=true]:opacity-100"
            />
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </>
  );
}

export function ArchiveMenu({
  disabled,
  pending,
  onDownload,
  separator,
}: ArchiveMenuProps & { separator: boolean }) {
  return (
    <Dropdown>
      <Button
        data-testid="library-archive-trigger"
        aria-label="打包下载"
        isIconOnly
        variant="tertiary"
        className="size-11 min-h-11 min-w-11 rounded-lg p-0"
        isDisabled={disabled}
        isPending={pending}
      >
        {separator ? <ButtonGroup.Separator /> : null}
        <FolderDown size={18} aria-hidden />
      </Button>
      <Dropdown.Popover
        placement="bottom end"
        offset={8}
        className="min-w-52 overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-xl dark:bg-surface"
      >
        <ArchiveVersionMenu
          disabled={disabled || pending}
          onDownload={onDownload}
        />
      </Dropdown.Popover>
    </Dropdown>
  );
}
