'use client';

import type { ReactNode } from 'react';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import type {
  CorsReport,
  CorsTestState,
} from '../../server/storage/cors-types';

export function CorsRows({
  rows,
}: {
  rows: { label: string; value: ReactNode; detail: ReactNode }[];
}) {
  return (
    <Card className="gap-3 rounded-2xl border border-border bg-surface px-3 py-4 shadow-none min-[1200px]:px-5">
      <dl className="grid gap-3 text-sm leading-normal">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid min-h-18 content-start gap-y-0 min-[1200px]:content-center min-[1200px]:grid-cols-3 min-[1200px]:items-center min-[1200px]:gap-4"
          >
            <dt>{row.label}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">
              {row.value}
              <span className="min-[1200px]:hidden"> · {row.detail}</span>
            </dd>
            <dd className="hidden min-w-0 [overflow-wrap:anywhere] min-[1200px]:block">
              {row.detail}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function CorsReportRows({
  report,
  state,
  busy,
}: {
  report: CorsReport | null;
  state: CorsTestState;
  busy: boolean;
}) {
  const browser =
    report?.stages.filter((s) => s.stage.startsWith('browser-')) ?? [];
  const verification = report?.stages.find((s) => s.stage === 'verify');
  const cleanup = report?.stages.find((s) => s.stage === 'delete');
  const cleaned = report !== null && !report.cleanupPending;
  const status = (value?: string) =>
    value === 'passed'
      ? '通过'
      : value === 'failed'
        ? '失败'
        : value === 'skipped'
          ? '未执行'
          : '等待执行';
  const browserFailed = browser.find((s) => s.status === 'failed');
  const browserPassed =
    browser.length === 3 && browser.every((s) => s.status === 'passed');
  return (
    <CorsRows
      rows={[
        {
          label: busy ? '浏览器上传样本' : '浏览器响应',
          value: busy ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size="sm" />
              进行中
            </span>
          ) : browserPassed ? (
            '通过'
          ) : browserFailed ? (
            '失败'
          ) : (
            '等待执行'
          ),
          detail:
            browserFailed?.error?.message ??
            (browserPassed
              ? 'PUT / GET / HEAD 可读响应'
              : '等待浏览器可读响应'),
        },
        {
          label: !busy && report && !report.passed ? '失败原因' : '服务器核验',
          value:
            !busy && report && !report.passed
              ? browserFailed
                ? '尚不能唯一确定'
                : verification?.status === 'failed'
                  ? '服务器核验失败'
                  : '测试对象清理失败'
              : status(verification?.status),
          detail:
            browserFailed && !busy
              ? `可能涉及 CORS、DNS 或网络${verification?.error ? `；服务器核验：${verification.error.message}` : ''}`
              : (verification?.error?.message ??
                (verification?.status === 'passed'
                  ? '对象内容正确'
                  : '检查对象和内容')),
        },
        {
          label: '测试对象清理',
          value: cleaned ? '已删除' : status(cleanup?.status),
          detail: cleaned
            ? '本次已知对象清理完成'
            : (cleanup?.error?.message ??
              (report?.cleanupPending ? '保留清理引用，可重试' : '检查后清理')),
        },
        ...(!busy && report?.passed
          ? [
              {
                label: '检测来源',
                value: report?.stale ? '已失效' : '配置站点',
                detail: report?.origin ?? state.origin,
              },
            ]
          : []),
      ]}
    />
  );
}
