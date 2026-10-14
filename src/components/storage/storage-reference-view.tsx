'use client';

import { ComponentEntrance } from '../component-entrance';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { StorageTip } from './storage-tip';
import type { StorageDetail } from './storage-api';
import { storageReferenceDestination } from './reference-navigation';
import { StorageReferenceTasks } from './storage-reference-tasks';

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
  const libraryHref = storageReferenceDestination(storage.id, false);
  const trashHref = storageReferenceDestination(storage.id, true);
  return (
    <OwnerShell {...shell}>
      <section
        data-testid="storage-reference-view"
        className="grid gap-5 pb-10 [overflow-wrap:anywhere]"
      >
        <ComponentEntrance
          as="header"
          className="flex flex-wrap items-center justify-between gap-3"
        >
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
        </ComponentEntrance>
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
          <ReferenceRow
            icon={Images}
            label="图片与版本"
            value={`${counts.libraryImages ?? 0} 张图库图片 · ${counts.trashImages ?? 0} 张回收图片 · ${counts.versions ?? 0} 个版本`}
            delay={0.055}
          >
            {(counts.images ?? 0) + (counts.versions ?? 0) > 0 ? (
              <dd className="col-start-2 flex flex-wrap items-center gap-2 justify-self-start min-[768px]:col-start-auto">
                <Link
                  href={libraryHref}
                  isDisabled={busy}
                  onClick={(event) => onNavigate?.(event, libraryHref)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm no-underline"
                >
                  查看图库
                  <ArrowRight size={16} aria-hidden />
                </Link>
                <Link
                  href={trashHref}
                  isDisabled={busy}
                  onClick={(event) => onNavigate?.(event, trashHref)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm no-underline"
                >
                  查看回收记录
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </dd>
            ) : null}
          </ReferenceRow>
          <ReferenceRow
            icon={Upload}
            label="未结束上传"
            value={`${counts.uploads ?? 0} 个会话`}
            delay={0.11}
            detail={
              activeWrites > 0 ? (
                <dd className="text-sm text-warning">
                  本地活动写入 {activeWrites} 项
                </dd>
              ) : null
            }
          >
            {(counts.uploads ?? 0) + activeWrites > 0 ? (
              <dd className="col-start-2 justify-self-start min-[768px]:col-start-auto">
                <Link
                  href="/upload"
                  isDisabled={busy}
                  onClick={(event) => onNavigate?.(event, '/upload')}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm no-underline"
                >
                  查看上传
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </dd>
            ) : null}
          </ReferenceRow>
          <ReferenceRow
            icon={ListChecks}
            label="处理与删除任务"
            value={`处理 ${counts.jobs ?? 0} 项 / 删除清理 ${counts.cleanupJobs ?? 0} 项`}
            delay={0.165}
          >
            {(counts.jobs ?? 0) + (counts.cleanupJobs ?? 0) > 0 ? (
              <dd className="col-start-2 min-w-0 min-[768px]:col-span-2">
                <StorageReferenceTasks
                  storage={storage}
                  busy={busy}
                  onNavigate={onNavigate}
                />
              </dd>
            ) : null}
          </ReferenceRow>
          <ReferenceRow
            icon={ScanLine}
            label="测试与受管对象"
            value={`${counts.probes ?? 0} 个探测 / ${counts.orphans ?? 0} 个孤儿 / ${counts.objects ?? 0} 个对象`}
            delay={0.165}
            detail={
              failedCleanup > 0 ? (
                <dd className="text-sm text-danger">
                  {failedCleanup} 个探测对象清理失败
                </dd>
              ) : null
            }
          >
            <Button
              variant="ghost"
              isDisabled={busy}
              className="col-start-2 h-11 justify-self-start rounded-lg px-3 text-sm font-normal min-[768px]:col-start-auto"
              onPress={onCleanup}
            >
              查看清理
              <ArrowRight size={16} aria-hidden />
            </Button>
          </ReferenceRow>
        </dl>
      </section>
    </OwnerShell>
  );
}

function ReferenceRow({
  icon: Icon,
  label,
  value,
  delay,
  detail,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delay: number;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <ComponentEntrance
      delay={delay}
      className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 border-b border-border py-5 min-[768px]:grid-cols-[24px_minmax(0,1fr)_auto] min-[768px]:items-center"
    >
      <Icon size={20} className="mt-0.5" aria-hidden />
      <div className="grid min-w-0 gap-2">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="text-base tabular-nums">{value}</dd>
        {detail}
      </div>
      {children}
    </ComponentEntrance>
  );
}
