'use client';

import { Card } from '@heroui/react/card';
import { Alert } from '@heroui/react/alert';
import type { LibraryDetail } from '../../server/library/detail-types';
import {
  bytesLabel,
  processingLabels,
  stepLabels,
} from '../../components/library/detail-labels';

export function TrashRecord({ record }: { record: LibraryDetail }) {
  const rows = [
    ['文件记录', record.displayName, `原文件 ${bytesLabel(record.byteSize)}`],
    [
      '原位置与权限',
      record.storage.name,
      record.visibility === 'public' ? '公开' : '私有',
    ],
    [
      '处理状态',
      processingLabels[record.processingStatus],
      record.trashedAt
        ? `回收于 ${new Date(record.trashedAt).toLocaleString('zh-CN')}`
        : '记录已在图库',
    ],
    ['图片 ID', record.id, '保留原 ID 与链接'],
    [
      '关联记录',
      [
        ...record.albums.map((a) => a.name),
        ...record.tags.map((t) => t.displayName),
      ].join(' / ') || '无',
      '只保留仍存在的关系',
    ],
  ];
  return (
    <section
      data-testid="trash-detail"
      className="grid min-w-0 gap-5 [overflow-wrap:anywhere]"
    >
      <h1
        id="trash-record-title"
        tabIndex={-1}
        className="text-3xl font-medium"
      >
        回收记录
      </h1>
      <p>
        {record.displayName} · {record.trashedAt ? '已回收' : '已恢复'}
      </p>
      <p className="rounded-lg bg-default p-3 text-sm">
        回收站不显示图片内容。仅保留记录，恢复后能否访问仍取决于权限、处理结果和存储状态。
      </p>
      <Card className="gap-0 rounded-2xl border border-border bg-background p-4 shadow-none md:px-5">
        <Card.Content>
          <dl>
            {rows.map(([label, value, note]) => (
              <div
                key={label}
                className="grid gap-1 py-4 text-sm md:grid-cols-3 md:gap-4 md:py-6"
              >
                <dt>{label}</dt>
                <dd>{value}</dd>
                <dd>{note}</dd>
              </div>
            ))}
          </dl>
        </Card.Content>
      </Card>
      {!record.storage.enabled ? (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>存储已停用</Alert.Title>
            <Alert.Description>
              允许恢复记录，但内容仍不可读；不会自动启用存储。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {record.deletionStatus ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>
              {record.deletionStatus === 'cleanup_failed'
                ? '清理失败'
                : '正在永久删除'}
            </Alert.Title>
            <Alert.Description>
              图片已开始永久删除，不能恢复。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {record.activeJob ? (
        <p>
          当前任务：{stepLabels[record.activeJob.step] ?? record.activeJob.step}
        </p>
      ) : null}
      {record.latestFailedJob ? (
        <p className="whitespace-pre-wrap text-sm">
          最近处理错误：{record.latestFailedJob.error ?? '任务未记录错误详情'}
        </p>
      ) : null}
    </section>
  );
}
