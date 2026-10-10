'use client';

import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { toast } from '@heroui/react/toast';
import { CircleCheck } from 'lucide-react';
import { smtpSettingsInputSchema } from '../../server/identity/validation';
import {
  smtpDraft,
  smtpDraftChanged,
  smtpDraftInput,
  smtpDraftMatches,
  type SmtpDraft,
} from './smtp-draft';
import {
  readSmtpSettings,
  saveSmtpSettings,
  testSmtpSettings,
  SmtpRequestError,
  type SmtpSettings,
  type SmtpDiagnostic,
} from './smtp-request';

type PublicDraft = Omit<SmtpDraft, 'password'>;
type PendingWrite = {
  state:
    | 'unknown'
    | 'read-error'
    | 'matched'
    | 'mismatch'
    | 'password-unknown'
    | 'clear-matched';
  message: string;
} & (
  | { kind: 'save'; input: PublicDraft; passwordChanged: boolean }
  | { kind: 'clear' }
);
export type SmtpDialog = 'clear' | 'test-confirm' | 'test-result';
export type SmtpTestResult = {
  state: 'failed' | 'unknown';
  message: string;
  diagnostic?: SmtpDiagnostic;
};

const knownRejections = new Set([
  'INVALID_ACCOUNT_INPUT',
  'SMTP_CONFIGURATION_INCOMPLETE',
  'SMTP_CREDENTIALS_INCOMPLETE',
  'SMTP_NOT_CONFIGURED',
]);
const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : '邮件服务操作未完成';
const sessionError = (error: unknown) =>
  error instanceof SmtpRequestError && error.status === 401;
const rejected = (error: unknown) =>
  error instanceof SmtpRequestError &&
  error.status < 500 &&
  knownRejections.has(error.code ?? '');

function notify(title: string, description?: string, accepted = false) {
  toast(
    accepted
      ? createElement(
          'span',
          {
            'data-testid': 'smtp-test-result',
            'data-state': 'accepted',
            'data-final-receipt': 'unverified',
          },
          title,
        )
      : title,
    {
      variant: 'default',
      indicator: createElement(CircleCheck, {
        className: 'size-5',
        'aria-hidden': true,
      }),
      description,
    },
  );
}

