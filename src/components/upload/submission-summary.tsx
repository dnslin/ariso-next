'use client';

import type { UploadItem } from './types';

export function UploadSubmissionSummaries({
  items,
}: {
  items: readonly UploadItem[];
}) {
  const submissions = new Map(
    items.flatMap((item) =>
      item.frozenSubmission
        ? [[item.frozenSubmission.id, item.frozenSubmission] as const]
        : [],
    ),
  );
  if (!submissions.size) return null;
  return (
    <div className="grid gap-3" aria-label="已冻结的上传提交">
      {[...submissions.values()].map((submission) => (
        <div
          key={submission.id}
          data-testid="upload-frozen-submission"
          data-submission-id={submission.id}
          data-album-ids={JSON.stringify(
            submission.albums.map((item) => item.id),
          )}
          data-tag-ids={JSON.stringify(submission.tags.map((item) => item.id))}
          data-groups={JSON.stringify(submission.groups)}
          className="grid min-w-0 gap-1 rounded-lg bg-default p-3 text-[13px] leading-5 [overflow-wrap:anywhere]"
        >
          <p className="font-medium">
            第 {submission.number} 次上传 · {submission.count} 张 ·{' '}
            {submission.groups.length} 批（{submission.groups.join(' / ')}）
          </p>
          <p>
            存储：{submission.storageName} ·{' '}
            {submission.visibility === 'private' ? '私有' : '公开'}
          </p>
          <p>
            相册：
            {submission.albums.length
              ? submission.albums
                  .map((album) => `${album.name} · ${album.id}`)
                  .join('；')
              : '未选择'}
          </p>
          <p>
            标签：
            {submission.tags.length
              ? submission.tags.map((tag) => tag.name).join(' / ')
              : '未选择'}
          </p>
          <p>
            已冻结。修改下一次设置不会改变本次提交；各次提交共用最多 3
            个传输名额。
          </p>
        </div>
      ))}
    </div>
  );
}
