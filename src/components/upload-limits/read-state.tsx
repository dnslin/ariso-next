import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { UploadLimitsRequestError } from './api';
import { UploadLimitsSessionLink } from './feedback';

export function UploadLimitsReadState({
  loading,
  expired,
  error,
  retry,
}: {
  loading: boolean;
  expired: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const uninitialized =
    error instanceof UploadLimitsRequestError &&
    error.code === 'UPLOAD_NOT_INITIALIZED';
  return (
    <Card className="min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5">
      <h2 className="text-lg font-medium">
        {loading
          ? '正在读取上传限制'
          : expired
            ? '会话已失效'
            : uninitialized
              ? '上传设置尚未初始化'
              : '无法读取上传限制'}
      </h2>
      {loading ? (
        <p role="status" className="text-[13px] leading-5 text-muted">
          请稍候，取得已保存设置后再编辑。
        </p>
      ) : (
        <>
          <p role="alert" className="text-sm text-danger wrap-anywhere">
            {expired ? '请重新登录后编辑上传限制。' : error?.message}
          </p>
          {expired ? (
            <UploadLimitsSessionLink />
          ) : (
            <Button
              data-testid="upload-limits-retry"
              variant="outline"
              className="min-h-11 w-fit rounded-lg"
              onPress={retry}
            >
              重新读取设置
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
