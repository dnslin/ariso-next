import {
  Circle,
  CircleCheck,
  CircleHelp,
  CircleAlert,
  Clock3,
  LoaderCircle,
} from 'lucide-react';
import { rowState, type ReprocessRow } from './batch-reprocess-state';

/** One presentation for the row, summary and failure view. */
export const reprocessStatuses = {
  unsent: {
    label: '尚未提交',
    summary: '尚未提交',
    color: 'warning',
    Icon: Circle,
    failure: false,
  },
  waiting: {
    label: '等待受理',
    summary: '等待受理',
    color: 'warning',
    Icon: Circle,
    failure: false,
  },
  unknown: {
    label: '结果待核对',
    summary: '待核对',
    color: 'warning',
    Icon: CircleHelp,
    failure: false,
  },
  queued: {
    label: '排队中',
    summary: '排队中',
    color: 'default',
    Icon: Clock3,
    failure: false,
  },
  running: {
    label: '正在处理',
    summary: '处理中',
    color: 'accent',
    Icon: LoaderCircle,
    failure: false,
  },
  succeeded: {
    label: '处理完成',
    summary: '完成',
    color: 'success',
    Icon: CircleCheck,
    failure: false,
  },
  rejected: {
    label: '未受理',
    summary: '未受理',
    color: 'warning',
    Icon: CircleAlert,
    failure: true,
  },
  failed: {
    label: '处理失败',
    summary: '处理失败',
    color: 'danger',
    Icon: CircleAlert,
    failure: true,
  },
  cancelled: {
    label: '任务已取消',
    summary: '处理失败',
    color: 'danger',
    Icon: CircleAlert,
    failure: true,
  },
} as const;

export function reprocessSummary(rows: ReprocessRow[]) {
  const counts = new Map<
    string,
    {
      label: string;
      color: (typeof reprocessStatuses)[keyof typeof reprocessStatuses]['color'];
      count: number;
    }
  >();
  for (const row of rows) {
    const status = reprocessStatuses[rowState(row)];
    const existing = counts.get(status.summary);
    if (existing) existing.count++;
    else
      counts.set(status.summary, {
        label: status.summary,
        color: status.color,
        count: 1,
      });
  }
  // Preserve the established summary order, combining failed and cancelled tasks.
  return Object.values(reprocessStatuses)
    .filter(
      (status, index, all) =>
        all.findIndex((other) => other.summary === status.summary) === index,
    )
    .flatMap((status) => {
      const count = counts.get(status.summary);
      return count ? [count] : [];
    });
}
