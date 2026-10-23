'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { toast } from '@heroui/react/toast';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FlaskConical,
  RotateCcw,
} from 'lucide-react';
import { PublicShell } from '../../../src/components/shell/public-shell';
import { DEMO_FILE_NAME, DEMO_PASSWORD } from './prototype-state';
import { RestoreSource } from './restore-source';
import { RestoreReview, RestoreConfirmation } from './restore-review';
import { RestoreDestinations } from './restore-destinations';
import { RestoreOutcome } from './restore-outcome';
import {
  advanceRestoreTask,
  clearRestoreTask,
  readRestoreTask,
  writeRestoreTask,
  type RestoreTask,
} from './restore-task';
import {
  demoTarget,
  initialTargets,
  restoreSteps,
  targetErrors,
  validWebAddress,
  type RestorePhase,
  type RestoreScope,
  type TargetFields,
} from './restore-data';

const formPhases: RestorePhase[] = [
  'import',
  'review',
  'destinations',
  'confirm',
];

export function RestoreScreen() {
  const [savedTask] = useState(readRestoreTask);
  const [phase, setPhase] = useState<RestorePhase>(
    savedTask?.phase ?? 'import',
  );
  const [scope, setScope] = useState<RestoreScope>(savedTask?.scope ?? 'mixed');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [fileName, setFileName] = useState(savedTask ? DEMO_FILE_NAME : '');
  const [publicUrl, setPublicUrl] = useState(savedTask?.publicUrl ?? '');
  const [targets, setTargets] = useState(() =>
    initialTargets().map((target) => {
      const destination = savedTask?.destinations.find(
        (item) => item.id === target.id,
      );
      return destination
        ? {
            ...target,
            fields: {
              ...target.fields,
              bucket: destination.bucket,
              pathPrefix: destination.pathPrefix,
            },
          }
        : target;
    }),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [versionMismatch, setVersionMismatch] = useState(false);
  const [failConnection, setFailConnection] = useState(false);
  const [failRestore, setFailRestore] = useState(
    savedTask?.failRestore ?? false,
  );
  const [failureKind, setFailureKind] = useState<'connection' | 'stopped'>(
    savedTask?.failureKind ?? 'connection',
  );
  const [progress, setProgress] = useState(savedTask?.progress ?? 0);
  const [startedAt, setStartedAt] = useState<number | null>(
    savedTask?.startedAt ?? null,
  );
  const [demoNotice, setDemoNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const testTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const saveFailed = useRef(false);
  const step = Math.max(
    0,
    formPhases.includes(phase) ? formPhases.indexOf(phase) : 3,
  );

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [phase]);
  useEffect(() => () => testTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (phase !== 'restoring' || startedAt === null) return;
    const timer = setInterval(() => {
      const task = advanceRestoreTask({
        phase: 'restoring',
        startedAt,
        progress: 0,
        scope,
        failRestore,
        failureKind: 'connection',
        publicUrl: '',
        destinations: [],
      });
      setProgress(task.progress);
      if (task.phase !== 'restoring') {
        setFailureKind(task.failureKind);
        setPhase(task.phase);
      }
    }, 550);
    return () => clearInterval(timer);
  }, [phase, failRestore, startedAt, scope]);
  useEffect(() => {
    if (startedAt === null || formPhases.includes(phase)) return;
    try {
      writeRestoreTask({
        phase: phase as RestoreTask['phase'],
        startedAt,
        progress,
        scope,
        failRestore,
        failureKind,
        publicUrl,
        destinations: targets.map(({ id, fields }) => ({
          id,
          bucket: fields.bucket,
          pathPrefix: fields.pathPrefix,
        })),
      });
    } catch (error) {
      console.error('Unable to save prototype restore progress', error);
      if (!saveFailed.current) {
        saveFailed.current = true;
        toast('浏览器未能保存恢复演示进度，刷新后可能重置。');
      }
    }
  }, [
    phase,
    startedAt,
    progress,
    scope,
    failRestore,
    failureKind,
    publicUrl,
    targets,
  ]);

  function sample(nextScope: RestoreScope = 'mixed') {
    try {
      clearRestoreTask();
    } catch (error) {
      console.error('Unable to clear prototype restore progress', error);
    }
    setStartedAt(null);
    testTimers.current.forEach(clearTimeout);
    testTimers.current = [];
    setCode('ARISO-DEMO');
    setPassword(DEMO_PASSWORD);
    setFileName(DEMO_FILE_NAME);
    setScope(nextScope);
    setTargets(initialTargets());
    setErrors({});
    setVersionMismatch(false);
    setFailConnection(false);
    setFailRestore(false);
    setPhase('import');
    setDemoNotice(
      nextScope === 'mixed'
        ? '已填入混合存储示例；不会读取或上传真实文件。'
        : '已填入纯本地示例；无需配置 S3。',
    );
  }
  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName('');
    setErrors({});
    if (file.size > 1024 * 1024) {
      setErrors({ file: '本原型只读取小型演示文件，请使用“使用示例备份”。' });
      return;
    }
    try {
      const data = JSON.parse(await file.text()) as {
        kind?: string;
        formatVersion?: number;
        scope?: string;
      };
      if (
        data.kind !== 'ariso-backup-prototype' ||
        data.formatVersion !== 1 ||
        !['local', 'mixed'].includes(data.scope ?? '')
      )
        throw new Error('demo format');
      setFileName(file.name);
      setScope(data.scope as RestoreScope);
      setTargets(initialTargets());
      setVersionMismatch(false);
    } catch {
      setErrors({
        file: '这不是本原型的示例备份。请从备份页下载演示文件，或使用下方示例。',
      });
    }
  }
  function focusField(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }
  function next(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    if (phase === 'import') {
      const validation: Record<string, string> = {};
      if (code !== 'ARISO-DEMO')
        validation.code = '初始化码不正确。演示码为 ARISO-DEMO。';
      if (!fileName) validation.file = '请先选择备份文件。';
      if (password !== DEMO_PASSWORD)
        validation.password = '备份密码不正确，请重新输入。';
      if (Object.keys(validation).length) {
        setErrors(validation);
        focusField(
          validation.code
            ? 'restore-code'
            : validation.file
              ? 'restore-file-button'
              : 'restore-password',
        );
        return;
      }
      setPassword('');
      setCode('');
      setPhase('review');
    } else if (phase === 'review' && !versionMismatch) setPhase('destinations');
    else if (phase === 'destinations') {
      if (
        !validWebAddress(publicUrl) ||
        new URL(publicUrl).pathname !== '/' ||
        new URL(publicUrl).search ||
        new URL(publicUrl).hash
      ) {
        setErrors({ url: '填写不带路径、查询参数的完整站点地址。' });
        focusField('publicUrl');
        return;
      }
      if (
        scope === 'mixed' &&
        targets.some((target) => target.status !== 'passed')
      ) {
        setErrors({ storage: '请完成每个 S3 存储的配置，并分别测试连接。' });
        return;
      }
      setPhase('confirm');
    } else if (phase === 'confirm') {
      setProgress(0);
      setStartedAt(Date.now());
      setPhase('restoring');
    }
  }
  function changeTarget(id: string, key: keyof TargetFields, value: string) {
    setTargets((items) =>
      items.map((target) =>
        target.id === id
          ? {
              ...target,
              fields: { ...target.fields, [key]: value },
              status: 'untested',
              errors: { ...target.errors, [key]: undefined },
            }
          : target,
      ),
    );
    setErrors({});
  }
  function testTarget(id: string) {
    const target = targets.find((item) => item.id === id)!;
    const validation = targetErrors(target.fields);
    if (Object.keys(validation).length) {
      setTargets((items) =>
        items.map((item) =>
          item.id === id ? { ...item, errors: validation } : item,
        ),
      );
      focusField(id + '-' + Object.keys(validation)[0]);
      return;
    }
    setTargets((items) =>
      items.map((item) =>
        item.id === id ? { ...item, status: 'testing', errors: {} } : item,
      ),
    );
    const fail = failConnection;
    setFailConnection(false);
    testTimers.current.push(
      setTimeout(
        () =>
          setTargets((items) =>
            items.map((item) =>
              item.id === id
                ? { ...item, status: fail ? 'failed' : 'passed' }
                : item,
            ),
          ),
        800,
      ),
    );
  }
  const content =
    phase === 'import' ? (
      <RestoreSource
        code={code}
        password={password}
        fileName={fileName}
        errors={errors}
        fileInput={fileInput}
        onCode={(value) => {
          setCode(value);
          setErrors({});
        }}
        onPassword={(value) => {
          setPassword(value);
          setErrors({});
        }}
        onFile={(event) => void selectFile(event)}
        onSample={sample}
      />
    ) : phase === 'review' ? (
      <RestoreReview
        scope={scope}
        fileName={fileName}
        mismatch={versionMismatch}
      />
    ) : phase === 'destinations' ? (
      <>
        <RestoreDestinations
          scope={scope}
          publicUrl={publicUrl}
          urlError={errors.url}
          targets={targets}
          onUrl={(value) => {
            setPublicUrl(value);
            setErrors({});
          }}
          onChange={changeTarget}
          onTest={testTarget}
          onFill={(id) =>
            setTargets((items) =>
              items.map((target) =>
                target.id === id ? demoTarget(target) : target,
              ),
            )
          }
        />
        {errors.storage ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {errors.storage}
          </p>
        ) : null}
      </>
    ) : phase === 'confirm' ? (
      <RestoreConfirmation
        scope={scope}
        publicUrl={publicUrl}
        targets={targets}
      />
    ) : (
      <RestoreOutcome
        phase={phase}
        failureKind={failureKind}
        progress={progress}
        scope={scope}
        targets={targets}
        onRetry={() => {
          setFailRestore(false);
          setProgress(0);
          setStartedAt(Date.now());
          setPhase('restoring');
        }}
        onEdit={() => setPhase('destinations')}
        onStop={() => {
          setFailureKind('stopped');
          setPhase('failed');
        }}
      />
    );

  return (
    <PublicShell layout="recovery">
      <div className="mx-auto grid min-h-dvh w-full max-w-3xl content-start gap-5 px-4 pt-20 pb-36 sm:px-6 sm:pt-24 [&_button]:scroll-mb-28 [&_input]:scroll-mb-28 [&_a]:scroll-mb-28">
        <p className="text-center font-[Caveat] text-5xl leading-[1.3]">
          Ariso
        </p>
        <section
          className="min-w-0 rounded-3xl border border-border bg-surface px-5 py-6 sm:px-8 sm:py-7"
          aria-labelledby="restore-heading"
        >
          <header className="mb-6 grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>空白实例 · 恢复站点</span>
              <span>
                {formPhases.includes(phase)
                  ? `${step + 1} / 4 · ${restoreSteps[step]}`
                  : phase === 'ready'
                    ? '等待启用'
                    : phase === 'login'
                      ? '恢复完成'
                      : phase === 'failed'
                        ? '需要处理'
                        : '正在恢复'}
              </span>
            </div>
            <h1
              id="restore-heading"
              ref={heading}
              tabIndex={-1}
              className="text-2xl leading-normal font-medium outline-none"
            >
              {phase === 'login' ? '欢迎回来' : '从备份恢复'}
            </h1>
            {formPhases.includes(phase) ? (
              <ol className="grid grid-cols-4 gap-2" aria-label="恢复步骤">
                {restoreSteps.map((label, index) => (
                  <li
                    key={label}
                    aria-current={index === step ? 'step' : undefined}
                    className="grid gap-2"
                  >
                    <div
                      className={
                        'h-1 rounded-full ' +
                        (index <= step ? 'bg-accent' : 'bg-default')
                      }
                    />
                    <span
                      className={
                        'flex items-center gap-1 text-xs ' +
                        (index === step
                          ? 'font-medium text-foreground'
                          : 'text-muted')
                      }
                    >
                      {index < step ? (
                        <Check className="size-3" aria-hidden />
                      ) : (
                        <span>{index + 1}.</span>
                      )}
                      <span
                        className={index === step ? '' : 'hidden sm:inline'}
                      >
                        {label}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </header>
          {phase === 'login' ? (
            content
          ) : (
            <form id="restore-flow" onSubmit={next} noValidate>
              {content}
            </form>
          )}
        </section>
        <details className="rounded-xl border border-border bg-surface/90 px-4 text-xs text-muted">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 py-3">
            <FlaskConical className="size-4" aria-hidden />
            恢复演示情景
          </summary>
          <div className="grid gap-3 pb-4">
            <p className="leading-relaxed">
              仅改变原型状态，不会连接 S3、解密文件或重启服务。
            </p>
            {phase === 'ready' ? (
              <Button
                variant="outline"
                className="min-h-11 w-fit rounded-lg"
                onPress={() => setPhase('login')}
              >
                <RotateCcw className="size-4" aria-hidden />
                模拟重启完成
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11 rounded-lg text-xs"
                onPress={() => sample('mixed')}
              >
                混合存储示例
              </Button>
              <Button
                variant="outline"
                className="min-h-11 rounded-lg text-xs"
                onPress={() => sample('local')}
              >
                纯本地示例
              </Button>
              {phase === 'import' ? (
                <>
                  <Button
                    variant="ghost"
                    className="min-h-11 text-xs"
                    onPress={() => {
                      sample();
                      setPassword('wrong-password');
                      setDemoNotice(
                        '已填入错误密码，点击“解密并继续”查看反馈。',
                      );
                    }}
                  >
                    密码错误
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11 text-xs"
                    onPress={() => {
                      sample();
                      setVersionMismatch(true);
                      setDemoNotice('下一步将显示版本不匹配。');
                    }}
                  >
                    版本不匹配
                  </Button>
                </>
              ) : null}
              {phase === 'review' && versionMismatch ? (
                <Button
                  variant="ghost"
                  className="min-h-11 text-xs"
                  onPress={() => setVersionMismatch(false)}
                >
                  切换为匹配版本
                </Button>
              ) : null}
              {phase === 'destinations' ? (
                <>
                  <Button
                    variant="ghost"
                    className="min-h-11 text-xs"
                    onPress={() => {
                      setPublicUrl('https://images.example.com');
                      setTargets((items) => items.map(demoTarget));
                      setDemoNotice('已填写演示目标，请分别测试连接。');
                    }}
                  >
                    填入全部演示配置
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11 text-xs"
                    onPress={() => {
                      setFailConnection(true);
                      setDemoNotice(
                        '下一次连接测试将模拟失败，再次测试可恢复。',
                      );
                    }}
                  >
                    下次连接失败
                  </Button>
                </>
              ) : null}
              {['destinations', 'confirm'].includes(phase) ? (
                <Button
                  variant="ghost"
                  className="min-h-11 text-xs"
                  aria-pressed={failRestore}
                  onPress={() => {
                    setFailRestore(!failRestore);
                    setDemoNotice(
                      !failRestore
                        ? '下一次恢复将在 60% 处模拟中断。'
                        : '已切换为正常恢复。',
                    );
                  }}
                >
                  {failRestore ? '恢复失败：已开启' : '演示恢复失败'}
                </Button>
              ) : null}
            </div>
            {demoNotice ? (
              <p className="leading-relaxed" role="status">
                {demoNotice}
              </p>
            ) : null}
          </div>
        </details>
      </div>
      {formPhases.includes(phase) ? (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 sm:px-6">
            {phase === 'import' ? (
              <Link
                href="/settings/backup"
                className="min-h-12 gap-2 text-sm text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                退出恢复
              </Link>
            ) : (
              <Button
                variant="outline"
                className="h-12 min-w-24 rounded-lg"
                onPress={() => {
                  setErrors({});
                  setPhase(formPhases[step - 1]);
                  if (phase === 'review') {
                    setCode('ARISO-DEMO');
                    setPassword('');
                  }
                }}
              >
                <ArrowLeft className="size-4" aria-hidden />
                上一步
              </Button>
            )}
            <Button
              type="submit"
              form="restore-flow"
              className="h-12 min-w-36 rounded-lg sm:min-w-44"
              isDisabled={
                (versionMismatch && phase === 'review') ||
                targets.some((target) => target.status === 'testing')
              }
            >
              {phase === 'import'
                ? '解密并继续'
                : phase === 'review'
                  ? '配置恢复位置'
                  : phase === 'destinations'
                    ? '核对恢复信息'
                    : '开始恢复'}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </footer>
      ) : null}
    </PublicShell>
  );
}
