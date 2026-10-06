import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import { ShareBrandHeading, type ShareBrand } from './brand';
import { SharePasswordForm } from './password-form';

export function ShareGate({
  token,
  brand,
  status,
  revoked,
  loading,
  onUnlocked,
  onUnavailable,
  onRetry,
}: {
  token: string;
  brand: ShareBrand;
  status: number;
  revoked: boolean;
  loading: boolean;
  onUnlocked: () => Promise<void>;
  onUnavailable: (status: number) => void;
  onRetry: () => void;
}) {
  const password = status === 401;
  const title = password
    ? '访问受密码保护'
    : status === 404
      ? '分享链接无效'
      : status === 410
        ? '分享已失效'
        : '暂时无法访问';
  const description = password
    ? revoked
      ? '访问已失效，请重新输入分享密码。'
      : '输入分享密码后继续。'
    : status === 404
      ? '这个分享链接无法使用。'
      : status === 410
        ? '这个分享暂时无法访问。'
        : '连接遇到问题。';
  return (
    <section className="min-h-dvh px-4 pt-[76px] pb-8 min-[768px]:pt-[120px]">
      <div className="mx-auto grid w-full max-w-[480px] gap-8">
        <ShareBrandHeading brand={brand} description />
        <Card
          data-testid="share-state"
          className="gap-4 rounded-3xl border border-border bg-surface p-6 shadow-none"
          role="region"
          aria-labelledby="share-state-heading"
        >
          <Card.Header className="gap-4">
            <h1
              id="share-state-heading"
              className="text-[22px] leading-8 font-medium"
            >
              {title}
            </h1>
            <p
              role={revoked ? 'status' : undefined}
              className={`text-sm leading-[22px] ${revoked ? 'text-muted' : ''}`}
            >
              {description}
            </p>
          </Card.Header>
          <Card.Content className="p-0">
            {password ? (
              <SharePasswordForm
                token={token}
                revoked={revoked}
                onUnlocked={onUnlocked}
                onUnavailable={onUnavailable}
              />
            ) : (
              <div className="grid gap-4">
                <p className="text-sm leading-[22px]">
                  {status === 404 || status === 410
                    ? '请联系分享者确认，或返回首页。'
                    : '请稍后重试。'}
                </p>
                {status !== 404 && status !== 410 ? (
                  <Button
                    data-testid="share-retry"
                    className="h-12 w-full rounded-lg text-sm font-normal"
                    isDisabled={loading}
                    onPress={onRetry}
                  >
                    {loading ? <Spinner size="sm" /> : null}
                    {loading ? '正在加载…' : '重新尝试'}
                  </Button>
                ) : null}
              </div>
            )}
          </Card.Content>
        </Card>
      </div>
    </section>
  );
}
