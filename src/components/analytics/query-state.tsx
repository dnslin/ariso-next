'use client';

import { Button } from '@heroui/react/button';
import { Alert } from '@heroui/react/alert';
import { timestamp } from './presentation';

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
