'use client';

import type { ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { OwnerShell } from '../shell/owner-shell';
import { CorsRows } from './cors-report';
import type { StorageDetail } from './storage-api';

export function StorageReferenceView({
  shell,
  storage,
  busy,
  onReturn,
  onCleanup,
}: {
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>;
  storage: StorageDetail;
  busy: boolean;
  onReturn: () => void;
  onCleanup: () => void;
}) {
  const { counts, activeWrites } = storage.references;
  const blocked =
    activeWrites > 0 || Object.values(counts).some((count) => count > 0);
  const action =
    'h-12 flex-1 rounded-lg text-sm font-normal min-[1200px]:w-50 min-[1200px]:flex-none';
  return (
    <OwnerShell
      {...shell}
      footer={
        <>
          <Button
            variant="outline"
            className={action}
            isDisabled={busy}
            onPress={onCleanup}
          >
            查看清理状态
          </Button>
          <Link
            href="/trash"
            className={`${action} flex items-center justify-center bg-accent text-accent-foreground no-underline`}
          >
            前往回收站
          </Link>
        </>
      }
    >
      <section
        data-testid="storage-reference-view"
        className="grid gap-5 pb-10 [overflow-wrap:anywhere]"
      >
        <Button
          variant="ghost"
          className="-my-[13px] min-h-11 justify-self-start px-0 text-xs font-normal"
          onPress={onReturn}
        >
          ← 返回存储配置
        </Button>
        <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
          {blocked ? '暂时不能删除此存储' : '当前没有存储引用'}
        </h1>
        <p className="text-[13px]">
          {storage.name}
          {blocked ? '仍有图片、上传或清理引用' : '当前引用已解除'}
        </p>
        <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
          {blocked
            ? '先完成各项处理，再返回检查。不同分类可能关联同一图片，数量不要求相加等于图片数。没有强制删除入口。'
            : '引用为空不代表已核对整个存储。删除配置时仍由服务器检查受管对象和扫描结果。'}
        </p>
        <CorsRows
          rows={[
            {
              label: '图片与版本',
              value: `${counts.images ?? 0} 张 / ${counts.versions ?? 0} 个`,
              detail: '包含正常、失败、处理中及回收站',
            },
            {
              label: '未结束上传',
              value: `${counts.uploads ?? 0} 个会话`,
              detail: `本地活动写入 ${activeWrites} 项；有效签名本身不单独阻塞`,
            },
            {
              label: '处理与删除任务',
              value: `处理 ${counts.jobs ?? 0} 项 / 删除清理 ${counts.cleanupJobs ?? 0} 项`,
              detail: '包含排队、重试和失败清理，分类可能重叠',
            },
            {
              label: '测试与受管对象',
              value: `${counts.probes ?? 0} 个探测 / ${counts.orphans ?? 0} 个孤儿 / ${counts.objects ?? 0} 个对象`,
              detail: '等待探测清理收尾及受管对象维护',
            },
          ]}
        />
      </section>
    </OwnerShell>
  );
}
