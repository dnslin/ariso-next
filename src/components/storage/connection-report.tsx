'use client';

import type {
  ConnectionReport,
  ProbeStageResult,
} from '../../server/storage/probe-types';
import { CorsRows } from './cors-report';

const stages = [
  ['configuration', 'Bucket 支持范围'],
  ['write', '写入测试对象'],
  ['read', '鉴权读取'],
  ['anonymous', '匿名读取'],
  ['delete', '删除测试对象'],
] as const;

export function connectionDiagnostic(stage: ProbeStageResult) {
  if (!stage.error) return null;
  const error = stage.error;
  return (
    <span className="grid gap-1">
      <span>{error.message}</span>
      {error.code ? <span>错误码：{error.code}</span> : null}
      {error.serviceCode ? <span>服务错误：{error.serviceCode}</span> : null}
      {error.httpStatusCode ? <span>HTTP：{error.httpStatusCode}</span> : null}
      {error.requestId ? <span>请求 ID：{error.requestId}</span> : null}
    </span>
  );
}

function stageDetail(stage: ProbeStageResult, report: ConnectionReport) {
  if (stage.stage === 'delete' && !report.cleanupPending) {
    return stage.status === 'skipped'
      ? '未尝试写入测试对象，无需删除'
      : '本次已知测试对象已清理';
  }
  if (stage.error) return connectionDiagnostic(stage);
  if (stage.status === 'skipped') return '前一步未通过，本阶段未执行';
  if (stage.status === 'pending') return '等待服务端记录结果';
  switch (stage.stage) {
    case 'configuration':
      return '按本次报告记录的支持范围检查通过';
    case 'write':
      return '成功写入小样本';
    case 'read':
      return '内容与写入一致';
    case 'anonymous':
      return '对象服务拒绝匿名访问';
    case 'delete':
      return '保留清理引用，可重试';
    default:
      return '等待执行';
  }
}

export function connectionStageRow(
  report: ConnectionReport,
  name: ProbeStageResult['stage'],
  label: string,
) {
  const stage = report.stages.find((item) => item.stage === name);
  const cleaned =
    name === 'delete' &&
    !report.cleanupPending &&
    (stage?.status === 'passed' || stage?.status === 'failed');
  return {
    label,
    value: cleaned
      ? '已删除'
      : stage?.status === 'passed'
        ? '通过'
        : stage?.status === 'failed'
          ? '失败'
          : stage?.status === 'skipped'
            ? '未执行'
            : '等待执行',
    detail: stage ? stageDetail(stage, report) : '服务端尚未记录本阶段',
  };
}

export function ConnectionReportRows({
  report,
  includeConfiguration = true,
}: {
  report: ConnectionReport;
  includeConfiguration?: boolean;
}) {
  return (
    <CorsRows
      rows={stages
        .filter(([name]) => includeConfiguration || name !== 'configuration')
        .map(([name, label]) => connectionStageRow(report, name, label))}
    />
  );
}
