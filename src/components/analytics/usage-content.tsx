'use client';

import { Chip } from '@heroui/react/chip';
import { Check, Clock3, Cloud, HardDrive, Pause } from 'lucide-react';
import { Link } from '@heroui/react/link';
import type { AnalyticsUsage } from './read-analytics';
import { AnalyticsSection, bytes, number, timestamp } from './presentation';

const groups = [
  ['original', '正常原图', 'bg-accent'],
  ['derived', '正常派生', 'bg-border'],
  ['recycle', '回收站', 'bg-default'],
  ['pending', '处理中／待清理', 'bg-foreground'],
] as const;
export function UsageSummary({ data }: { data: AnalyticsUsage }) {
  const unknown = data.storages.reduce(
    (sum, storage) => sum + storage.unconfirmedObjects,
    0,
  );
  return (
    <AnalyticsSection
      title={
        <span className="flex flex-wrap items-center justify-between gap-3">
          <span>存储</span>
          <Link
            href="/settings/storage"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-normal text-foreground hover:bg-default"
          >
            <HardDrive size={17} aria-hidden />
            管理存储
          </Link>
        </span>
      }
      testId="analytics-usage-summary"
    >
      {data.storages.length ? (
        <div className="grid">
          {data.storages.map((storage) => (
            <div
              key={storage.id}
              className="flex min-h-20 items-center gap-3 border-b border-border py-3"
            >
              {storage.type === 'local' ? (
                <HardDrive size={21} className="shrink-0" aria-hidden />
              ) : (
                <Cloud size={21} className="shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm wrap-anywhere">{storage.name}</p>
                <Chip
                  color={storage.enabled ? 'success' : 'default'}
                  variant="soft"
                  size="sm"
                  className={`mt-1 ${storage.enabled ? '' : 'bg-foreground/8 text-muted'}`}
                >
                  <Chip.Label>
                    {storage.enabled ? '已启用' : '已停用'}
                  </Chip.Label>
                </Chip>
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                {bytes(storage.knownBytes)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-muted">暂无存储配置</p>
      )}
      {unknown ? (
        <p className="text-sm">
          另有 {number(unknown)} 个对象待核对，总占用尚未确认。
        </p>
      ) : null}
    </AnalyticsSection>
  );
}
export function UsageContent({
  data,
  timeZone,
}: {
  data: AnalyticsUsage;
  timeZone: string;
}) {
  const total = data.storages.reduce(
    (sum, storage) => sum + storage.knownBytes,
    0,
  );
  const unknown = data.storages.reduce(
    (sum, storage) => sum + storage.unconfirmedObjects,
    0,
  );
  return (
    <div className="grid gap-5" data-testid="analytics-usage">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
        data-testid="usage-total"
      >
        <p className="text-lg font-medium">已登记 {bytes(total)}</p>
        {unknown ? (
          <Chip color="warning" variant="soft" size="sm">
            <Clock3 size={12} aria-hidden />
            <Chip.Label>总量待确认 · {number(unknown)} 个对象待核对</Chip.Label>
          </Chip>
        ) : null}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Clock3 size={14} className="shrink-0" aria-hidden />
          更新于 {timestamp(data.generatedAt, timeZone)}
        </p>
      </div>
      {data.storages.length === 0 ? (
        <p className="py-8 text-sm">暂无存储配置。</p>
      ) : (
        data.storages.map((storage) => (
          <AnalyticsSection
            key={storage.id}
            title={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 break-words">{storage.name}</span>
                <Chip
                  color={storage.enabled ? 'success' : 'default'}
                  variant="soft"
                  size="sm"
                  className={
                    storage.enabled ? '' : 'bg-foreground/8 text-muted'
                  }
                >
                  {storage.enabled ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Pause size={12} aria-hidden />
                  )}
                  <Chip.Label>
                    {storage.enabled ? '已启用' : '已停用'}
                  </Chip.Label>
                </Chip>
              </span>
            }
          >
            <div data-storage-id={storage.id} className="grid gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-lg font-medium leading-[22px]">
                  已登记 {bytes(storage.knownBytes)}
                </p>
                {storage.unconfirmedObjects ? (
                  <Chip color="warning" variant="soft" size="sm">
                    <Clock3 size={12} aria-hidden />
                    <Chip.Label>
                      {number(storage.unconfirmedObjects)} 个对象待核对
                    </Chip.Label>
                  </Chip>
                ) : null}
              </div>
              {storage.confirmationStatus === 'confirmed' &&
              storage.knownBytes > 0 ? (
                <div
                  className="flex h-3 gap-0.5 overflow-hidden"
                  role="img"
                  aria-label="已确认对象占用组成；具体字节数见下方"
                  data-testid="usage-composition"
                >
                  {groups.map(([key, , color]) =>
                    storage.groups[key] ? (
                      <span
                        key={key}
                        className={`h-3 ${color}`}
                        style={{ flex: storage.groups[key] }}
                      />
                    ) : null,
                  )}
                </div>
              ) : null}
              <dl>
                {groups.map(([key, label]) => (
                  <div
                    key={key}
                    className="flex min-h-[52px] items-center justify-between gap-3 text-sm"
                  >
                    <dt>{label}</dt>
                    <dd className="tabular-nums">
                      {bytes(storage.groups[key])}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Clock3 size={14} className="shrink-0" aria-hidden />
                {storage.confirmedAt
                  ? `最后确认 ${timestamp(storage.confirmedAt, timeZone)}`
                  : '尚无完整的最后确认时间'}
              </p>
            </div>
          </AnalyticsSection>
        ))
      )}
    </div>
  );
}
