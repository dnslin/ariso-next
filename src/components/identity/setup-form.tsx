'use client';

import { useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { ComboBox } from '@heroui/react/combo-box';
import { Description } from '@heroui/react/description';
import { FieldError } from '@heroui/react/field-error';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Spinner } from '@heroui/react/spinner';
import {
  setupAccountSchema,
  setupInputSchema,
} from '../../server/identity/validation';
import { timeZoneSchema } from '../../server/site/validation';
import { IdentityField } from './identity-field';

type Fields = {
  code: string;
  email: string;
  password: string;
  confirmPassword: string;
  publicUrl: string;
  timeZone: string;
};

export function SetupForm() {
  const [fields, setFields] = useState<Fields>({
    code: '',
    email: '',
    password: '',
    confirmPassword: '',
    publicUrl: '',
    timeZone: '',
  });
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zones, setZones] = useState<string[]>([]);
  const [zoneQuery, setZoneQuery] = useState('');
  const recommended = useRef(false);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  function change(name: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
  }
  function showStep(next: number, field?: string) {
    setStep(next);
    requestAnimationFrame(() => {
      if (field) document.getElementById(field)?.focus();
      else heading.current?.focus();
    });
  }
  function showErrors(issues: { field: string; message: string }[]) {
    setErrors(
      Object.fromEntries(issues.map(({ field, message }) => [field, message])),
    );
    const first = issues[0]?.field;
    showStep(
      ['code', 'email', 'password', 'confirmPassword'].includes(first) ? 1 : 2,
      first,
    );
  }
  function nextStep() {
    const parsed = setupAccountSchema.safeParse(fields);
    if (!parsed.success) {
      showErrors(
        parsed.error.issues.map((issue) => ({
          field: String(issue.path[0]),
          message: issue.message,
        })),
      );
      return;
    }
    if (!recommended.current) {
      let zone = '';
      try {
        const parsedZone = timeZoneSchema.safeParse(
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        if (parsedZone.success) zone = parsedZone.data;
      } catch {
        /* 无浏览器推荐时保持未选，由用户选择。 */
      }
      setZones([
        ...new Set([
          'UTC',
          ...Intl.supportedValuesOf('timeZone'),
          ...(zone ? [zone] : []),
        ]),
      ]);
      setFields((current) => ({
        ...current,
        email: parsed.data.email,
        publicUrl: window.location.origin,
        timeZone: zone,
      }));
      setZoneQuery(zone);
      recommended.current = true;
    }
    setErrors({});
    showStep(2);
  }
  async function checkResult() {
    if (inFlight.current) return;
    setReviewing(false);
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/auth/get-session', {
        cache: 'no-store',
      });
      const body = await response.json();
      if (response.ok && (body === null || body?.user))
        window.location.replace('/login?setup=completed');
      else if (response.status === 409 && body.code === 'SETUP_REQUIRED') {
        setUnknown(false);
        setMessage('已核对：初始化尚未完成。请检查填写内容后重新提交。');
      } else throw new Error(`状态核对失败（HTTP ${response.status}）`);
    } catch (error) {
      setMessage(
        `仍无法确认初始化结果，请稍后再次核对。${error instanceof Error ? error.message : ''}`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (inFlight.current || unknown) return;
    const parsed = setupInputSchema.safeParse(fields);
    if (!parsed.success) {
      showErrors(
        parsed.error.issues.map((issue) => ({
          field: String(issue.path[0]),
          message: issue.message,
        })),
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (
        (response.ok && body.code === 'SETUP_COMPLETED') ||
        body.code === 'SETUP_ALREADY_COMPLETED'
      ) {
        window.location.replace('/login?setup=completed');
      } else if (
        response.status === 401 &&
        body.code === 'INVALID_SETUP_CODE'
      ) {
        showErrors([
          {
            field: 'code',
            message: '初始化码无效，请从当前容器启动日志复制最新的码。',
          },
        ]);
      } else if (
        response.status === 400 &&
        body.code === 'INVALID_SETUP_INPUT' &&
        body.fields
      ) {
        showErrors(body.fields);
      } else {
        setUnknown(true);
        setReviewing(false);
        setMessage(
          `初始化未完成或结果未知（HTTP ${response.status}）。请先核对结果；服务错误可查看容器日志。`,
        );
      }
    } catch (error) {
      setUnknown(true);
      setReviewing(false);
      setMessage(
        `连接中断，无法确认初始化结果。填写内容仍在当前页面，请先核对结果。${error instanceof Error ? error.message : ''}`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const alias = timeZoneSchema.safeParse(zoneQuery);
  const options = [
    ...new Set([
      ...zones.filter((zone) =>
        zone.toLowerCase().includes(zoneQuery.toLowerCase()),
      ),
      ...(alias.success ? [alias.data] : []),
    ]),
  ];
  const items = options.map((id) => ({ id }));

  const showingResult = unknown && !reviewing;
  return (
    <div className="grid w-full max-w-[520px] gap-5">
      <p className="text-center font-[Caveat] text-5xl leading-[1.5]">Ariso</p>
      <section
        className="grid gap-4 rounded-3xl border border-border bg-surface px-5 py-6 md:px-7"
        aria-labelledby="setup-heading"
      >
        <header className="grid gap-2">
          <p className="text-xs leading-[1.5] text-muted">
            {showingResult
              ? '结果待核对'
              : `${step} / 2 · ${step === 1 ? '创建账号' : '设置站点'}`}
          </p>
          <h1
            id="setup-heading"
            ref={heading}
            tabIndex={-1}
            className="text-2xl leading-[1.5] font-medium"
          >
            {showingResult
              ? '初始化结果待确认'
              : step === 1
                ? '欢迎使用 Ariso'
                : '让图片有自己的地址'}
          </h1>
          <p className="text-sm leading-[1.5] text-muted">
            {showingResult
              ? '连接中断或保存失败。请重试，我们会先检查是否已经完成。'
              : step === 1
                ? '先设置你的管理账号。完成下一步后，账号才会创建。'
                : '确认公开地址与时区，然后完成初始化。'}
          </p>
        </header>
        {message && !showingResult ? (
          <Alert status="warning" role="alert">
            <Alert.Content>
              <Alert.Description>{message}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        <Form
          className="grid min-w-0 gap-4"
          validationBehavior="aria"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 1) nextStep();
            else if (!unknown) void submit();
          }}
        >
          {showingResult ? (
            <Alert
              status="warning"
              role="alert"
              className="rounded-none bg-transparent p-0 shadow-none"
            >
              <Alert.Content>
                <Alert.Description className="leading-[1.5]">
                  {message}{' '}
                  填写内容仍保留，若上次已创建成功将进入登录，否则可以继续提交。
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <fieldset
              disabled={busy}
              className={`grid min-w-0 ${step === 1 ? 'gap-3.5' : 'gap-[18px]'}`}
            >
              {step === 1 ? (
                <>
                  <IdentityField
                    name="code"
                    label="初始化码"
                    placeholder="粘贴初始化码"
                    value={fields.code}
                    onChange={(value) => change('code', value)}
                    error={errors.code}
                    description="在容器启动日志中找到初始化码。"
                  />
                  <IdentityField
                    name="email"
                    label="邮箱"
                    placeholder="owner@example.com"
                    value={fields.email}
                    onChange={(value) => change('email', value)}
                    error={errors.email}
                    autoComplete="email"
                  />
                  <IdentityField
                    name="password"
                    label="密码"
                    value={fields.password}
                    onChange={(value) => change('password', value)}
                    error={errors.password}
                    secret
                    autoComplete="new-password"
                    description="8–128 个字符，首尾空格也会计入密码。"
                  />
                  <IdentityField
                    name="confirmPassword"
                    label="确认密码"
                    value={fields.confirmPassword}
                    onChange={(value) => change('confirmPassword', value)}
                    error={errors.confirmPassword}
                    secret
                    autoComplete="new-password"
                  />
                </>
              ) : (
                <>
                  <IdentityField
                    name="publicUrl"
                    label="公开地址"
                    value={fields.publicUrl}
                    onChange={(value) => change('publicUrl', value)}
                    error={errors.publicUrl}
                    description="图片与分享链接会使用这个 HTTP(S) 根地址。"
                  />
                  <ComboBox
                    className="gap-1.5"
                    items={items}
                    inputValue={zoneQuery}
                    onInputChange={setZoneQuery}
                    value={fields.timeZone || null}
                    onChange={(value) => {
                      change('timeZone', value ? String(value) : '');
                      setZoneQuery(value ? String(value) : '');
                    }}
                    allowsEmptyCollection
                    isRequired
                    isInvalid={!!errors.timeZone}
                    validationBehavior="aria"
                    menuTrigger="input"
                  >
                    <Label className="text-sm leading-[1.5] font-normal after:content-none">
                      站点时区
                    </Label>
                    <ComboBox.InputGroup className="w-full">
                      <Input
                        id="timeZone"
                        className="h-12 min-h-12 w-full rounded-lg border bg-background shadow-none"
                      />
                      <ComboBox.Trigger aria-label="选择时区" />
                    </ComboBox.InputGroup>
                    <Description className="leading-[1.5]">
                      {fields.timeZone
                        ? '根据浏览器推荐，可搜索修改。点击完成初始化即确认此时区。'
                        : '无法推荐时区，请搜索并选择有效时区后再提交。'}
                    </Description>
                    <FieldError>{errors.timeZone}</FieldError>
                    <ComboBox.Popover>
                      <ListBox<{ id: string }>
                        renderEmptyState={() => '没有匹配的时区'}
                      >
                        {(item) => (
                          <ListBox.Item id={item.id} textValue={item.id}>
                            {item.id}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        )}
                      </ListBox>
                    </ComboBox.Popover>
                  </ComboBox>
                  <p className="text-xs leading-[1.5] text-muted">
                    点击「完成初始化」即确认以上设置并创建账号。
                  </p>
                </>
              )}
            </fieldset>
          )}
          {unknown ? (
            <Button
              className="h-12 min-h-12 w-full rounded-lg text-sm font-normal"
              type="button"
              aria-label={showingResult ? '核对初始化结果' : undefined}
              onPress={() => void checkResult()}
              isDisabled={busy}
            >
              {busy ? <Spinner size="sm" /> : null}
              {showingResult ? '重试' : '核对初始化结果'}
            </Button>
          ) : (
            <Button
              className="h-12 min-h-12 w-full rounded-lg text-sm font-normal"
              type="submit"
              isDisabled={busy || (step === 2 && !fields.timeZone)}
            >
              {busy ? <Spinner size="sm" /> : null}
              {busy
                ? '正在提交…'
                : step === 1
                  ? '下一步：设置站点'
                  : '完成初始化'}
            </Button>
          )}
          {step === 2 ? (
            <Button
              className="h-12 min-h-12 w-full rounded-lg text-sm font-normal"
              type="button"
              variant="outline"
              isDisabled={busy}
              onPress={() => {
                if (showingResult) {
                  setReviewing(true);
                  showStep(2);
                } else showStep(1);
              }}
            >
              {showingResult ? '返回检查设置' : '上一步'}
            </Button>
          ) : null}
        </Form>
      </section>
    </div>
  );
}
