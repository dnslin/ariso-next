import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { siteCardClass } from '../site/site-form';
import { protectionModeLabels } from './model';
import type { useAccessProtection } from './use-access-protection';

export function AccessProtectionFeedback({
  editor,
}: {
  editor: ReturnType<typeof useAccessProtection>;
}) {
  if (!editor.saved || editor.expired) return null;
  if (editor.phase === 'different') {
    return (
      <Card className={siteCardClass} role="alert">
        <h2 className="text-base font-medium">已保存值与本次提交不同</h2>
        <dl className="grid gap-3 text-sm">
          {(['mode', 'rate', 'burst'] as const)
            .filter((key) => editor.input[key] !== editor.saved![key])
            .map((key) => (
              <div key={key} className="grid gap-1">
                <dt className="font-medium">
                  {key === 'mode'
                    ? '防护模式'
                    : key === 'rate'
                      ? '持续请求频率'
                      : '突发请求额度'}
                </dt>
                <dd>
                  服务器：
                  {key === 'mode'
                    ? protectionModeLabels[editor.saved!.mode]
                    : editor.saved![key]}
                </dd>
                <dd className="text-muted">
                  当前输入：
                  {key === 'mode'
                    ? protectionModeLabels[editor.input.mode]
                    : editor.input[key]}
                </dd>
              </div>
            ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={() => editor.chooseSaved(true)}
          >
            使用服务器设置
          </Button>
          <Button
            variant="outline"
            className="min-h-11 rounded-lg"
            onPress={() => editor.chooseSaved(false)}
          >
            保留输入继续编辑
          </Button>
        </div>
      </Card>
    );
  }
  if (editor.uncertain) {
    return (
      <Card
        className={siteCardClass}
        role={editor.phase === 'checking' ? 'status' : 'alert'}
      >
        <h2 className="text-base font-medium">
          {editor.phase === 'checking'
            ? '正在核对已保存设置'
            : editor.phase === 'check-error'
              ? '无法核对保存结果'
              : '保存结果尚未确认'}
        </h2>
        <p className="text-sm leading-6">
          当前输入已保留。先核对已保存设置，再决定是否重新提交。
        </p>
        {editor.phase === 'check-error' && editor.message ? (
          <p className="text-sm text-danger wrap-anywhere">{editor.message}</p>
        ) : null}
        <Button
          variant="outline"
          className="h-11 w-fit rounded-lg"
          isDisabled={editor.phase === 'checking'}
          onPress={() => void editor.reconcile()}
        >
          {editor.phase === 'checking' ? '正在核对…' : '核对已保存设置'}
        </Button>
      </Card>
    );
  }
  return editor.message ? (
    <div
      role="alert"
      className="grid gap-1 rounded-xl border border-danger/50 px-4 py-3"
    >
      <p className="text-sm font-medium text-danger">保存失败</p>
      <p className="text-sm leading-6 wrap-anywhere">
        {editor.message}，当前输入已保留。
      </p>
    </div>
  ) : null;
}
