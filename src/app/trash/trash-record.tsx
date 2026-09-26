'use client';

import { Button } from '@heroui/react/button';
import { ArrowLeft } from 'lucide-react';
import { Alert } from '@heroui/react/alert';
import { AccessDisclosure } from '../../components/library/access-disclosure';
import {
  initialPreview,
  PreviewImage,
} from '../../components/library/detail-preview';
import type { LibraryDetail } from '../../server/library/detail-types';
import {
  bytesLabel,
  processingLabels,
  stepLabels,
} from '../../components/library/detail-labels';

export function TrashRecord({
  record,
  onBack,
}: {
  record: LibraryDetail;
  onBack: () => void;
}) {
  const preview = record.versions.find(
    (version) => version.kind === initialPreview(record),
  );
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
      className="grid min-w-0 max-w-300 gap-5 [overflow-wrap:anywhere]"
    >
      <Button
        variant="outline"
        className="min-h-11 justify-self-start rounded-lg px-3 text-sm"
        aria-label="返回回收站列表"
        onPress={onBack}
      >
        <ArrowLeft size={16} aria-hidden />
        返回
      </Button>
      <h1
        id="trash-record-title"
        tabIndex={-1}
        className="text-[28px] font-medium md:text-[30px]"
      >
        回收记录
      </h1>
      <p>
        {record.displayName} · {record.trashedAt ? '已回收' : '已恢复'}
      </p>
      <AccessDisclosure label="仅管理员可见">
        <p>预览仅登录的管理员可见，原有外链仍不可访问。</p>
        <p>
          恢复后保留原 ID 和链接，内容访问遵循原可见性、处理结果和存储状态。
        </p>
      </AccessDisclosure>
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,3fr)]">
        {preview ? (
          <PreviewImage
            key={`${record.id}:${preview.previewPath}`}
            version={preview}
            name={record.displayName}
            width={record.width}
            height={record.height}
          />
        ) : null}
        <dl className="min-w-0 py-2">
          {rows.map(([label, value, note]) => (
            <div
              key={label}
              className="min-h-18 pb-4 text-sm md:flex md:items-start md:gap-2 md:py-5"
            >
              <dt className="shrink-0">{label}</dt>
              <dd className="min-w-0">
                <span>{value}</span>
                <span aria-hidden>{' · '}</span>
                <span>{note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
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
