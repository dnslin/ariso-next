'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { publicUrlSchema } from '../../server/site/validation';
import { PublicShell } from '../shell/public-shell';
import { useRestore } from './use-restore';
import { RestoreSource } from './restore-source';
import {
  RestoreConfirmation,
  RestoreLocalTargets,
  RestoreReview,
} from './restore-review';
import { RestoreOutcome } from './restore-outcome';
import { useRestoreTargets } from './use-restore-targets';
import { RestoreRemoteTargets } from './restore-targets';

const steps = ['导入备份', '核对内容', '配置存储', '确认恢复'];
export function RestorePage() {
  const model = useRestore();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [view, setView] = useState<{ id: string; step: number } | null>(null);
  const [url, setUrl] = useState<{ id: string; value: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const job = model.job;
  const targets = useRestoreTargets(job, model);
  const cleanupPending = model.authorized && job?.cleanupPending === true;
  const configuring =
    model.authorized &&
    !cleanupPending &&
    job?.status === 'configuring' &&
    !!job.summary;
  const step = configuring ? (view?.id === job.id ? view.step : 1) : 0;
  const publicUrl = job
    ? url?.id === job.id
      ? url.value
      : (job.publicUrl ?? job.summary?.publicUrl ?? '')
    : '';
  const failedImport =
    !!job &&
    ['failed', 'interrupted'].includes(job.status) &&
    (!job.summary ||
      ['receiving', 'decrypting'].includes(job.failedPhase ?? ''));
  const importing =
    !cleanupPending &&
    (!model.authorized ||
      !job ||
      ['receiving', 'received', 'cancelled'].includes(job.status) ||
      failedImport);
  const phase = cleanupPending
    ? 'cleanup-pending'
    : importing
      ? 'import'
      : configuring
        ? steps[step]
        : (job?.status ?? 'import');
  const formVisible = importing || configuring;
  const completeFile =
    job &&
    job.status !== 'cancelled' &&
    job.uploadBytes > 0 &&
    job.receivedBytes === job.uploadBytes &&
    job.status !== 'receiving';
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [phase]);
  function focus(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }
  async function next(event: FormEvent) {
    event.preventDefault();
    if (model.busy) return;
    setErrors({});
    if (!model.authorized) {
      if (!code.trim()) {
        setErrors({ code: '请输入当前初始化码' });
        focus('restore-code');
        return;
      }
      if (await model.inspect(file, password, code.trim())) setPassword('');
      return;
    }
    if (importing) {
      const nextErrors = {
        file:
          !completeFile && (!file || file.size === 0)
            ? '请选择非空的备份文件'
            : '',
        password: !password ? '请输入备份密码' : '',
      };
      setErrors(nextErrors);
      if (nextErrors.file || nextErrors.password) {
        focus(nextErrors.file ? 'restore-file-button' : 'restore-password');
        return;
      }
      if (await model.inspect(file, password)) setPassword('');
    } else if (job && step === 1) setView({ id: job.id, step: 2 });
    else if (job && step === 2) {
      if (!targets.ready) {
        setErrors({ targets: '请先完成全部 S3 位置的连接测试' });
        return;
      }
      const parsed = publicUrlSchema.safeParse(publicUrl);
      if (!parsed.success) {
        setErrors({ publicUrl: parsed.error.issues[0].message });
        focus('publicUrl');
        return;
      }
      setUrl({ id: job.id, value: parsed.data });
      if (await model.saveSite(parsed.data)) setView({ id: job.id, step: 3 });
    } else if (step === 3 && targets.ready) await model.execute();
  }
  return (
    <PublicShell layout="recovery">
      <div
        className="mx-auto grid min-h-dvh w-full max-w-3xl content-start gap-5 px-4 pt-20 pb-36 sm:px-6 sm:pt-24 [&_button]:scroll-mb-28 [&_input]:scroll-mb-28 [&_a]:scroll-mb-28"
        data-testid="restore-screen"
        data-state={phase}
      >
        <p className="text-center font-[Caveat] text-5xl leading-[1.3]">
          Ariso
        </p>
        <section
          className="min-w-0 rounded-3xl border border-border bg-surface px-5 py-6 sm:px-8 sm:py-7"
          aria-labelledby="restore-heading"
        >
          <header className="mb-6 grid gap-3">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
              <span>空白实例 · 恢复站点</span>
              <span>
                {cleanupPending
                  ? '等待清理'
                  : formVisible
                    ? `${step + 1} / 4 · ${steps[step]}`
                    : job?.status === 'ready'
                      ? '等待启用'
                      : job?.status === 'failed' ||
                          job?.status === 'interrupted'
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
              从备份恢复
            </h1>
            {formVisible ? (
              <ol className="grid grid-cols-4 gap-2" aria-label="恢复步骤">
                {steps.map((label, index) => (
                  <li
                    key={label}
                    aria-current={index === step ? 'step' : undefined}
                    className="grid gap-2"
                  >
                    <div
                      className={`h-1 rounded-full ${index <= step ? 'bg-accent' : 'bg-default'}`}
                    />
                    <span
                      className={`flex items-center gap-1 text-xs ${index === step ? 'font-medium text-foreground' : 'text-muted'}`}
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
          {model.message ? (
            <div
              role="alert"
              className="mb-5 grid gap-3 rounded-xl border border-border p-4 text-sm"
            >
              <p className="text-danger wrap-anywhere">{model.message}</p>
              {model.authorized && job ? (
                <Button
                  variant="outline"
                  className="min-h-11 w-fit rounded-lg"
                  isDisabled={model.busy}
                  onPress={() => void model.refresh()}
                >
                  重新读取任务
                </Button>
              ) : null}
            </div>
          ) : null}
          {formVisible ? (
            <form id="restore-flow" onSubmit={next} noValidate>
              {importing ? (
                <div className="grid gap-5">
                  <RestoreSource
                    code={code}
                    password={password}
                    file={file}
                    job={model.authorized ? job : null}
                    errors={errors}
                    authorized={model.authorized}
                    busy={model.busy}
                    onCode={(value) => {
                      setCode(value);
                      setErrors({});
                    }}
                    onPassword={setPassword}
                    onFile={(value) => {
                      setFile(value);
                      setErrors({});
                    }}
                  />
                  {model.authorized ? (
                    <p className="text-xs leading-6 text-muted">
                      {model.application
                        ? `当前实例版本 ${model.application.version}。请使用相同版本创建的备份。`
                        : '当前实例缺少可用版本信息，请使用备份对应的应用版本后再恢复。'}
                    </p>
                  ) : null}
                  {model.authorized && job?.failure ? (
                    <p
                      role="alert"
                      className="text-sm leading-6 text-danger wrap-anywhere"
                    >
                      {job.failure.message}
                    </p>
                  ) : null}
                  {model.authorized && job && job.status !== 'cancelled' ? (
                    <Button
                      variant="ghost"
                      className="min-h-11 w-fit rounded-lg"
                      onPress={() => setConfirmCancel(true)}
                    >
                      放弃本次恢复并更换备份
                    </Button>
                  ) : null}
                </div>
              ) : job?.summary ? (
                step === 1 ? (
                  <RestoreReview
                    summary={job.summary}
                    fileName={file?.name ?? ''}
                  />
                ) : step === 2 ? (
                  <div className="grid gap-6">
                    <RestoreLocalTargets
                      summary={job.summary}
                      publicUrl={publicUrl}
                      error={errors.publicUrl}
                      busy={model.busy}
                      onUrl={(value) => setUrl({ id: job.id, value })}
                    />
                    <RestoreRemoteTargets
                      summary={job.summary}
                      model={targets}
                      busy={model.busy}
                    />
                    {errors.targets ? (
                      <p role="alert" className="text-sm text-danger">
                        {errors.targets}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 w-fit rounded-lg"
                      isDisabled={model.busy}
                      onPress={() => setConfirmCancel(true)}
                    >
                      放弃本次恢复
                    </Button>
                  </div>
                ) : (
                  <RestoreConfirmation
                    summary={job.summary}
                    publicUrl={publicUrl}
                    targets={job.targets}
                  />
                )
              ) : null}
            </form>
          ) : job ? (
            <div className="grid gap-6">
              <RestoreOutcome
                job={job}
                busy={model.busy}
                onRetry={() => void model.execute()}
                onCancel={() => {
                  if (job.cleanupPending) void model.cancel();
                  else setConfirmCancel(true);
                }}
                onRefresh={() => void model.refresh()}
              />
              {cleanupPending && job.summary ? (
                <RestoreRemoteTargets
                  summary={job.summary}
                  model={targets}
                  busy={model.busy}
                  cleanup
                />
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      {formVisible ? (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 sm:px-6">
            {step > 1 && job ? (
              <Button
                variant="outline"
                className="h-12 min-w-24 rounded-lg"
                isDisabled={model.busy}
                onPress={() => {
                  setErrors({});
                  setView({ id: job.id, step: step - 1 });
                }}
              >
                <ArrowLeft className="size-4" aria-hidden />
                上一步
              </Button>
            ) : step === 1 && job ? (
              <Button
                variant="outline"
                className="h-12 min-w-24 rounded-lg"
                isDisabled={model.busy}
                onPress={() => setConfirmCancel(true)}
              >
                更换备份
              </Button>
            ) : (
              <Link
                href="/setup"
                className="min-h-12 gap-2 text-sm text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                退出恢复
              </Link>
            )}
            <Button
              type="submit"
              data-testid="restore-next"
              form="restore-flow"
              className="h-12 min-w-0 gap-2 rounded-lg px-5 text-sm sm:min-w-44"
              isDisabled={
                model.busy ||
                (step >= 2 && !targets.ready) ||
                (model.authorized && importing && !model.application)
              }
            >
              {model.busy ? <Spinner size="sm" /> : null}
              {!model.authorized
                ? '解密并继续'
                : importing
                  ? model.operation === 'importing'
                    ? '正在接收文件…'
                    : '解密并继续'
                  : step === 1
                    ? '配置恢复位置'
                    : step === 2
                      ? '核对恢复信息'
                      : '开始恢复'}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </footer>
      ) : null}
      <AlertDialog.Backdrop
        isOpen={confirmCancel}
        isKeyboardDismissDisabled={model.operation === 'cancelling'}
        onOpenChange={setConfirmCancel}
      >
        <AlertDialog.Container
          placement="center"
          className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
        >
          <AlertDialog.Dialog className="max-h-[calc(100dvh_-_32px)] gap-5 overflow-y-auto rounded-xl border border-border bg-surface p-6">
            <AlertDialog.Header>
              <AlertDialog.Heading>放弃本次恢复？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="text-sm leading-6">
              <p>
                本次未启用的数据将被清理。原站数据不受影响，之后可重新导入备份。
              </p>
              {job?.targets?.length ? (
                <p className="mt-3">
                  本次写入 S3 恢复目录的文件也会清理，不影响同一 Bucket
                  的其他目录。未清理完成时会保留目标位置和重试入口。
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 rounded-lg"
                isDisabled={model.operation === 'cancelling'}
                onPress={() => setConfirmCancel(false)}
              >
                继续恢复
              </Button>
              <Button
                className="h-12 rounded-lg"
                isDisabled={model.operation === 'cancelling'}
                onPress={() => {
                  void model.cancel().then((success) => {
                    if (success) {
                      setConfirmCancel(false);
                      setFile(null);
                      setPassword('');
                    }
                  });
                }}
              >
                放弃恢复
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </PublicShell>
  );
}
