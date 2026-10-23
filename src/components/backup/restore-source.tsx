'use client';
import { useRef } from 'react';
import { Button } from '@heroui/react/button';
import { ProgressBar } from '@heroui/react/progress-bar';
import { FileArchive, Upload, CircleCheck } from 'lucide-react';
import { IdentityField } from '../identity/identity-field';
import { bytesLabel } from '../library/detail-labels';
import type { RestoreJob } from '../../server/backup/types';

export function RestoreSource({
  code,
  password,
  file,
  job,
  errors,
  authorized,
  busy,
  onCode,
  onPassword,
  onFile,
}: {
  code: string;
  password: string;
  file: File | null;
  job: RestoreJob | null;
  errors: Record<string, string>;
  authorized: boolean;
  busy: boolean;
  onCode: (value: string) => void;
  onPassword: (value: string) => void;
  onFile: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const existing = job && job.status !== 'cancelled';
  const completeFile =
    existing &&
    job.uploadBytes > 0 &&
    job.receivedBytes === job.uploadBytes &&
    job.status !== 'receiving';
  const progress =
    existing && job.uploadBytes > 0
      ? (job.receivedBytes / job.uploadBytes) * 100
      : 0;
  return (
    <div className="grid gap-6">
      <IdentityField
        name="restore-code"
        label="初始化码"
        value={code}
        onChange={onCode}
        error={errors.code}
        isDisabled={busy || authorized}
        placeholder="粘贴新实例的初始化码"
        description="在新实例当前启动日志中找到初始化码。刷新后需重新授权，服务器上的任务仍保留。"
      />
      <section className="grid gap-2" aria-labelledby="restore-file-label">
        <h2 id="restore-file-label" className="text-sm font-normal">
          备份文件
        </h2>
        <input
          ref={input}
          id="restore-file"
          type="file"
          tabIndex={-1}
          accept=".age"
          className="sr-only"
          aria-labelledby="restore-file-label"
          disabled={busy || !!completeFile}
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-background px-4 py-5 text-center">
          <FileArchive className="size-8 text-muted" aria-hidden />
          {file || completeFile ? (
            <p className="flex max-w-full items-center gap-2 break-all text-sm">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              {file?.name ?? '已上传的备份文件'}
            </p>
          ) : (
            <p className="text-sm text-muted">选择已经保存的整站备份文件</p>
          )}
          {completeFile ? (
            <p className="text-xs text-muted">
              {bytesLabel(job.uploadBytes)} · 文件已接收，可重新输入密码解密
            </p>
          ) : (
            <Button
              id="restore-file-button"
              variant="outline"
              className="h-11 rounded-lg"
              isDisabled={busy}
              onPress={() => input.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              {file ? '更换备份文件' : '选择备份文件'}
            </Button>
          )}
        </div>
        {existing && !completeFile && job.receivedBytes > 0 ? (
          <p className="text-xs leading-5 text-muted">
            已接收 {bytesLabel(job.receivedBytes)}
            。当前页面可继续上传；刷新后重新选择文件将清空未完成部分，从头上传。
          </p>
        ) : null}
        {busy && existing ? (
          <ProgressBar aria-label="备份文件上传进度" value={progress}>
            <ProgressBar.Output />
            <ProgressBar.Track className="h-2 rounded-full">
              <ProgressBar.Fill className="rounded-full bg-accent" />
            </ProgressBar.Track>
          </ProgressBar>
        ) : null}
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
        isDisabled={busy}
        placeholder="输入创建这份备份时设置的密码"
        description="备份密码与账号登录密码不同。"
      />
    </div>
  );
}
