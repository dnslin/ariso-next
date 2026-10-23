'use client';

import { Accordion } from '@heroui/react/accordion';
import { Button } from '@heroui/react/button';
import { InputGroup } from '@heroui/react/input-group';
import { TextField } from '@heroui/react/textfield';
import { Label } from '@heroui/react/label';
import { FieldError } from '@heroui/react/field-error';
import {
  Cloud,
  CircleCheck,
  CircleAlert,
  HardDrive,
  LoaderCircle,
  Globe,
  KeyRound,
  Folder,
  MapPin,
} from 'lucide-react';
import { IdentityField } from '../../../src/components/identity/identity-field';
import type { RestoreScope, RestoreTarget, TargetFields } from './restore-data';

const fields: {
  key: keyof TargetFields;
  label: string;
  placeholder: string;
}[] = [
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

export function RestoreDestinations({
  scope,
  publicUrl,
  urlError,
  targets,
  onUrl,
  onChange,
  onTest,
  onFill,
}: {
  scope: RestoreScope;
  publicUrl: string;
  urlError?: string;
  targets: RestoreTarget[];
  onUrl: (value: string) => void;
  onChange: (id: string, key: keyof TargetFields, value: string) => void;
  onTest: (id: string) => void;
  onFill: (id: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <IdentityField
        name="publicUrl"
        label="恢复后的站点地址"
        value={publicUrl}
        onChange={onUrl}
        error={urlError}
        placeholder="https://images.example.com"
        description="继续使用原域名并切换解析后，原图片链接可以沿用。"
      />
      <div className="flex items-start gap-3 rounded-xl border border-border p-4">
        <HardDrive className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">本地图库</h2>
          <p className="mt-1 text-sm text-muted">248 张 · 1.2 GB · 默认存储</p>
          <p className="mt-2 text-xs text-muted">
            恢复到新实例本地数据目录，保留原存储归属。
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-default px-2 py-1 text-xs">
          无需配置
        </span>
      </div>
      {scope === 'mixed' ? (
        <div className="grid min-w-0 gap-3">
          <div>
            <h2 className="text-base font-medium">为 S3 存储指定新位置</h2>
            <p className="mt-1 text-sm text-muted">
              使用新的存储桶或本次恢复专用的新目录，不连接仍在使用的原站目录。
            </p>
          </div>
          <Accordion defaultExpandedKeys={['travel']} className="grid gap-3">
            {targets.map((target) => (
              <Accordion.Item
                key={target.id}
                id={target.id}
                className="min-w-0 rounded-xl border border-border px-4"
              >
                <Accordion.Heading>
                  <Accordion.Trigger className="min-h-20 gap-3 py-3">
                    <Cloud className="size-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium">
                        {target.name}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted">
                        {target.images} 张 · {target.size}
                      </span>
                    </div>
                    <span
                      className={
                        'flex shrink-0 items-center gap-1 text-xs font-normal ' +
                        (target.status === 'failed'
                          ? 'text-danger'
                          : 'text-muted')
                      }
                    >
                      {target.status === 'passed' ? (
                        <CircleCheck className="size-4" aria-hidden />
                      ) : target.status === 'failed' ? (
                        <CircleAlert className="size-4" aria-hidden />
                      ) : null}
                      {target.status === 'passed'
                        ? '连接通过'
                        : target.status === 'testing'
                          ? '测试中'
                          : target.status === 'failed'
                            ? '测试失败'
                            : '待配置'}
                    </span>
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel className="min-w-0 pb-4">
                  <div className="grid min-w-0 gap-4 pt-2 sm:grid-cols-2">
                    {fields.map(({ key, label, placeholder }) => (
                      <TextField
                        key={key}
                        className={
                          'min-w-0 gap-2 ' +
                          (key === 'endpoint' || key === 'pathPrefix'
                            ? 'sm:col-span-2'
                            : '')
                        }
                        name={target.id + '-' + key}
                        value={target.fields[key]}
                        onChange={(value) => onChange(target.id, key, value)}
                        isInvalid={!!target.errors[key]}
                        isDisabled={target.status === 'testing'}
                        validationBehavior="aria"
                      >
                        <Label className="text-sm font-normal">{label}</Label>
                        <InputGroup className="h-12 min-w-0 rounded-lg border border-border bg-background shadow-none">
                          <InputGroup.Prefix className="border-0 pl-3 pr-2 text-muted">
                            {key === 'endpoint' ? (
                              <Globe className="size-4" aria-hidden />
                            ) : key === 'region' ? (
                              <MapPin className="size-4" aria-hidden />
                            ) : key.includes('Key') ? (
                              <KeyRound className="size-4" aria-hidden />
                            ) : (
                              <Folder className="size-4" aria-hidden />
                            )}
                          </InputGroup.Prefix>
                          <InputGroup.Input
                            id={target.id + '-' + key}
                            type={key.includes('Key') ? 'password' : 'text'}
                            autoComplete={
                              key.includes('Key') ? 'new-password' : 'off'
                            }
                            spellCheck={false}
                            className="h-full min-w-0 pl-0 text-base sm:text-sm"
                            placeholder={placeholder}
                          />
                        </InputGroup>
                        <FieldError>{target.errors[key]}</FieldError>
                      </TextField>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      className="min-h-11 px-2 text-xs"
                      isDisabled={target.status === 'testing'}
                      onPress={() => onFill(target.id)}
                    >
                      填入演示配置
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-lg"
                      isDisabled={target.status === 'testing'}
                      onPress={() => onTest(target.id)}
                    >
                      {target.status === 'testing' ? (
                        <LoaderCircle
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : (
                        <Cloud className="size-4" aria-hidden />
                      )}
                      测试连接
                    </Button>
                  </div>
                  {target.status === 'failed' ? (
                    <p className="mt-3 text-sm text-danger" role="alert">
                      无法连接到该存储，请检查服务地址和凭据后重试。已填写内容保留。
                    </p>
                  ) : target.status === 'passed' ? (
                    <p
                      className="mt-3 flex items-center gap-2 text-sm"
                      role="status"
                    >
                      <CircleCheck className="size-4" aria-hidden />
                      新位置可用，可以恢复图片。
                    </p>
                  ) : null}
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
          <p className="text-xs leading-relaxed text-muted">
            新位置需要重新检测跨域设置。完成恢复后，可在存储设置中继续检查。
          </p>
        </div>
      ) : null}
    </div>
  );
}
