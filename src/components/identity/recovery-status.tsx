import { Button } from '@heroui/react/button';
import { RecoveryLogin, recoveryActionClass } from './recovery-frame';

export type RecoveryState =
  | 'form'
  | 'pending'
  | 'accepted'
  | 'unconfigured'
  | 'error'
  | 'unknown'
  | 'rate-limited';

export const recoveryTitles: Record<RecoveryState, string> = {
  form: '找回密码',
  pending: '找回密码',
  accepted: '请检查邮箱',
  unconfigured: '邮件找回暂不可用',
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
  state: Exclude<RecoveryState, 'form' | 'pending'>;
  detail: string;
  remaining: number;
  onReapply: () => void;
}) {
  if (state === 'unconfigured')
    return (
      <>
        <p>站点尚未配置邮件服务，暂时无法发送重置邮件。</p>
        <RecoveryLogin primary />
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
        <RecoveryLogin primary />
        <Button
          data-testid="reset-reapply"
          variant="ghost"
          className={recoveryActionClass}
          onPress={onReapply}
        >
          重新申请
        </Button>
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
      <Button
        data-testid="reset-reapply"
        className={recoveryActionClass}
        variant={remaining > 0 ? 'outline' : undefined}
        isDisabled={remaining > 0}
        onPress={onReapply}
      >
        {remaining > 0 ? `${remaining} 秒后可重试` : '重新尝试'}
      </Button>
    </>
  );
}
