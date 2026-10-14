import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Form } from '@heroui/react/form';
import { Modal } from '@heroui/react/modal';
import { toast } from '@heroui/react/toast';
import { Eraser, Mail, RefreshCw, Save, Send } from 'lucide-react';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../../../src/components/shell/settings-categories';
import {
  SiteLeaveDialog,
  useSiteNavigation,
} from '../../../src/components/site/site-navigation';
import { SmtpFields } from '../../../src/components/identity/smtp-fields';
import { SmtpDialog } from '../../../src/components/identity/smtp-dialog';
import { SmtpTip } from '../../../src/components/identity/smtp-tip';
import {
  smtpDraft,
  smtpDraftChanged,
  smtpDraftInput,
  type SmtpDraft,
} from '../../../src/components/identity/smtp-draft';
import type { SmtpSettings } from '../../../src/components/identity/smtp-request';
import {
  initialMediaSettings,
  type MediaSettingsInput,
} from '../../../src/server/media/validation';
import { smtpSettingsInputSchema } from '../../../src/server/identity/validation';
import {
  settingsMatch,
  validateProcessingInput,
  footerActionClass,
} from '../../../src/components/processing/model';
import { Footer, buttonClass, usePrototype } from './shared';
import { PrototypeProcessingFields } from './settings-processing';

const categories = settingsCategories.filter(({ href }) =>
  ['/settings/general', '/settings/processing', '/settings/email'].includes(
    href,
  ),
);
const initialSmtp: SmtpSettings = {
  host: 'smtp.example.com',
  port: 587,
  mode: 'starttls',
  username: 'photos',
  fromName: 'Ariso',
  fromEmail: 'photos@example.com',
  hasPassword: true,
  updatedAt: '2026-10-13T02:00:00.000Z',
};
type Operation = 'idle' | 'saving' | 'testing' | 'checking';
type Pending = 'unknown' | 'matched' | 'password-unknown' | null;

export function SettingsDemo() {
  const { href, mode, scenario } = usePrototype();
  const pathname = new URL(href, window.location.origin).pathname;
  const [processingSaved, setProcessingSaved] = useState<MediaSettingsInput>({
    ...initialMediaSettings,
  });
  const [smtpSaved, setSmtpSaved] = useState<SmtpSettings>(initialSmtp);
  return (
    <SettingsEditor
      key={`${pathname}:${mode}:${scenario}`}
      pathname={pathname}
      processingSaved={processingSaved}
      setProcessingSaved={setProcessingSaved}
      smtpSaved={smtpSaved}
      setSmtpSaved={setSmtpSaved}
    />
  );
}

