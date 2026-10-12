'use client';

import type { ComponentProps, MouseEvent } from 'react';
import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { Link } from '@heroui/react/link';
import {
  ArrowLeft,
  ArrowRight,
  Images,
  ListChecks,
  ScanLine,
  Upload,
} from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { StorageTip } from './storage-tip';
import type { StorageDetail } from './storage-api';

export function StorageReferenceView({
  shell,
  storage,
  busy,
  onReturn,
  onCleanup,
  onNavigate,
}: {
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>;
  storage: StorageDetail;
  busy: boolean;
  onReturn: () => void;
  onCleanup: () => void;
  onNavigate?: (event: MouseEvent<Element>, href: string) => void;
}) {
  const { counts, activeWrites } = storage.references;
  const blocked =
    activeWrites > 0 || Object.values(counts).some((count) => count > 0);
  const failedCleanup = storage.probes.filter(
    (probe) => probe.state === 'cleanup' && probe.error,
  ).length;
  const rows = [
    {
      icon: Images,
      label: '图片与版本',
      value: `${counts.images ?? 0} 张 / ${counts.versions ?? 0} 个`,
      active: (counts.images ?? 0) + (counts.versions ?? 0) > 0,
      href: '/library',
      action: '查看图片',
    },
    {
      icon: Upload,
      label: '未结束上传',
      value: `${counts.uploads ?? 0} 个会话`,
      active: (counts.uploads ?? 0) + activeWrites > 0,
      detail: activeWrites > 0 ? `本地活动写入 ${activeWrites} 项` : undefined,
      href: '/upload',
      action: '查看上传',
    },
    {
      icon: ListChecks,
      label: '处理与删除任务',
      value: `处理 ${counts.jobs ?? 0} 项 / 删除清理 ${counts.cleanupJobs ?? 0} 项`,
      active: (counts.jobs ?? 0) + (counts.cleanupJobs ?? 0) > 0,
      href: '/trash',
      action: '前往回收站',
    },
    {
      icon: ScanLine,
      label: '测试与受管对象',
      value: `${counts.probes ?? 0} 个探测 / ${counts.orphans ?? 0} 个孤儿 / ${counts.objects ?? 0} 个对象`,
      active: true,
      detail:
        failedCleanup > 0 ? `${failedCleanup} 个探测对象清理失败` : undefined,
      action: '查看清理',
    },
  ];
  return (
    <OwnerShell {...shell}>
      <section
        data-testid="storage-reference-view"
        className="grid gap-5 pb-10 [overflow-wrap:anywhere]"
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
              引用与清理
            </h1>
            <StorageTip label="引用">
              <p>
                图片与版本包含正常、失败、处理中及回收站。不同分类可能关联同一图片，数量不要求相加等于图片数。
              </p>
              <p>
                有效签名本身不单独阻塞。无引用不代表已核对整个存储，删除配置时仍会检查受管对象和扫描结果。
              </p>
            </StorageTip>
          </div>
          <Button
            variant="ghost"
            className="h-11 rounded-lg px-3 text-sm font-normal"
            onPress={onReturn}
          >
            <ArrowLeft size={18} aria-hidden />
            返回
          </Button>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">{storage.name}</span>
          <Chip
            size="sm"
            color={blocked ? 'warning' : 'default'}
            className="rounded-md"
          >
            <Chip.Label>{blocked ? '仍有引用' : '无引用'}</Chip.Label>
          </Chip>
        </div>
        <dl data-testid="storage-reference-counts">
          {rows.map(({ icon: Icon, ...row }) => (
            <div
              key={row.label}
              className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 border-b border-border py-5 min-[768px]:grid-cols-[24px_minmax(0,1fr)_auto] min-[768px]:items-center"
            >
              <Icon size={20} className="mt-0.5" aria-hidden />
              <div className="grid min-w-0 gap-2">
                <dt className="text-sm font-medium">{row.label}</dt>
                <dd className="text-base tabular-nums">{row.value}</dd>
                {row.detail ? (
                  <dd
                    className={`text-sm ${Icon === ScanLine ? 'text-danger' : 'text-warning'}`}
                  >
                    {row.detail}
                  </dd>
                ) : null}
              </div>
              {row.active ? (
                row.href ? (
                  <Link
                    href={row.href}
                    onClick={(event) => onNavigate?.(event, row.href!)}
                    className="col-start-2 flex min-h-11 items-center gap-2 justify-self-start rounded-lg px-3 text-sm no-underline min-[768px]:col-start-auto"
                  >
                    {row.action}
                    <ArrowRight size={16} aria-hidden />
                  </Link>
                ) : (
                  <Button
                    variant="ghost"
                    isDisabled={busy}
                    className="col-start-2 h-11 justify-self-start rounded-lg px-3 text-sm font-normal min-[768px]:col-start-auto"
                    onPress={onCleanup}
                  >
                    {row.action}
                    <ArrowRight size={16} aria-hidden />
                  </Button>
                )
              ) : null}
            </div>
          ))}
        </dl>
      </section>
    </OwnerShell>
  );
}
