'use client';

import { ComponentEntrance } from '../component-entrance';
import { useState, type ReactNode } from 'react';
import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import {
  Folder,
  CheckCheck,
  Cloud,
  Copy,
  Globe,
  HardDrive,
  KeyRound,
  LockKeyhole,
  MapPin,
  Power,
  Tag,
} from 'lucide-react';
import { StorageTip } from './storage-tip';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Switch } from '@heroui/react/switch';
import { Button } from '@heroui/react/button';
import { Tooltip } from '@heroui/react/tooltip';
import { toast } from '@heroui/react/toast';
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
  const [copyError, setCopyError] = useState(false);
  const actualDirectory = `${storageRoot}${value.localPath ? `/${value.localPath}` : ''}`;
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
    tip?: ReactNode,
  ) => (
    <TextField
      name={name}
      value={value[name]}
      onChange={(next) => onChange({ ...value, [name]: next })}
      isDisabled={busy}
      isReadOnly={readOnly}
      isInvalid={Boolean(errors[name])}
      validationBehavior="aria"
      className="min-w-0 gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <Label
          className={`text-sm font-normal ${readOnly ? 'text-muted' : ''}`}
        >
          {label}
          {readOnly ? ' · 只读' : ''}
        </Label>
        {tip ? <StorageTip label={label}>{tip}</StorageTip> : null}
      </div>
      <InputGroup
        className={`h-12 w-full rounded-lg border border-border shadow-none ${readOnly ? 'bg-default/80' : 'bg-background'}`}
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
    <div className="flex min-h-20 min-w-0 items-center justify-between gap-4 border-b border-border py-3">
      <div className="flex items-center gap-3">
        {name === 'enabled' ? (
          <Power size={18} aria-hidden />
        ) : name === 'isDefault' ? (
          <CheckCheck size={18} aria-hidden />
        ) : (
          <Globe size={18} aria-hidden />
        )}
        <span className="text-sm">{label}</span>
        {name === 'enabled' ? (
          <StorageTip label="启用状态">
            停用后，访问与新上传不可用；默认选择保留，已有记录、删除与维护清理仍可管理。
          </StorageTip>
        ) : null}
      </div>
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
          <Label className="text-[13px] font-normal">
            {name === 'enabled' && s3 && configChanged
              ? '已关闭'
              : value[name]
                ? '已开启'
                : '已关闭'}
          </Label>
          <Switch.Control className="h-6 w-11">
            <Switch.Thumb className="size-5 bg-white" />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
  return (
    <form
      id="storage-form"
      data-testid="storage-form"
      className="grid w-full max-w-240 gap-6"
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
              {type === 'local' ? (
                <HardDrive size={16} aria-hidden />
              ) : (
                <Cloud size={16} aria-hidden />
              )}
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      <ComponentEntrance as="section" delay={0.055} className="grid gap-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">
            {s3 ? '连接信息' : '存储位置'}
          </h2>
          {s3 ? (
            <StorageTip label="连接测试">
              连接测试只使用已保存配置，检查写入、鉴权读取、匿名访问拒绝和删除。
            </StorageTip>
          ) : null}
        </div>
        <div className="grid gap-5">
          {field(
            'name',
            '存储名称',
            '请输入存储名称',
            false,
            '修改名称不会移动已有文件。',
          )}
          {s3 ? (
            <>
              {field('endpoint', 'Endpoint', 'https://s3.example.com', locked)}
              <div className="grid gap-5 min-[768px]:grid-cols-2">
                {field('region', 'Region', 'auto', locked)}
                {field('bucket', 'Bucket', '请输入 Bucket 名称', locked)}
              </div>
              <div className="grid gap-5 min-[768px]:grid-cols-2">
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
              </div>
            </>
          ) : (
            field(
              'localPath',
              '相对路径',
              'default 或 archive/blog',
              locked,
              <>
                <p>
                  填写存储根目录下的相对路径，例如 default 或 archive/blog。
                </p>
                <p>使用其他硬盘时，将目录挂载到存储根目录下。</p>
              </>,
            )
          )}
        </div>
        {s3 ? (
          <>
            <hr className="border-border" />
            <h2 className="text-lg font-medium">访问方式</h2>
            <div className="grid gap-5">
              {field('pathPrefix', 'Path Prefix', '可留空', locked)}
              {toggle('forcePathStyle', 'Path Style', locked)}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <span className="text-sm text-muted">实际目录</span>
              <div className="flex items-start gap-3">
                <code
                  data-testid="storage-actual-directory"
                  className="min-w-0 flex-1 select-text break-all text-sm leading-6"
                >
                  {actualDirectory}
                </code>
                <Tooltip>
                  <Button
                    type="button"
                    variant="ghost"
                    isIconOnly
                    aria-label="复制实际目录"
                    className="size-11 min-w-11 shrink-0 rounded-lg"
                    onPress={async () => {
                      setCopyError(false);
                      try {
                        await navigator.clipboard.writeText(actualDirectory);
                        toast.success('目录已复制');
                      } catch {
                        setCopyError(true);
                      }
                    }}
                  >
                    <Copy size={16} aria-hidden />
                  </Button>
                  <Tooltip.Content>复制实际目录</Tooltip.Content>
                </Tooltip>
              </div>
              {copyError ? (
                <p role="alert" className="text-sm text-danger">
                  无法自动复制，请选中上方目录文本。
                </p>
              ) : null}
            </div>
          </>
        )}
        <div className="grid border-t border-border">
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
              ? '本次保存将停用存储，并使连接与直传检测失效。保存后请重新测试并启用。'
              : '先保存配置，通过连接测试后可启用。'}
          </p>
        ) : null}
        {locked ? (
          <p className="flex items-start gap-2 text-sm leading-normal text-muted">
            <LockKeyhole size={16} className="mt-0.5 shrink-0" aria-hidden />
            仍有引用，存储位置与类型不可修改。
          </p>
        ) : null}
      </ComponentEntrance>
    </form>
  );
}
