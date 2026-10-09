'use client';

import type { AnalyticsUsage } from './read-analytics';
import {
  AnalyticsCard,
  AnalyticsLink,
  bytes,
  number,
  timestamp,
} from './presentation';

const groups = [
  ['original', '正常原图', 'bg-accent'],
  ['derived', '正常派生', 'bg-border'],
  ['recycle', '回收站', 'bg-default'],
  ['pending', '处理中／待清理', 'bg-foreground'],
] as const;
export function UsageSummary({
  data,
  usageUrl,
}: {
  data: AnalyticsUsage;
  usageUrl: string;
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
    <AnalyticsCard
      title={`当前存储占用 · 已登记 ${bytes(total)}`}
      testId="analytics-usage-summary"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {groups.map(([key, label]) => (
          <p key={key}>
            {label}{' '}
            {bytes(
              data.storages.reduce(
                (sum, storage) => sum + storage.groups[key],
                0,
              ),
            )}
          </p>
        ))}
      </div>
      {unknown ? (
        <p className="text-sm">
          另有 {number(unknown)} 个对象待核对，总占用尚未确认。
        </p>
      ) : null}
      <p className="text-xs text-muted">
        基于 Ariso 对象记录；与访问周期无关。
      </p>
      <AnalyticsLink href={usageUrl}>查看各存储组成</AnalyticsLink>
    </AnalyticsCard>
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
      <p className="text-[13px] text-muted" data-testid="usage-total">
        已登记 {bytes(total)}
        {unknown
          ? `，另有 ${number(unknown)} 个对象待核对，总占用尚未确认。`
          : '。'}{' '}
        更新于 {timestamp(data.generatedAt, timeZone)}。
      </p>
      {data.storages.length === 0 ? (
        <p className="py-8 text-sm">暂无存储配置。</p>
      ) : (
        data.storages.map((storage) => (
          <AnalyticsCard
            key={storage.id}
            title={`${storage.name} · ${storage.enabled ? '已启用' : '已停用'}`}
          >
            <div data-storage-id={storage.id} className="grid gap-3">
              <p className="text-lg font-medium leading-[22px]">
                已登记 {bytes(storage.knownBytes)}
                {storage.unconfirmedObjects
                  ? ` · 另有 ${number(storage.unconfirmedObjects)} 个对象待核对`
                  : ''}
              </p>
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
              <p className="text-xs text-muted">
                {storage.unconfirmedObjects
                  ? '总占用尚未确认，不绘完整比例。'
                  : '四类互斥，合计为当前已确认占用。'}
              </p>
              <p className="text-xs text-muted">
                {storage.confirmedAt
                  ? `最后确认 ${timestamp(storage.confirmedAt, timeZone)}`
                  : '尚无完整的最后确认时间'}
                ；停用不会清零。
              </p>
            </div>
          </AnalyticsCard>
        ))
      )}
      <p className="text-sm">受理永久删除后仍占空间，成功删除对象后才减少。</p>
    </div>
  );
}
