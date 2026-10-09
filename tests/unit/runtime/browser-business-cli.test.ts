import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { selectBrowserPlan } from '../../../scripts/browser-plan.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function run(args: string[]) {
  const output = await mkdtemp(join(tmpdir(), 'browser-business-cli-'));
  directories.push(output);
  const traceFile = join(output, 'trace.jsonl');
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      resolve('tests/unit/runtime/fixtures/browser-cli.mjs'),
      resolve('scripts/verify-browser.mjs'),
      ...args,
    ],
    {
      env: {
        ...process.env,
        EGO_TASK_SPACE: '8',
        EGO_PAGE_LABEL: 'p1',
        BROWSER_REPORT_DIR: output,
        BROWSER_CLI_TRACE: traceFile,
      },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(
    await readFile(join(output, 'runner.json'), 'utf8'),
  );
  expect(report.status).toBe('passed');
  const events: {
    kind: string;
    script?: string;
    dataDirectory?: string;
    passwordResetPhase?: string;
    hasPasswordResetFixture?: boolean;
  }[] = (await readFile(traceFile, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return { report, events, files: await readdir(output) };
}

function expectUploadRuntime(
  events: Awaited<ReturnType<typeof run>>['events'],
  script: string,
) {
  const position = events.findIndex(
    (event) => event.script === `${script}.mjs`,
  );
  expect(position).toBeGreaterThan(0);
  expect(events[position - 1]).toEqual({
    kind: 'runtime',
    dataDirectory: events[position].dataDirectory,
  });
}

describe('actual business CLI connections without external services', () => {
  it('executes the default plan through the real default entry loop', async () => {
    const { events, report, files } = await run([]);
    const plan = selectBrowserPlan({ suite: 'full', pageLabel: 'p1' });
    const scripts = events
      .filter((event) => event.kind === 'browser')
      .map((event) => event.script);
    const plannedScripts = plan.stages.map(
      ([script]: string[]) => `${script}.mjs`,
    );
    expect(scripts.filter((script) => plannedScripts.includes(script))).toEqual(
      plannedScripts,
    );
    for (const [script, name] of plan.stages) {
      expect(scripts).toContain(`${script}.mjs`);
      expect(report.stages[name].status).toBe('passed');
      expect(files).toContain(`${name}.log`);
    }
    expect(
      events.find((event) => event.script === 'password-reset.mjs'),
    ).toMatchObject({
      hasPasswordResetFixture: true,
    });
    expect(
      events
        .filter((event) => event.kind === 'browser')
        .every((event) => event.passwordResetPhase === undefined),
    ).toBe(true);
    expectUploadRuntime(events, 'upload');
    expectUploadRuntime(events, 'upload-polling');
    expect(
      Object.keys(report.stages).filter(
        (name) => name.startsWith('upload') && name.endsWith('-runtime'),
      ),
    ).toEqual(['upload-runtime', 'upload-polling-runtime']);
  });

  it.each([
    ['upload-regression', undefined, ['upload', 'upload-polling']],
    ['upload-regression', 'main', ['upload']],
    ['upload-settings', undefined, []],
    ['upload-input', undefined, []],
    ['upload', undefined, []],
    ['password-reset', undefined, []],
    ['password-reset', 'representative', []],
    ['password-reset', 'interactions', []],
    ['password-reset', 'recovery', []],
    ['smtp', undefined, []],
  ] as const)(
    'executes focused %s/%s through the real CLI',
    async (suite, only, isolated) => {
      const { events, report, files } = await run([
        '--suite',
        suite,
        ...(only ? ['--only', only] : []),
      ]);
      const plan = selectBrowserPlan({ suite, only, pageLabel: 'p1' });
      for (const event of events.filter((item) => item.kind === 'browser')) {
        expect(event.hasPasswordResetFixture).toBe(suite === 'password-reset');
        expect(event.passwordResetPhase).toBe(
          suite === 'password-reset' ? only : undefined,
        );
      }
      expect(
        events
          .filter((event) => event.kind === 'browser')
          .map((event) => event.script),
      ).toEqual(plan.stages.map(([script]: string[]) => `${script}.mjs`));
      expect(
        Object.keys(report.stages).filter((name) => name.endsWith('-runtime')),
      ).toEqual(isolated.map((script) => `${script}-runtime`));
      expect(events.filter((event) => event.kind === 'runtime')).toHaveLength(
        1 + isolated.length,
      );
      for (const script of isolated) expectUploadRuntime(events, script);
      for (const [script, result] of plan.stages) {
        expect(report[result]).toBe('passed');
        expect(files).toContain(`${script}.log`);
      }
    },
  );
});