export function useSmtpPage() {
  const [load, setLoad] = useState<'loading' | 'error' | 'ready' | 'session'>(
    'loading',
  );
  const [saved, setSaved] = useState<SmtpSettings | null>(null);
  const [draft, setDraft] = useState(() => smtpDraft(null));
  const [operation, setOperation] = useState<
    'idle' | 'saving' | 'testing' | 'reconciling'
  >('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [dialog, setDialog] = useState<SmtpDialog | null>(null);
  const [result, setResult] = useState<SmtpTestResult | null>(null);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const readAbort = useRef<AbortController | null>(null);
  const focusTarget = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (operation !== 'idle' || !focusTarget.current) return;
    const testId = focusTarget.current;
    focusTarget.current = null;
    const target = document.querySelector<HTMLElement>(
      `[data-testid="${testId}"]:not(:disabled)`,
    );
    (target ?? document.getElementById('smtp-heading'))?.focus({
      preventScroll: true,
    });
  });

  const expire = useCallback(() => {
    epoch.current++;
    readAbort.current?.abort();
    inFlight.current = false;
    setLoad('session');
    setOperation('idle');
    setDialog(null);
    setPending(null);
    setDraft((current) => ({ ...current, password: '' }));
  }, []);
  const active = (id: number) => mounted.current && id === epoch.current;
  const changed = saved
    ? smtpDraftChanged(draft, saved)
    : Boolean(
        draft.host ||
        draft.username ||
        draft.password ||
        draft.fromName ||
        draft.fromEmail,
      );

  const readCurrent = useCallback(
    async (id: number, abort: AbortController) => {
      try {
        const current = await readSmtpSettings(abort.signal);
        if (!mounted.current || id !== epoch.current) return;
        setSaved(current);
        setDraft(smtpDraft(current));
        setLoad('ready');
      } catch (error) {
        if (!mounted.current || id !== epoch.current || abort.signal.aborted)
          return;
        if (sessionError(error)) expire();
        else {
          setLoad('error');
          setMessage(failureMessage(error));
        }
      } finally {
        if (id === epoch.current) inFlight.current = false;
      }
    },
    [expire],
  );
  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const id = ++epoch.current;
    const abort = new AbortController();
    readAbort.current = abort;
    setLoad('loading');
    setMessage('');
    await readCurrent(id, abort);
  }, [readCurrent]);
  const cancelRead = useCallback(() => {
    epoch.current++;
    readAbort.current?.abort();
    inFlight.current = false;
  }, []);
  useEffect(() => {
    mounted.current = true;
    inFlight.current = true;
    const id = ++epoch.current;
    const abort = new AbortController();
    readAbort.current = abort;
    void readCurrent(id, abort);
    return () => {
      mounted.current = false;
      cancelRead();
    };
  }, [readCurrent, cancelRead]);

  function change<K extends keyof SmtpDraft>(key: K, value: SmtpDraft[K]) {
    if (load !== 'ready' || pending || inFlight.current) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setMessage('');
  }
  function closeDialog() {
    if (inFlight.current) return;
    const target = dialog === 'clear' ? 'smtp-clear' : 'smtp-test';
    setDialog(null);
    restoreFocus(target);
  }
  function restoreFocus(testId: string) {
    focusTarget.current = testId;
  }
  function openClear() {
    if (
      !inFlight.current &&
      !pending &&
      load === 'ready' &&
      saved &&
      (saved.username || saved.hasPassword)
    )
      setDialog('clear');
  }

  async function reconcile(write: PendingWrite, id: number) {
    setOperation('reconciling');
    const abort = new AbortController();
    readAbort.current = abort;
    try {
      const current = await readSmtpSettings(abort.signal);
      if (!active(id)) return;
      setSaved(current);
      let state: PendingWrite['state'];
      let text: string;
      if (
        write.kind === 'clear' &&
        current &&
        !current.username &&
        !current.hasPassword
      ) {
        state = 'clear-matched';
        text =
          '已核对：当前用户名和密码已清除。主机、端口、连接方式及发件人设置保留。';
        setDraft((value) => ({ ...value, username: '', password: '' }));
      } else if (write.kind === 'clear') {
        state = 'mismatch';
        text = '已核对：当前凭据尚未清空。未重复清除，其他未保存输入仍保留。';
      } else if (write.kind === 'save' && write.passwordChanged) {
        state = 'password-unknown';
        text = `${smtpDraftMatches({ ...write.input, password: '' }, current) ? '公开配置与输入一致。' : '公开配置与输入不一致。'}读取只能确认是否已设置密码，无法确认本次密码替换。请从当前配置重新编辑，重新输入密码后主动保存。`;
      } else if (
        write.kind === 'save' &&
        smtpDraftMatches({ ...write.input, password: '' }, current)
      ) {
        state = 'matched';
        text =
          '已核对：当前公开配置与输入一致。下次发送将使用当前保存配置，尚未发送测试邮件。';
      } else {
        state = 'mismatch';
        text =
          '已核对：当前配置与输入不一致。本次输入已保留，可保留输入继续编辑，或从当前保存配置重新编辑。';
      }
      setPending({ ...write, state, message: text });
      setDialog(null);
      restoreFocus('smtp-reload');
    } catch (error) {
      if (!active(id) || abort.signal.aborted) return;
      if (sessionError(error)) expire();
      else
        setPending({
          ...write,
          state: 'read-error',
          message: `未能读取当前设置。${failureMessage(error)}。输入已保留，请重新核对，暂不重复保存、测试或清除。`,
        });
      setDialog(null);
    }
  }
  async function check() {
    if (!pending || inFlight.current || load !== 'ready') return;
    inFlight.current = true;
    const id = ++epoch.current;
    try {
      await reconcile(pending, id);
    } finally {
      if (active(id)) {
        inFlight.current = false;
        setOperation('idle');
      }
    }
  }
  function resume(useCurrent: boolean) {
    if (
      !pending ||
      inFlight.current ||
      ['unknown', 'read-error'].includes(pending.state)
    )
      return;
    if (!useCurrent && pending.state === 'password-unknown') return;
    if (useCurrent) {
      if (pending.kind === 'clear')
        setDraft((value) => ({
          ...value,
          username: saved?.username ?? '',
          password: '',
        }));
      else setDraft(smtpDraft(saved));
    }
    setPending(null);
    setErrors({});
    setMessage('');
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>('[data-testid="smtp-host"]')
        ?.focus({ preventScroll: true }),
    );
  }
  async function write(kind: 'save' | 'clear') {
    if (
      inFlight.current ||
      pending ||
      load !== 'ready' ||
      (kind === 'save' && !changed)
    )
      return;
    const input =
      kind === 'clear'
        ? { clearCredentials: true as const }
        : smtpDraftInput(draft);
    const parsed = smtpSettingsInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      setMessage('请检查邮件设置中的字段。');
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            '[data-testid="smtp-fields"] [aria-invalid="true"]',
          )
          ?.focus({ preventScroll: true }),
      );
      return;
    }
    const feedback = {
      state: 'unknown' as const,
      message: '操作响应中断，请先读取当前设置核对结果。',
    };
    const snapshot: PendingWrite =
      kind === 'clear'
        ? { kind, ...feedback }
        : {
            kind,
            input: {
              host: draft.host,
              port: draft.port,
              mode: draft.mode,
              username: draft.username,
              fromName: draft.fromName,
              fromEmail: draft.fromEmail,
            },
            passwordChanged: !!draft.password,
            ...feedback,
          };
    inFlight.current = true;
    const id = ++epoch.current;
    setOperation('saving');
    setMessage('');
    setErrors({});
    try {
      const current = await saveSmtpSettings(parsed.data);
      if (!active(id)) return;
      setSaved(current);
      if (kind === 'clear')
        setDraft((value) => ({ ...value, username: '', password: '' }));
      else setDraft(smtpDraft(current));
      setDialog(null);
      restoreFocus('smtp-save');
      notify(
        kind === 'clear' ? 'SMTP 用户名和密码已清除' : '邮件设置已保存',
        kind === 'save' ? '下次发送即生效，尚未发送测试邮件。' : undefined,
      );
    } catch (error) {
      if (!active(id)) return;
      if (sessionError(error)) expire();
      else if (rejected(error)) {
        setMessage(failureMessage(error));
        if (error instanceof SmtpRequestError)
          setErrors(
            Object.fromEntries(
              error.fields.map(({ field, message }) => [field, message]),
            ),
          );
      } else {
        setPending(snapshot);
        await reconcile(snapshot, id);
      }
    } finally {
      if (active(id)) {
        inFlight.current = false;
        setOperation('idle');
      }
    }
  }
  async function send() {
    if (inFlight.current || pending || load !== 'ready' || !saved) return;
    inFlight.current = true;
    const id = ++epoch.current;
    setOperation('testing');
    setMessage('');
    try {
      await testSmtpSettings();
      if (!active(id)) return;
      setDialog(null);
      setResult(null);
      restoreFocus('smtp-test');
      notify(
        'SMTP 已接受测试邮件',
        '请检查当前所有者邮箱；接受不代表最终送达。',
        true,
      );
    } catch (error) {
      if (!active(id)) return;
      if (sessionError(error)) expire();
      else {
        const diagnostic =
          error instanceof SmtpRequestError ? error.diagnostic : undefined;
        setResult({
          state:
            diagnostic?.delivery === 'not-accepted' || rejected(error)
              ? 'failed'
              : 'unknown',
          message: failureMessage(error),
          diagnostic,
        });
        setDialog('test-result');
      }
    } finally {
      if (active(id)) {
        inFlight.current = false;
        setOperation('idle');
      }
    }
  }
  function test() {
    if (inFlight.current || pending || load !== 'ready' || !saved) return;
    if (smtpDraftChanged(draft, saved)) setDialog('test-confirm');
    else void send();
  }
  return {
    load,
    changed,
    saved,
    draft,
    operation,
    errors,
    message,
    pending,
    dialog,
    result,
    expire,
    reload,
    change,
    closeDialog,
    openClear,
    check,
    resume,
    save: () => write('save'),
    clear: () => write('clear'),
    test,
    send,
    busy: operation !== 'idle',
    locked: operation !== 'idle' || !!pending || load !== 'ready',
  };
}
