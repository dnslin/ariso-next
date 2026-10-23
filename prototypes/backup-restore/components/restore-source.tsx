'use client';

import type { ChangeEvent, RefObject } from 'react';
import { Button } from '@heroui/react/button';
import { FileArchive, Upload, CircleCheck } from 'lucide-react';
import { IdentityField } from '../../../src/components/identity/identity-field';
import type { RestoreScope } from './restore-data';

export function RestoreSource({
  code,
  password,
  fileName,
  errors,
  fileInput,
  onCode,
  onPassword,
  onFile,
  onSample,
}: {
  code: string;
  password: string;
  fileName: string;
  errors: Record<string, string>;
  fileInput: RefObject<HTMLInputElement | null>;
  onCode: (value: string) => void;
  onPassword: (value: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSample: (scope: RestoreScope) => void;
}) {
  return (
    <div className="grid gap-6">
      <IdentityField
        name="restore-code"
        label="初始化码"
        value={code}
        onChange={onCode}
        error={errors.code}
        placeholder="粘贴新实例的初始化码"
        description="在新实例的启动日志中找到初始化码。"
      />
      <section className="grid gap-2" aria-labelledby="restore-file-label">
        <h2 id="restore-file-label" className="text-sm font-normal">
          备份文件
        </h2>
        <input
          ref={fileInput}
          id="restore-file"
          type="file"
          accept=".backup,.json"
          className="sr-only"
          aria-labelledby="restore-file-label"
          onChange={onFile}
        />
        <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background px-4 py-5 text-center">
          <FileArchive className="size-8 text-muted" aria-hidden />
          {fileName ? (
            <p className="flex max-w-full items-center gap-2 break-all text-sm">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              {fileName}
            </p>
          ) : (
            <p className="text-sm text-muted">选择已经保存的整站备份文件</p>
          )}
          <Button
            id="restore-file-button"
            variant="outline"
            className="h-11 rounded-lg"
            onPress={() => fileInput.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {fileName ? '更换备份文件' : '选择备份文件'}
          </Button>
        </div>
        {errors.file ? (
          <p role="alert" className="text-sm text-danger">
            {errors.file}
          </p>
        ) : null}
      </section>
      <IdentityField
        name="restore-password"
        label="备份密码"
        value={password}
        onChange={onPassword}
        error={errors.password}
        secret
        placeholder="输入创建这份备份时设置的密码"
        description="备份密码与账号登录密码不同。"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-default/50 px-4 py-3 text-xs text-muted">
        <span>原型体验：无需真实备份或密码。</span>
        <Button
          variant="ghost"
          className="min-h-11 px-2 text-xs"
          onPress={() => onSample('mixed')}
        >
          使用示例备份
        </Button>
      </div>
    </div>
  );
}
