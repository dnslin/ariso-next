import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CorsReportRows } from '../../../src/components/storage/cors-report';
import type {
  CorsReport,
  CorsTestState,
} from '../../../src/server/storage/cors-types';

it('shows completed cleanup after a retry while retaining the failed detection evidence', () => {
  const report: CorsReport = {
    probeId: 'probe',
    storageId: 'storage',
    revision: 1,
    origin: 'https://site.example',
    passed: false,
    stale: false,
    cleanupPending: false,
    testedAt: new Date(0).toISOString(),
    stages: [
      {
        stage: 'browser-put',
        status: 'failed',
        error: { message: '浏览器未读取到成功响应' },
      },
      { stage: 'verify', status: 'passed' },
      {
        stage: 'delete',
        status: 'failed',
        error: { message: 'InitialAccessDenied' },
      },
    ],
  };
  const state: CorsTestState = {
    origin: report.origin,
    example: [],
    status: 'failed',
    report,
    probes: [],
  };
  const html = renderToStaticMarkup(
    jsx(CorsReportRows, { report, state, busy: false }),
  );
  expect(html).toContain('浏览器未读取到成功响应');
  expect(html).toContain('已删除');
  expect(html).toContain('本次已知对象清理完成');
  expect(html).not.toContain('InitialAccessDenied');
});
