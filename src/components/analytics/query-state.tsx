'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Alert } from '@heroui/react/alert';
import { AnalyticsCard, timestamp } from './presentation';

export function AnalyticsLoading({ scope }: { scope: 'overview' | 'usage' }) {
  return (
    <Card
      className="min-w-0 gap-3 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none min-[1200px]:px-6"
      aria-busy="true"
      role="status"
      data-testid={`${scope}-loading`}
    >
      <h2 className="text-[22px] font-medium leading-8">
        {scope === 'overview' ? '首次读取统计' : '正在读取存储占用'}
      </h2>
      <p className="text-sm leading-[22px]">
        {scope === 'overview'
          ? '正在读取当前数量与已保存统计，请稍候。'
          : '正在读取当前存储占用，请稍候。'}
      </p>
    </Card>
  );
}
export function AnalyticsReadFailure({
  scope,
  error,
  old,
  fetching,
  timeZone,
  retry,
}: {
  scope: 'overview' | 'usage';
  error: Error;
  old?: string;
  fetching: boolean;
  timeZone: string;
  retry: () => void;
}) {
  return (
    <Alert
      status="danger"
      data-testid={`${scope}-${old ? 'stale' : 'error'}`}
      className="rounded-xl border border-border bg-surface p-4 text-foreground"
    >
      <Alert.Content>
        <Alert.Title>
          {old
            ? '刷新失败，正在显示旧数据'
            : scope === 'overview'
              ? '访问统计读取失败'
              : '存储占用读取失败'}
        </Alert.Title>
        <Alert.Description>
          {error.message}
          {old
            ? ` 上次更新于 ${timestamp(old, timeZone)}。`
            : ' 尚未取得数据，不能显示为零。'}
        </Alert.Description>
        <Button
          variant="outline"
          className="mt-3 h-11 rounded-lg"
          isPending={fetching}
          onPress={retry}
        >
          {scope === 'overview' ? '重试访问统计' : '重试存储占用'}
        </Button>
      </Alert.Content>
    </Alert>
  );
}
export function UsageUnavailable({
  error,
  fetching,
  retry,
}: {
  error: Error;
  fetching: boolean;
  retry: () => void;
}) {
  return (
    <AnalyticsCard title="当前存储占用" testId="usage-error">
      <p className="text-sm">{error.message}</p>
      <Button
        variant="outline"
        className="h-11 rounded-lg"
        onPress={retry}
        isPending={fetching}
      >
        重试存储占用
      </Button>
    </AnalyticsCard>
  );
}
