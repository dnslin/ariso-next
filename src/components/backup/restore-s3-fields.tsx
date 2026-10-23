'use client';

import { TextField } from '@heroui/react/textfield';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import { Switch } from '@heroui/react/switch';
import { Folder, Globe, KeyRound, MapPin } from 'lucide-react';
import type { RestoreRemoteTargetInput } from '../../server/backup/restore-remote-types';
type TextKey = Exclude<keyof RestoreRemoteTargetInput, 'forcePathStyle'>;
const fields: Array<{ key: TextKey; label: string; placeholder: string }> = [
  { key: 'endpoint', label: '服务地址', placeholder: 'https://s3.example.com' },
  { key: 'region', label: '区域', placeholder: 'auto' },
  { key: 'bucket', label: 'Bucket', placeholder: '新的存储桶名称' },
  {
    key: 'pathPrefix',
    label: '恢复目录前缀（可选）',
    placeholder: 'restored/my-library',
  },
  { key: 'accessKey', label: 'Access Key', placeholder: '新的访问凭据' },
  { key: 'secretKey', label: 'Secret Key', placeholder: '新的秘密凭据' },
];

/** Connection fields only; the restore task owns saving, testing and credentials. */
export function RestoreS3Fields({
  storageId,
  value,
  credentialsConfigured,
  positionLocked = false,
  disabled,
  errors,
  onChange,
}: {
  storageId: string;
  value: RestoreRemoteTargetInput;
  credentialsConfigured: boolean;
  positionLocked?: boolean;
  disabled: boolean;
  errors: Record<string, string>;
  onChange: (value: RestoreRemoteTargetInput) => void;
}) {
  return (
    <div className="grid min-w-0 gap-4 pt-2 sm:grid-cols-2">
      {fields.map(({ key, label, placeholder }) => {
        const credential = key === 'accessKey' || key === 'secretKey';
        const saved = credential && credentialsConfigured;
        const id = `restore-${storageId}-${key}`;
        return (
          <TextField
            key={key}
            name={id}
            className={`min-w-0 gap-2 ${key === 'endpoint' || key === 'pathPrefix' ? 'sm:col-span-2' : ''}`}
            value={value[key] ?? ''}
            onChange={(next) => onChange({ ...value, [key]: next })}
            isInvalid={!!errors[key]}
            isDisabled={disabled || (positionLocked && !credential)}
            validationBehavior="aria"
          >
            <Label className="text-sm font-normal">{label}</Label>
            <InputGroup className="h-12 min-w-0 rounded-lg border border-border bg-background shadow-none">
              <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
                {key === 'endpoint' ? (
                  <Globe className="size-4" aria-hidden />
                ) : key === 'region' ? (
                  <MapPin className="size-4" aria-hidden />
                ) : credential ? (
                  <KeyRound className="size-4" aria-hidden />
                ) : (
                  <Folder className="size-4" aria-hidden />
                )}
              </InputGroup.Prefix>
              <InputGroup.Input
                id={id}
                type={credential ? 'password' : 'text'}
                autoComplete={credential ? 'new-password' : 'off'}
                spellCheck={false}
                className="h-full min-w-0 pl-0 text-base sm:text-sm"
                placeholder={saved ? '已设置 · 留空保留' : placeholder}
              />
            </InputGroup>
            <FieldError>{errors[key]}</FieldError>
          </TextField>
        );
      })}
      <div className="flex min-h-14 items-center justify-between gap-4 sm:col-span-2">
        <span className="text-sm">Path Style</span>
        <Switch
          aria-label="Path Style"
          isSelected={value.forcePathStyle}
          isDisabled={disabled || positionLocked}
          onChange={(forcePathStyle) => onChange({ ...value, forcePathStyle })}
          className="[--switch-control-bg:var(--border)] [--switch-control-bg-checked:var(--accent)] [--switch-control-bg-checked-hover:var(--accent)]"
        >
          <Switch.Content className="min-h-11 gap-3">
            <Label className="text-[13px] font-normal">
              {value.forcePathStyle ? '已开启' : '已关闭'}
            </Label>
            <Switch.Control className="h-6 w-11">
              <Switch.Thumb className="size-5 bg-white" />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>
    </div>
  );
}
