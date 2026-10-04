'use client';

import { Card } from '@heroui/react/card';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import {
  Folder,
  Globe,
  HardDrive,
  KeyRound,
  MapPin,
  Power,
  Tag,
} from 'lucide-react';
import { StorageTip } from './storage-tip';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Switch } from '@heroui/react/switch';
import { Button } from '@heroui/react/button';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import type { StorageSummary } from './storage-api';
import {
  storageFormConfigChanged,
  type StorageFormInput,
} from './storage-form-utils';

export function StorageForm({
  value,
  storage,
  storageRoot,
  locked,
  busy,
  errors,
  onChange,
  onSubmit,
}: {
  value: StorageFormInput & { isDefault: boolean };
  storage?: StorageSummary;
  storageRoot: string;
  locked: boolean;
  busy: boolean;
  errors: Record<string, string>;
  onChange: (value: StorageFormInput & { isDefault: boolean }) => void;
  onSubmit: () => void;
}) {
  const s3 = value.type === 's3';
  const lockedLocal = locked && !s3;
  const configChanged = storageFormConfigChanged(value, storage);
  const canEnable =
    !s3 ||
    Boolean(
      storage?.hasAccessKey &&
      storage.hasSecretKey &&
      storage.connectionStatus === 'passed' &&
      storage.connectionRevision === storage.configRevision &&
      !configChanged,
    );
  const field = (
    name:
      | 'name'
      | 'localPath'
      | 'endpoint'
      | 'region'
      | 'bucket'
      | 'pathPrefix'
      | 'accessKey'
      | 'secretKey',
    label: string,
    placeholder?: string,
    readOnly = false,
    tip?: string,
  ) => (
    <TextField
      name={name}
      value={value[name]}
      onChange={(next) => onChange({ ...value, [name]: next })}
      isDisabled={busy}
      isReadOnly={readOnly}
      isInvalid={Boolean(errors[name])}
      validationBehavior="aria"
      className={`min-w-0 ${lockedLocal ? 'gap-1.5' : 'gap-2'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label
          className={`${lockedLocal ? 'text-sm' : 'text-[13px]'} font-normal ${readOnly && !lockedLocal ? 'text-muted' : ''}`}
        >
          {label}
          {readOnly ? ' · 只读' : ''}
        </Label>
        {tip ? <StorageTip label={label}>{tip}</StorageTip> : null}
      </div>
      <InputGroup
        className={`h-11 w-full border border-border shadow-none ${lockedLocal ? 'rounded-lg min-[1200px]:h-10 min-[1200px]:min-h-10' : 'rounded-xl'} ${readOnly ? 'bg-default/80' : 'bg-background'}`}
      >
        <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
          {name === 'name' ? (
            <Tag className="size-4" aria-hidden="true" />
          ) : name === 'endpoint' ? (
            <Globe className="size-4" aria-hidden="true" />
          ) : name === 'region' ? (
            <MapPin className="size-4" aria-hidden="true" />
          ) : name === 'bucket' ? (
            <HardDrive className="size-4" aria-hidden="true" />
          ) : name === 'accessKey' || name === 'secretKey' ? (
            <KeyRound className="size-4" aria-hidden="true" />
          ) : (
            <Folder className="size-4" aria-hidden="true" />
          )}
        </InputGroup.Prefix>
        <InputGroup.Input
          type={
            name === 'secretKey' || name === 'accessKey' ? 'password' : 'text'
          }
          autoComplete={
            name === 'secretKey' || name === 'accessKey'
              ? 'new-password'
              : 'off'
          }
          placeholder={placeholder}
          className={`h-full min-w-0 py-0 pl-0 pr-3 text-base font-normal min-[1200px]:text-sm ${readOnly ? 'text-muted' : ''}`}
        />
      </InputGroup>
      <FieldError>{errors[name]}</FieldError>
    </TextField>
  );
  const toggle = (
    name: 'enabled' | 'isDefault' | 'forcePathStyle',
    label: string,
    disabled = false,
  ) => (
    <div className="flex min-w-0 items-center justify-between gap-4 min-[1200px]:flex-col min-[1200px]:items-start min-[1200px]:gap-2">
      <span className="text-[13px]">{label}</span>
      <Switch
        aria-label={label}
        isSelected={
          name === 'enabled' && s3 && configChanged ? false : value[name]
        }
        isDisabled={busy || disabled}
        onChange={(next) => onChange({ ...value, [name]: next })}
        className="[--switch-control-bg:var(--border)] [--switch-control-bg-checked:var(--accent)] [--switch-control-bg-checked-hover:var(--accent)]"
      >
        <Switch.Content className="min-h-11 gap-3">
          <Switch.Control className="h-6 w-11">
            <Switch.Thumb className="size-5 bg-white" />
          </Switch.Control>
          <Label className="text-[13px] font-normal">
            {name === 'enabled' && s3 && configChanged
              ? '已关闭'
              : value[name]
                ? '已开启'
                : '已关闭'}
          </Label>
        </Switch.Content>
      </Switch>
    </div>
  );
  if (lockedLocal)
    return (
      <form
        id="storage-form"
        data-testid="storage-form"
        className="grid w-full max-w-190 gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {field(
          'name',
          '存储名称',
          undefined,
          false,
          '修改名称不会移动已有文件。',
        )}
        <TextField value="本地存储" isReadOnly className="gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-normal">存储类型 · 只读</Label>
            <StorageTip label="存储类型">
              此存储已有引用，不能切换类型。使用 S3 时请新建存储。
            </StorageTip>
          </div>
          <InputGroup className="h-11 w-full rounded-lg border border-border bg-default/80 shadow-none min-[1200px]:h-10 min-[1200px]:min-h-10">
            <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
              <HardDrive className="size-4" aria-hidden="true" />
            </InputGroup.Prefix>
            <InputGroup.Input className="h-full min-w-0 py-0 pl-0 pr-3 text-base font-normal text-muted min-[1200px]:text-sm" />
          </InputGroup>
        </TextField>
        {field(
          'localPath',
          '相对路径',
          undefined,
          true,
          '此位置仍被图片、上传或清理任务使用。更换目录请新建存储，已有文件不会移动。',
        )}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label id="storage-enabled-label" className="text-sm font-normal">
              启用状态
            </Label>
            <StorageTip label="启用状态">
              停用后，访问与新上传不可用；默认选择保留，已有记录、删除与维护清理仍可管理。
            </StorageTip>
          </div>
          <Select
            aria-labelledby="storage-enabled-label"
            name="enabled"
            value={value.enabled ? 'enabled' : 'disabled'}
            isDisabled={busy}
            onChange={(next) =>
              onChange({ ...value, enabled: next === 'enabled' })
            }
          >
            <Select.Trigger className="h-11 w-full gap-2 rounded-lg border border-border bg-background px-3 text-base font-normal shadow-none min-[1200px]:h-10 min-[1200px]:text-sm">
              <Power
                className="size-4 shrink-0 text-muted"
                aria-hidden="true"
              />
              <Select.Value className="flex-1 text-left" />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[
                  { id: 'enabled', name: '已启用' },
                  { id: 'disabled', name: '已停用' },
                ].map((state) => (
                  <ListBox.Item
                    id={state.id}
                    key={state.id}
                    textValue={state.name}
                    className="min-h-11"
                  >
                    {state.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </form>
    );
  return (
    <form
      id="storage-form"
      data-testid="storage-form"
      className="grid gap-5 min-[1200px]:gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {!storage ? (
        <div
          role="group"
          aria-label="存储类型"
          className="flex gap-2 min-[1200px]:gap-3"
        >
          {(
            [
              { type: 'local', label: '本地存储' },
              { type: 's3', label: 'S3 兼容存储' },
            ] as const
          ).map(({ type, label }) => (
            <Button
              key={type}
              data-testid={`storage-type-${type}`}
              type="button"
              variant={value.type === type ? 'primary' : 'outline'}
              aria-pressed={value.type === type}
              isDisabled={busy}
              className={`h-11 min-w-0 flex-1 rounded-lg px-4 text-sm font-normal min-[1200px]:h-10 min-[1200px]:flex-none ${type === 'local' ? 'min-[1200px]:w-35' : 'min-[1200px]:w-40'}`}
              onPress={() =>
                onChange({
                  ...value,
                  type,
                  enabled: type === 'local' ? true : false,
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      <Card className="gap-5 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none min-[1200px]:gap-6 min-[1200px]:p-6">
        <h2 className="text-lg font-medium">{s3 ? '连接信息' : '存储位置'}</h2>
        <div
          className={`grid gap-5 min-[1200px]:gap-6 ${s3 ? 'min-[1200px]:grid-cols-2' : ''}`}
        >
          {field('name', '存储名称', '请输入存储名称')}
          {s3 ? (
            <>
              {field('endpoint', 'Endpoint', 'https://s3.example.com', locked)}
              {field('region', 'Region', 'auto', locked)}
              {field('bucket', 'Bucket', '请输入 Bucket 名称', locked)}
              {field(
                'accessKey',
                'Access Key ID',
                storage?.hasAccessKey
                  ? '已设置 · 留空保留'
                  : '请输入 Access Key ID',
              )}
              {field(
                'secretKey',
                'Secret Access Key',
                storage?.hasSecretKey
                  ? '已设置 · 留空保留'
                  : '请输入 Secret Access Key',
              )}
            </>
          ) : (
            field('localPath', '相对路径', 'default 或 archive/blog', locked)
          )}
        </div>
        {s3 ? (
          <>
            <hr className="border-border" />
            <h2 className="text-lg font-medium">访问方式</h2>
            <div className="grid gap-5 min-[1200px]:grid-cols-2 min-[1200px]:gap-6">
              {field('pathPrefix', 'Path Prefix', '可留空', locked)}
              {toggle('forcePathStyle', 'Path Style', locked)}
            </div>
            <p className="text-[13px] leading-normal text-muted">
              连接测试将检查写入、鉴权读取、匿名访问拒绝和删除。
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-normal text-muted break-all">
              实际目录：{storageRoot}
              {value.localPath ? `/${value.localPath}` : ''}
            </p>
            <p className="text-[13px] leading-normal">
              填写 {storageRoot} 下的相对路径，例如 default 或 archive/blog。
            </p>
          </>
        )}
        <div className="grid gap-3 min-[1200px]:flex min-[1200px]:gap-12">
          {toggle('enabled', '启用此存储', !canEnable && !storage?.enabled)}
          {!s3
            ? toggle(
                'isDefault',
                '设为默认存储',
                !value.enabled && !value.isDefault,
              )
            : null}
        </div>
        {s3 && !canEnable ? (
          <p className="text-[13px] leading-normal text-muted">
            {storage && configChanged
              ? '位置或凭据修改后将停用此存储，并使连接与直传检测失效；默认指针保留。保存后请重新测试，再手动启用。'
              : '先保存配置为停用状态，连接测试通过后再手动启用。'}
          </p>
        ) : null}
        {locked ? (
          <p className="text-[13px] leading-normal text-muted">
            有图片、上传或清理引用：位置与类型不可改。更换位置请新建配置；名称
            {s3 ? '、凭据' : ''}和启停仍可修改。
          </p>
        ) : !s3 ? (
          <p className="text-[13px] leading-normal text-muted">
            如使用其他硬盘，请先将目录挂载到 {storageRoot} 下。
          </p>
        ) : null}
      </Card>
    </form>
  );
}
