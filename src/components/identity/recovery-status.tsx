import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import {
  RecoveryCliLink,
  RecoveryLogin,
  recoveryActionClass,
} from './recovery-frame';

export type RecoveryState =
  | 'form'
  | 'pending'
  | 'accepted'
  | 'unconfigured'
  | 'cli'
  | 'error'
  | 'unknown'
  | 'rate-limited';

export const recoveryTitles: Record<RecoveryState, string> = {
  form: '找回密码',
  pending: '正在申请重置邮件',
  accepted: '请检查邮箱',
  unconfigured: '邮件找回暂不可用',
  cli: '通过容器终端恢复',
  error: '邮件发送失败',
  unknown: '邮件发送结果未知',
  'rate-limited': '请稍后再试',
};

export function RecoveryStatus({
  state,
  detail,
  remaining,
  onReapply,
}: {
  state: Exclude<RecoveryState, 'form'>;
  detail: string;
  remaining: number;
  onReapply: () => void;
}) {
  if (state === 'cli')
    return (
      <>
        <p>需要能够访问 Ariso 的部署服务器。</p>
        <p className="text-muted text-[13px]">
          在服务器终端运行下方命令；容器名不是 ariso 时，请替换为实际名称。
        </p>
        <pre className="bg-default min-w-0 p-3 text-[13px] whitespace-pre-wrap wrap-anywhere">
          <code className="font-sans">
            docker exec -it ariso node dist/cli/reset-password.js
          </code>
        </pre>
        <p className="text-[13px]">
          按提示输入两次新密码，输入过程不显示密码。
          <br />
          成功后使用新密码登录，所有设备的旧会话和未使用的重置链接都会失效。
        </p>
        <RecoveryLogin primary />
        <Link href="/forgot-password" className={recoveryActionClass}>
          返回邮件找回
        </Link>
      </>
    );
  if (state === 'unconfigured')
    return (
      <>
        <p>站点尚未配置邮件服务，暂时无法发送重置邮件。</p>
        <p className="text-muted text-[13px]">
          若你可以访问部署服务器，可在容器终端设置新密码。本地密码登录仍可使用。
        </p>
        <RecoveryCliLink primary />
        <RecoveryLogin />
      </>
    );
  if (state === 'pending')
    return (
      <>
        <p role="status">正在提交请求，请稍候。</p>
        <Button
          data-testid="reset-submit"
          className={recoveryActionClass}
          variant="outline"
          isDisabled
        >
          <Spinner size="sm" /> 提交中…
        </Button>
        <RecoveryLogin />
      </>
    );
  if (state === 'accepted')
    return (
      <>
        <p role="status">
          如果该邮箱与账号匹配，你将收到密码重置邮件。
          <br />
          请检查收件箱和垃圾邮件。
        </p>
        <p className="text-muted text-[13px]">
          重置链接 1
          小时内有效，且只能使用一次。未收到时可重新申请，或使用容器终端恢复。
        </p>
        <RecoveryLogin primary />
        <Button
          data-testid="reset-reapply"
          variant="ghost"
          className={recoveryActionClass}
          onPress={onReapply}
        >
          重新申请
        </Button>
        <RecoveryCliLink />
      </>
    );
  return (
    <>
      <p role="alert">
        {state === 'unknown'
          ? '无法确认邮件发送结果，请先检查收件箱和垃圾邮件。重新申请可能重复收件。'
          : state === 'rate-limited'
            ? '申请次数过于频繁，请等待服务允许后重新申请。'
            : '暂时无法发送重置邮件，请稍后重试。'}
        {detail ? `（${detail}）` : ''}
      </p>
      <p className="text-muted text-[13px]">也可以通过容器终端恢复密码。</p>
      <Button
        data-testid="reset-reapply"
        className={recoveryActionClass}
        variant={remaining > 0 ? 'outline' : undefined}
        isDisabled={remaining > 0}
        onPress={onReapply}
      >
        {remaining > 0 ? `${remaining} 秒后可重试` : '重新尝试'}
      </Button>
      <RecoveryCliLink />
    </>
  );
}
