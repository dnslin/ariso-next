import { Link } from '@heroui/react/link';
import { recoveryActionClass } from './recovery-frame';

export function ResetPasswordResult({
  state,
  detail,
}: {
  state: 'success' | 'invalid' | 'unknown';
  detail: string;
}) {
  return (
    <>
      <h1
        id="reset-heading"
        tabIndex={-1}
        className="text-2xl leading-[30px] font-medium"
      >
        {state === 'success'
          ? '密码已更新'
          : state === 'invalid'
            ? '链接无法使用'
            : '重置未完成'}
      </h1>
      <p
        className="text-muted min-h-[30px] text-sm leading-[1.5]"
        role={state === 'success' ? 'status' : 'alert'}
      >
        {state === 'success'
          ? '请使用新密码重新登录。所有已登录设备均已退出。'
          : state === 'invalid'
            ? '链接可能已过期、已使用或无效。请重新申请一封重置邮件。'
            : '本次重置未完成，密码可能已更新，旧会话也可能仍有效。请重新申请链接，再设置一次密码。'}
        {detail ? `（${detail}）` : ''}
      </p>
      {state !== 'success' ? (
        <Link
          href="/forgot-password"
          data-testid="reset-reapply"
          className={`${recoveryActionClass} bg-accent text-accent-foreground`}
        >
          重新申请链接
        </Link>
      ) : null}
      <Link
        href="/login"
        data-testid="reset-login"
        className={`${recoveryActionClass} ${state === 'success' ? 'bg-accent text-accent-foreground' : 'border border-border bg-background text-foreground'}`}
      >
        {state === 'success' ? '前往登录' : '返回登录'}
      </Link>
    </>
  );
}
