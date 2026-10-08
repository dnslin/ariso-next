import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { SiteRequestError } from './api';
import { siteCardClass } from './site-form';

export function SiteReadState({
  loading,
  sessionLost,
  error,
  retry,
}: {
  loading: boolean;
  sessionLost: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const uninitialized =
    error instanceof SiteRequestError && error.code === 'SITE_NOT_INITIALIZED';
  return (
    <Card className={siteCardClass} role={loading ? 'status' : 'alert'}>
      <h2 className="text-lg font-medium">
        {sessionLost
          ? '会话已失效'
          : loading
            ? '正在读取站点信息'
            : uninitialized
              ? '站点尚未初始化'
              : '无法读取站点信息'}
      </h2>
      <p className="text-sm leading-6 wrap-anywhere">
        {sessionLost
          ? '请重新登录后编辑站点信息。'
          : loading
            ? '取得服务器已保存设置后即可编辑。'
            : error?.message}
      </p>
      {sessionLost ? (
        <SessionLink />
      ) : uninitialized ? (
        <Link
          href="/setup"
          className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 text-sm text-foreground no-underline"
        >
          完成初始化
        </Link>
      ) : !loading ? (
        <Button
          variant="outline"
          className="min-h-11 w-fit rounded-lg"
          onPress={retry}
        >
          重新读取站点信息
        </Button>
      ) : null}
    </Card>
  );
}

export function SessionLink() {
  return (
    <Link
      href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral"
      className="flex min-h-11 w-fit items-center rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
    >
      重新登录
    </Link>
  );
}