function SettingsEditor({
  pathname,
  processingSaved,
  setProcessingSaved,
  smtpSaved,
  setSmtpSaved,
}: {
  pathname: string;
  processingSaved: MediaSettingsInput;
  setProcessingSaved: (value: MediaSettingsInput) => void;
  smtpSaved: SmtpSettings;
  setSmtpSaved: (value: SmtpSettings) => void;
}) {
  const { mode, scenario } = usePrototype();
  const email = pathname === '/settings/email';
  const processing = pathname === '/settings/processing';
  const [input, setInput] = useState({ ...processingSaved });
  const [draft, setDraft] = useState(() => smtpDraft(smtpSaved));
  const [operation, setOperation] = useState<Operation>('idle');
  const [pending, setPending] = useState<Pending>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [dialog, setDialog] = useState<
    'clear' | 'test-confirm' | 'test-result' | null
  >(null);
  const [testResult, setTestResult] = useState<{
    state: 'failed' | 'unknown';
    message: string;
  } | null>(null);
  const submittedPassword = useRef(false);
  const submittedClear = useRef(false);
  const submittedProcessing = useRef<MediaSettingsInput | null>(null);
  const operationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedControl = useRef<HTMLElement | null>(null);
  const dirty = email
    ? smtpDraftChanged(draft, smtpSaved)
    : processing
      ? !settingsMatch(input, processingSaved)
      : false;
  const busy = operation !== 'idle';
  const locked = busy || (email && pending !== null);
  // 只保护尚未提交的编辑；保存中及结果待核对沿用既有可离开契约。
  const navigation = useSiteNavigation(
    mode === 'after' && dirty && !busy && pending === null,
  );
  useEffect(
    () => () => {
      if (operationTimer.current) clearTimeout(operationTimer.current);
    },
    [],
  );

  function rememberControl(selector: string) {
    const area = document.querySelector<HTMLElement>(selector);
    const editable =
      'input:not([type="hidden"]),textarea,button,[role="switch"]';
    const control = area?.matches(editable)
      ? area
      : area?.querySelector<HTMLElement>(editable);
    if (control) editedControl.current = control;
  }
  function changeProcessing<K extends keyof MediaSettingsInput>(
    key: K,
    value: MediaSettingsInput[K],
  ) {
    if (locked) return;
    const switchLabel =
      key === 'compressionEnabled'
        ? '压缩版本'
        : key === 'watermarkMode'
          ? '启用水印'
          : key === 'maxEdge' && (input.maxEdge === null || value === null)
            ? '最长边限制'
            : null;
    rememberControl(
      switchLabel
        ? `[role="switch"][aria-label="${switchLabel}"]`
        : `[data-field="${key}"]`,
    );
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setMessage('');
  }
  function changeSmtp<K extends keyof SmtpDraft>(key: K, value: SmtpDraft[K]) {
    if (locked) return;
    const testId =
      key === 'fromName'
        ? 'from-name'
        : key === 'fromEmail'
          ? 'from-email'
          : key;
    rememberControl(`[data-testid="smtp-${testId}"]`);
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setMessage('');
  }
  function focusError() {
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          '[aria-invalid="true"] input, input[aria-invalid="true"], textarea[aria-invalid="true"]',
        )
        ?.focus(),
    );
  }
  function later(work: () => void) {
    operationTimer.current = setTimeout(work, scenario === 'slow' ? 2400 : 650);
  }
  function savedSmtp(clear = false): SmtpSettings {
    const publicInput = smtpDraftInput(draft);
    // 密码只驻留当前输入，不进入模拟已保存对象或浏览器存储。
    const { password, ...publicFields } = publicInput;
    return clear
      ? { ...smtpSaved, username: '', hasPassword: false }
      : {
          ...smtpSaved,
          ...publicFields,
          hasPassword: Boolean(password) || smtpSaved.hasPassword,
        };
  }
  function save(clear = false) {
    if (busy || pending || (!clear && !dirty)) return;
    const parsed = email
      ? smtpSettingsInputSchema.safeParse(smtpDraftInput(draft))
      : null;
    const validation = processing
      ? validateProcessingInput(input, 'save')
      : null;
    if (
      !clear &&
      ((parsed && !parsed.success) || (validation && !validation.value))
    ) {
      setErrors(
        parsed && !parsed.success
          ? Object.fromEntries(
              parsed.error.issues.map((issue) => [
                String(issue.path[0]),
                issue.message,
              ]),
            )
          : validation!.errors,
      );
      setMessage(
        email ? '请检查邮件设置中的字段。' : '请检查处理设置中的字段。',
      );
      focusError();
      return;
    }
    setOperation('saving');
    setMessage('');
    setErrors({});
    submittedPassword.current = !clear && Boolean(draft.password);
    submittedClear.current = clear;
    submittedProcessing.current = { ...input };
    later(() => {
      setOperation('idle');
      setDialog(null);
      if (scenario === 'error') {
        setMessage(
          email
            ? '邮件设置未保存：服务暂时不可用。当前输入已保留，请稍后重试。'
            : '处理设置未保存：服务暂时不可用。当前输入已保留，请稍后重试。',
        );
        return;
      }
      if (scenario === 'unknown') {
        setPending('unknown');
        setMessage('保存结果尚未确认，当前输入已保留。请核对已保存设置。');
        return;
      }
      if (email) {
        const saved = savedSmtp(clear);
        setSmtpSaved(saved);
        setDraft(
          clear ? { ...draft, username: '', password: '' } : smtpDraft(saved),
        );
      } else setProcessingSaved({ ...input });
      toast(
        clear
          ? 'SMTP 用户名和密码已清除'
          : email
            ? '邮件设置已保存'
            : '处理设置已保存',
        { variant: 'default' },
      );
    });
  }
  function checkSaved() {
    if (operation !== 'idle') return;
    setOperation('checking');
    later(() => {
      setOperation('idle');
      if (email) {
        const current = savedSmtp(submittedClear.current);
        setSmtpSaved(current);
        setPending(submittedPassword.current ? 'password-unknown' : 'matched');
        if (submittedClear.current)
          setDraft((current) => ({ ...current, username: '', password: '' }));
        setMessage(
          submittedClear.current
            ? '已核对：当前用户名和密码已清除。主机、端口、连接方式及发件人设置保留。'
            : submittedPassword.current
              ? '公开配置与输入一致。读取只能确认是否已设置密码，无法确认本次密码替换。请从当前配置重新编辑，重新输入密码后主动保存。'
              : '已核对：当前公开配置与输入一致。下次发送将使用当前保存配置，尚未发送测试邮件。',
        );
      } else {
        setProcessingSaved({ ...(submittedProcessing.current ?? input) });
        setPending(null);
        setMessage('');
        toast('已确认上次保存，当前输入已保留', { variant: 'default' });
      }
    });
  }
  function sendTest() {
    if (locked) return;
    setOperation('testing');
    later(() => {
      setOperation('idle');
      if (scenario === 'error' || scenario === 'unknown') {
        setTestResult({
          state: scenario === 'unknown' ? 'unknown' : 'failed',
          message:
            scenario === 'unknown'
              ? '未能确认发送结果。邮件可能已被服务器接受。'
              : '无法连接 SMTP 主机，请检查配置后重试。',
        });
        setDialog('test-result');
      } else {
        setDialog(null);
        toast('SMTP 已接受测试邮件', {
          variant: 'default',
          description: '请检查当前所有者邮箱；接受不代表最终送达。',
        });
      }
    });
  }
  const smtpEditor = {
    draft,
    saved: smtpSaved,
    locked,
    busy: operation !== 'idle',
    errors,
    change: changeSmtp,
    dialog,
    result: testResult,
    message,
    closeDialog: () => {
      if (operation === 'idle') setDialog(null);
    },
    clear: () => save(true),
    send: sendTest,
  } as ComponentProps<typeof SmtpFields>['editor'];
  const cancelNavigation = () => {
    navigation.cancel();
    requestAnimationFrame(
      () =>
        editedControl.current?.isConnected &&
        editedControl.current.focus({ preventScroll: true }),
    );
  };

  return (
    <section
      className="pb-10 [overflow-anchor:none]"
      data-testid="prototype-settings"
      data-page={email ? 'email' : processing ? 'processing' : 'general'}
      data-operation={operation}
      data-dirty={dirty}
    >
      <SettingsHeading />
      <SettingsCategories items={categories} onNavigate={navigation.navigate}>
        {(email || processing) && message ? (
          <div
            role={pending ? 'status' : 'alert'}
            className="mb-5 grid gap-3 rounded-xl border border-border p-4 text-sm"
          >
            {pending ? (
              <h3 className="font-medium">
                {operation === 'checking'
                  ? '正在核对当前设置…'
                  : pending === 'unknown'
                    ? '操作结果待核对'
                    : pending === 'matched'
                      ? '当前配置与输入一致'
                      : '密码变更无法确认'}
              </h3>
            ) : null}
            <p
              className={
                pending ? 'text-[13px] leading-5 text-muted' : 'text-danger'
              }
            >
              {message}
            </p>
            {pending ? (
              <div className="flex flex-wrap gap-3">
                {pending === 'matched' || pending === 'password-unknown' ? (
                  <Button
                    variant="outline"
                    className={buttonClass}
                    isDisabled={operation !== 'idle'}
                    onPress={() => {
                      setDraft(smtpDraft(smtpSaved));
                      setPending(null);
                      setMessage('');
                    }}
                  >
                    {pending === 'matched' ? '继续编辑' : '从当前配置重新编辑'}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className={buttonClass}
                  isDisabled={operation !== 'idle'}
                  onPress={checkSaved}
                >
                  <RefreshCw size={16} aria-hidden />
                  {email ? '重新读取设置' : '核对已保存设置'}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {processing ? (
          <Form
            id="prototype-processing-form"
            validationBehavior="aria"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <PrototypeProcessingFields
              input={input}
              change={changeProcessing}
              busy={locked}
              errors={errors}
            />
          </Form>
        ) : email ? (
          <Card className="gap-6 rounded-[20px] border border-border bg-surface p-4 shadow-none sm:p-6">
            <header className="flex items-start justify-between gap-4 max-sm:flex-col max-sm:gap-3">
              <div className="grid gap-3">
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  <Mail className="size-5 shrink-0" aria-hidden />
                  SMTP 邮件服务
                </h2>
                <p className="text-[13px] leading-normal text-muted">
                  已保存配置 · 下次发送即生效
                </p>
              </div>
              {smtpSaved.username || smtpSaved.hasPassword ? (
                <div className="flex shrink-0 items-center gap-2 max-sm:self-end">
                  <Button
                    variant="secondary"
                    isDisabled={locked}
                    onPress={() => setDialog('clear')}
                    className="h-11 gap-2 rounded-lg border border-border text-foreground"
                  >
                    <Eraser className="size-4" aria-hidden />
                    清除用户名和密码
                  </Button>
                  <SmtpTip disabled={locked} />
                </div>
              ) : null}
            </header>
            <Form
              validationBehavior="aria"
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <SmtpFields editor={smtpEditor} />
              <p className="text-[13px] leading-normal text-muted">
                编辑后请先保存，再发送测试邮件。保存无需重启，也不会自动发送邮件。
              </p>
            </Form>
          </Card>
        ) : (
          <Card className="gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none sm:p-6">
            <h2 className="text-lg font-medium">站点信息</h2>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <div className="grid gap-2">
                <dt className="text-[13px] text-muted">站点名称</dt>
                <dd>Ariso</dd>
              </div>
              <div className="grid gap-2">
                <dt className="text-[13px] text-muted">时区</dt>
                <dd>Asia/Shanghai</dd>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <dt className="text-[13px] text-muted">站点描述</dt>
                <dd>收集、整理与分享图片。</dd>
              </div>
            </dl>
          </Card>
        )}
      </SettingsCategories>
      {email || processing ? (
        <Footer>
          <Button
            variant="outline"
            className={email ? `${footerActionClass} gap-2` : footerActionClass}
            isDisabled={locked}
            onPress={() =>
              email
                ? dirty
                  ? setDialog('test-confirm')
                  : sendTest()
                : setPreview(true)
            }
          >
            {email ? <Send size={16} aria-hidden /> : null}
            {operation === 'testing'
              ? '发送中…'
              : email
                ? '发送测试邮件'
                : '预览'}
          </Button>
          <Button
            className={`${footerActionClass} gap-2`}
            isDisabled={locked || pending !== null || !dirty}
            onPress={() => save()}
          >
            {email ? <Save size={16} aria-hidden /> : null}
            {operation === 'saving' ? '保存中…' : '保存'}
          </Button>
        </Footer>
      ) : null}
      <SiteLeaveDialog
        navigation={{ ...navigation, cancel: cancelNavigation }}
        pending={false}
      />
      {email ? <SmtpDialog editor={smtpEditor} /> : null}
      <Modal isOpen={preview} onOpenChange={setPreview}>
        <Modal.Backdrop isDismissable>
          <Modal.Container className="p-4">
            <Modal.Dialog
              className="max-h-[calc(100dvh-32px)] w-full max-w-120 gap-4 overflow-auto rounded-xl border border-border bg-surface p-6"
              aria-label="当前参数预览"
            >
              <Modal.Header>
                <Modal.Heading className="text-xl font-medium">
                  当前参数预览
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-3 text-sm leading-6">
                <p>预览使用当前未保存的参数，返回后仍可继续编辑。</p>
                <dl className="grid grid-cols-2 gap-3">
                  <dt className="text-muted">压缩版本</dt>
                  <dd>{input.compressionEnabled ? '已开启' : '已关闭'}</dd>
                  <dt className="text-muted">输出格式</dt>
                  <dd>{input.outputFormat.toUpperCase()}</dd>
                  <dt className="text-muted">质量</dt>
                  <dd>{input.quality}</dd>
                  <dt className="text-muted">水印文字</dt>
                  <dd className="wrap-anywhere">
                    {input.watermarkMode === 'off'
                      ? '未启用'
                      : input.watermarkText || '尚未填写'}
                  </dd>
                </dl>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  className={`${buttonClass} w-full`}
                  onPress={() => setPreview(false)}
                >
                  返回设置
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}
