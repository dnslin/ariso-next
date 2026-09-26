'use client';

import { Card } from '@heroui/react/card';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';

export interface UploadSettings {
  maxFileBytes: number;
  queueLimit: number;
  defaultVisibility: 'public' | 'private';
  defaultStorageId: string | null;
  storages: { id: string; name: string; enabled: boolean }[];
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
  const available = settings.storages.some((s) => s.enabled);
  const selected = settings.storages.find((s) => s.id === storageId);
  return (
    <Card
      data-testid="upload-settings"
      className="min-w-0 gap-4 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none md:min-h-90 md:p-6"
    >
      <h2 className="text-lg font-medium">本次上传设置</h2>
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
      <p className="text-sm text-muted">
        开始上传时固定本次设置。之后添加的图片将在下次开始时使用当前设置。
      </p>
    </Card>
  );
}
