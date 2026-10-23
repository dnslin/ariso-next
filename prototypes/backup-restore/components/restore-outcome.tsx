'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Label } from '@heroui/react/label';
import {
  CircleCheck,
  CircleAlert,
  Clock3,
  LoaderCircle,
  ArrowRight,
  LogIn,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { IdentityField } from '../../../src/components/identity/identity-field';
import type { RestorePhase, RestoreScope, RestoreTarget } from './restore-data';

export function RestoreOutcome({
  phase,
  failureKind,
  progress,
  scope,
  targets,
  onRetry,
  onEdit,
  onStop,
}: {
  phase: RestorePhase;
  failureKind: 'connection' | 'stopped';
  progress: number;
  scope: RestoreScope;
  targets: RestoreTarget[];
  onRetry: () => void;
  onEdit: () => void;
  onStop: () => void;
}) {
  const total = scope === 'mixed' ? 8.6 : 1.2;
  if (phase === 'login') return <RestoredLogin />;
  if (phase === 'ready')
    return (
      <div className="grid gap-5">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-default">
          <Clock3 className="size-7" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-medium">数据已恢复，等待重启</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            全部图片与配置已准备好。请重启新实例以启用恢复的数据，然后使用原账号登录。
          </p>
        </div>
        <div className="grid gap-3 rounded-xl border border-border p-4 text-sm">
          <p className="flex items-center gap-2">
            <CircleCheck className="size-4" aria-hidden />
            {scope === 'mixed' ? '1,248' : '248'} 张图片与全部版本已恢复
          </p>
          <p className="flex items-center gap-2">
            <CircleCheck className="size-4" aria-hidden />
            账号、相册、标签及站点配置已恢复
          </p>
          <p className="flex items-center gap-2">
            <Clock3 className="size-4" aria-hidden />
            新站点尚未启用
          </p>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          继续使用原域名时，别忘了将域名指向新服务器。新 S3
          跨域检测可在启用后完成。
        </p>
      </div>
    );
  if (phase === 'failed')
    return (
      <div className="grid gap-5">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-default">
          <CircleAlert className="size-7 text-danger" aria-hidden />
        </div>
        <div role="alert">
          <h2 className="text-xl font-medium">
            {failureKind === 'stopped' ? '恢复已停止' : '恢复未完成'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-danger">
            {failureKind === 'stopped'
              ? '本次复制已停止。'
              : scope === 'mixed'
                ? '写入“旅行照片”时连接中断。'
                : '写入本地图片时发生中断。'}
            新实例尚未启用，原站数据不受影响。
          </p>
        </div>
        <ProgressBar aria-label="中断时恢复进度" value={progress}>
          <div className="mb-2 flex justify-between text-sm">
            <Label>已复制文件</Label>
            <ProgressBar.Output />
          </div>
          <ProgressBar.Track className="h-2 rounded-full bg-default">
            <ProgressBar.Fill className="rounded-full bg-accent" />
          </ProgressBar.Track>
        </ProgressBar>
        <p className="text-sm text-muted">
          已填写的配置仍保留。检查目标存储后，可以重新执行本次恢复。
        </p>
        <div className="flex flex-wrap gap-3">
          <Button className="h-12 rounded-lg" onPress={onRetry}>
            重试恢复
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-lg"
            onPress={onEdit}
          >
            检查存储配置
          </Button>
        </div>
        <details className="border-t border-border pt-2 text-xs text-muted">
          <summary className="min-h-11 cursor-pointer py-3">
            查看本次已写入位置
          </summary>
          <ul className="grid gap-2 break-all pb-3">
            <li>本地：新实例的恢复暂存目录</li>
            {scope === 'mixed'
              ? targets.map((target) => (
                  <li key={target.id}>
                    {target.name}：{target.fields.bucket}/
                    {target.fields.pathPrefix}
                  </li>
                ))
              : null}
          </ul>
          <p className="pb-3 leading-relaxed">
            若放弃本次恢复，仅清理以上本次恢复专用位置。不会自动清空整个
            Bucket。
          </p>
        </details>
      </div>
    );
  return (
    <div className="grid gap-6" aria-live="polite">
      <div className="flex items-center gap-3">
        <LoaderCircle
          className="size-6 animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <div>
          <h2 className="text-xl font-medium">正在恢复站点</h2>
          <p className="mt-1 text-sm text-muted">
            {progress < 15
              ? '正在准备数据库与站点素材'
              : progress < 40 || scope === 'local'
                ? '正在复制本地图库'
                : progress < 75
                  ? '正在复制旅行照片'
                  : progress < 95
                    ? '正在复制作品归档'
                    : '正在核对恢复结果'}
          </p>
        </div>
      </div>
      <ProgressBar aria-label="恢复进度" value={progress}>
        <div className="mb-2 flex justify-between text-sm">
          <Label>已复制文件</Label>
          <ProgressBar.Output />
        </div>
        <ProgressBar.Track className="h-2 rounded-full bg-default">
          <ProgressBar.Fill className="rounded-full bg-accent" />
        </ProgressBar.Track>
      </ProgressBar>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {((total * progress) / 100).toFixed(1)} / {total.toFixed(1)} GB
        </span>
        <span>新站点尚未启用</span>
      </div>
      <ol className="grid gap-4 rounded-xl border border-border p-4 text-sm">
        {[
          '数据库与站点素材',
          '本地图库',
          ...(scope === 'mixed' ? ['旅行照片', '作品归档'] : []),
          '检查完整性',
        ].map((name, index, all) => {
          const finished = progress > ((index + 1) / all.length) * 100;
          return (
            <li key={name} className="flex items-center gap-3">
              {finished ? (
                <CircleCheck className="size-4" aria-hidden />
              ) : (
                <span
                  className="size-4 rounded-full border border-border"
                  aria-hidden
                />
              )}
              <span>{name}</span>
              <span className="ml-auto text-xs text-muted">
                {finished ? '已完成' : '等待完成'}
              </span>
            </li>
          );
        })}
      </ol>
      <Button
        variant="outline"
        className="h-11 w-fit rounded-lg"
        onPress={onStop}
      >
        停止恢复
      </Button>
    </div>
  );
}

function RestoredLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!email.trim() || !password) {
          setError('请填写邮箱和密码。原型可使用任意演示密码。');
          return;
        }
        router.push('/library?restored=1');
      }}
    >
      <p className="flex items-center gap-2 text-sm">
        <CircleCheck className="size-5" aria-hidden />
        恢复数据已启用，请重新登录
      </p>
      <IdentityField
        name="restored-email"
        label="邮箱"
        value={email}
        onChange={setEmail}
        icon="email"
      />
      <IdentityField
        name="restored-password"
        label="密码"
        value={password}
        onChange={(value) => {
          setPassword(value);
          setError('');
        }}
        secret
        icon="password"
        error={error}
        description="原型无需真实密码，可填写任意演示密码。"
      />
      <Button type="submit" className="h-12 w-full rounded-lg">
        <LogIn className="size-4" aria-hidden />
        登录演示图库
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </form>
  );
}
