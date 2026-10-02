'use client';

import { useState } from 'react';
import { Card } from '@heroui/react/card';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { AlbumDialog } from '../../app/albums/dialog';
import { UploadCreateTag } from './create-tag';
import { UploadRelations } from './relations';
import { useUploadQueue } from './provider';

export interface UploadSettings {
  maxFileBytes: number;
  queueLimit: number;
  batchSize: number;
  defaultVisibility: 'public' | 'private';
  defaultStorageId: string | null;
  storages: { id: string; name: string; enabled: boolean }[];
  albums: { id: string; name: string }[];
  tags: { id: string; displayName: string }[];
}

export function UploadSettingsFields({
  settings,
  storageId,
  visibility,
  disabled,
  onStorage,
  onVisibility,
}: {
  settings: UploadSettings;
  storageId: string | null;
  visibility: 'public' | 'private';
  disabled: boolean;
  onStorage: (id: string) => void;
  onVisibility: (value: 'public' | 'private') => void;
}) {
  const {
    client,
    query,
    controller,
    chosenAlbums,
    setAlbums,
    chosenTags,
    setTags,
    expire,
  } = useUploadQueue();
  const [albumOpen, setAlbumOpen] = useState(false);
  const [albumMounted, setAlbumMounted] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const started = controller?.hasStarted ?? false;
  const available = settings.storages.some((s) => s.enabled);
  const selected = settings.storages.find((s) => s.id === storageId);
  return (
    <Card
      data-testid="upload-settings"
      className="min-w-0 gap-4 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none md:min-h-90 md:p-6"
    >
      <h2 className="text-lg font-medium">
        {started ? '下一次上传设置' : '本次上传设置'}
      </h2>
      <Select
        value={storageId}
        isDisabled={disabled || !available}
        onChange={(key) => {
          if (key !== null) onStorage(String(key));
        }}
      >
        <Label>存储位置</Label>
        <Select.Trigger className="min-h-11 rounded-lg">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {settings.storages.map((s) => (
              <ListBox.Item
                key={s.id}
                id={s.id}
                textValue={s.name}
                isDisabled={!s.enabled}
                className="min-h-11"
              >
                {s.name}
                {s.enabled ? '' : '（已停用）'}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {!available ? (
        <p role="alert" className="text-sm">
          暂无可用存储，请先配置并启用存储。
        </p>
      ) : !selected?.enabled ? (
        <p role="alert" className="text-sm">
          默认存储缺失或已停用，请明确选择可用的本地存储。
        </p>
      ) : null}
      <Select
        value={visibility}
        isDisabled={disabled}
        onChange={(key) => {
          if (key === 'public' || key === 'private') onVisibility(key);
        }}
      >
        <Label>可见性</Label>
        <Select.Trigger className="min-h-11 rounded-lg">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {[
              { id: 'public', label: '公开' },
              { id: 'private', label: '私有' },
            ].map((v) => (
              <ListBox.Item
                key={v.id}
                id={v.id}
                textValue={v.label}
                className="min-h-11"
              >
                {v.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <UploadRelations
        kind="albums"
        choices={settings.albums}
        selected={chosenAlbums}
        onChange={setAlbums}
        onCreate={() => {
          setAlbumMounted(true);
          setAlbumOpen(true);
        }}
        onRefresh={() => query.refetch()}
        loading={query.isFetching}
        error={query.error?.message ?? null}
      />
      <UploadRelations
        kind="tags"
        choices={settings.tags.map((tag) => ({
          id: tag.id,
          name: tag.displayName,
        }))}
        selected={chosenTags}
        onChange={setTags}
        onCreate={() => setTagOpen(true)}
        onRefresh={() => query.refetch()}
        loading={query.isFetching}
        error={query.error?.message ?? null}
      />
      <p className="text-sm text-muted">
        {started
          ? '这里只影响下一次开始上传。已提交的批次沿用冻结设置。'
          : '开始上传时固定本次设置。自动拆出的各批共用这些设置。'}
      </p>
      {albumMounted ? (
        <AlbumDialog
          action={{ kind: 'create' }}
          isOpen={albumOpen}
          onClose={(preserve) => {
            setAlbumOpen(false);
            if (!preserve) setAlbumMounted(false);
          }}
          onExpire={expire}
          onCheckList={async () => {
            const result = await query.refetch();
            if (result.error) throw result.error;
          }}
          onComplete={(album) => {
            if (!album) return;
            const relation = { id: album.id, name: album.name };
            client.setQueryData<UploadSettings>(
              ['upload-settings'],
              (current) =>
                current
                  ? {
                      ...current,
                      albums: [
                        ...current.albums.filter(
                          (item) => item.id !== album.id,
                        ),
                        relation,
                      ],
                    }
                  : current,
            );
            setAlbums((current) => [
              ...current.filter((item) => item.id !== album.id),
              relation,
            ]);
            setAlbumOpen(false);
            setAlbumMounted(false);
          }}
        />
      ) : null}
      {tagOpen ? (
        <UploadCreateTag
          isOpen={tagOpen}
          onClose={() => setTagOpen(false)}
          onExpire={expire}
          onComplete={(tag) => {
            client.setQueryData<UploadSettings>(
              ['upload-settings'],
              (current) =>
                current
                  ? {
                      ...current,
                      tags: [
                        ...current.tags.filter((item) => item.id !== tag.id),
                        { id: tag.id, displayName: tag.name },
                      ],
                    }
                  : current,
            );
            setTags((current) => [
              ...current.filter((item) => item.id !== tag.id),
              tag,
            ]);
            setTagOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}
