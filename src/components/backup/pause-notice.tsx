'use client';
import { Link } from '@heroui/react/link';
import { Button } from '@heroui/react/button';
import { PauseCircle } from 'lucide-react';
import { useBackupActivity } from './use-backup-activity';

export function BackupPauseNotice() {
  const activity = useBackupActivity(true);
  if (activity.isError && !activity.paused)
    return (
      <div
        role="status"
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm"
      >
        <p className="min-w-0 flex-1">无法更新备份状态，请检查连接后重试。</p>
        <Button
          variant="outline"
          className="min-h-11 rounded-lg"
          onPress={() => void activity.refetch()}
        >
          重新读取
        </Button>
      </div>
    );
  if (!activity.paused) return null;
  return (
    <div
      role="status"
      data-testid="backup-pause-notice"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-accent/10 p-4 text-sm"
    >
      <PauseCircle className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">正在创建备份，暂时无法修改内容</p>
        <p className="mt-1 text-xs text-muted">
          图片浏览与外链访问不受影响，备份结束后自动恢复。
        </p>
      </div>
      <Link
        href="/settings/backup"
        className="min-h-11 basis-full pl-8 text-sm font-medium sm:basis-auto sm:pl-0"
      >
        查看备份进度
      </Link>
    </div>
  );
}
