'use client';

import { Card } from '@heroui/react/card';
import { TextField } from '@heroui/react/textfield';
import { Input } from '@heroui/react/input';
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
  value: StorageFormInput;
  storage?: StorageSummary;
  storageRoot: string;
  locked: boolean;
  busy: boolean;
  errors: Record<string, string>;
  onChange: (value: StorageFormInput) => void;
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
      <Label
        className={`${lockedLocal ? 'text-sm' : 'text-[13px]'} font-normal ${readOnly && !lockedLocal ? 'text-muted' : ''}`}
      >
        {label}
        {readOnly ? (lockedLocal ? ' · 只读' : '（只读）') : ''}
      </Label>
      <Input
        type={
          name === 'secretKey' || name === 'accessKey' ? 'password' : 'text'
        }
        autoComplete={
          name === 'secretKey' || name === 'accessKey' ? 'new-password' : 'off'
        }
        placeholder={placeholder}
        className={`h-11 w-full border border-border text-base font-normal shadow-none min-[1200px]:text-sm ${lockedLocal ? 'rounded-lg pl-9 pr-3 min-[1200px]:h-10' : 'rounded-xl px-3.5'} ${readOnly ? 'bg-default/80 text-muted' : 'bg-background'}`}
      />
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
        <div className="grid gap-1.5">
          {field('name', '存储名称')}
          <p className="text-xs text-muted">可修改名称，不移动已有文件。</p>
        </div>
        <TextField value="本地存储" isReadOnly className="gap-1.5">
          <Label className="text-sm font-normal">存储类型 · 只读</Label>
          <Input className="h-11 w-full rounded-lg border border-border bg-default/80 pl-9 pr-3 text-base font-normal text-muted shadow-none min-[1200px]:h-10 min-[1200px]:text-sm" />
          <p className="text-xs text-muted">存在引用时不能切换为 S3。</p>
        </TextField>
        <div className="grid gap-1.5">
          {field('localPath', '相对路径', undefined, true)}
          <p className="text-xs text-muted">存在引用时不能更改物理位置。</p>
        </div>
        <Select
          aria-label="启用此存储"
          name="enabled"
          value={value.enabled ? 'enabled' : 'disabled'}
          isDisabled={busy}
          onChange={(next) =>
            onChange({ ...value, enabled: next === 'enabled' })
          }
          className="gap-1.5"
        >
          <Label className="text-sm font-normal">启用状态</Label>
          <Select.Trigger className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-base font-normal shadow-none min-[1200px]:h-10 min-[1200px]:text-sm">
            <Select.Value />
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
        <p className="-mt-2.5 text-xs text-muted">
          仍可修改启停状态。停用不阻止删除与维护清理。
        </p>
        <p className="rounded-lg bg-default px-3.5 py-3 text-[13px] leading-normal text-muted">
          需要使用其他位置时新建存储。当前引用解除前不能删除此配置。
        </p>
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
              className={`h-11 min-w-0 flex-1 rounded-xl px-4 text-sm font-normal min-[1200px]:h-10 min-[1200px]:flex-none ${type === 'local' ? 'min-[1200px]:w-35' : 'min-[1200px]:w-40'}`}
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
