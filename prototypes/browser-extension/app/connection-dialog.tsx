'use client';

import { Button } from '@heroui/react';
import { Eye, EyeOff, Link2 } from 'lucide-react';
import { Dialog, Field, primary, secondary } from './ui';

type ConnectionDialogProps = {
  open: boolean;
  connected: boolean;
  testing: boolean;
  site: string;
  setSite: (value: string) => void;
  token: string;
  setToken: (value: string) => void;
  showToken: boolean;
  onToggleToken: () => void;
  connectionError: string;
  onClose: () => void;
  scenario: string;
  setTesting: (value: boolean) => void;
  setConnectionError: (value: string) => void;
  onConnected: () => void;
  onRemove: () => void;
};

export function ConnectionDialog({
  open,
  connected,
  testing,
  site,
  setSite,
  token,
  setToken,
  showToken,
  onToggleToken,
  connectionError,
  onClose,
  scenario,
  setTesting,
  setConnectionError,
  onConnected,
  onRemove,
}: ConnectionDialogProps) {
  async function testConnection() {
    setConnectionError('');
    const error = connectionInputError(site, token);
    if (error) {
      setConnectionError(error);
      return;
    }
    setTesting(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 650));
    setTesting(false);
    if (scenario === 'token-invalid') {
      setConnectionError('Token 无效、已停用或已过期。请更换 Token 后重试。');
      return;
    }
    onConnected();
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="连接你的 Ariso"
      footer={
        <>
          <Button className={secondary} isDisabled={testing} onPress={onClose}>
            取消
          </Button>
          <Button
            className={primary}
            isPending={testing}
            onPress={() => void testConnection()}
          >
            <Link2 size={16} />
            {testing ? '正在测试…' : '测试并保存'}
          </Button>
        </>
      }
    >
      <p className="-mt-2 text-sm leading-6 text-muted">
        填写站点地址和专用上传 Token，即可开始使用。
      </p>
      <Field
        label="站点地址"
        value={site}
        onChange={setSite}
        placeholder="https://images.example"
        type="url"
        disabled={testing}
      />
      <div className="relative">
        <Field
          label="上传 Token"
          value={token}
          onChange={setToken}
          placeholder="请输入示例文本，勿填真实密钥"
          type={showToken ? 'text' : 'password'}
          disabled={testing}
        />
        <Button
          isIconOnly
          variant="ghost"
          aria-label={showToken ? '隐藏 Token' : '显示 Token'}
          className="absolute right-1 bottom-0 size-11 rounded-lg text-muted"
          onPress={onToggleToken}
        >
          {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </div>
      <p className="text-xs leading-6 text-muted">
        在 Ariso 的“API Token”页面创建专用上传
        Token。原型仅演示连接反馈，不验证或保存密钥。
      </p>
      {connectionError && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger/5 p-3 text-sm leading-6 text-danger"
        >
          {connectionError}
        </p>
      )}
      {connected && (
        <Button
          variant="ghost"
          isDisabled={testing}
          className="min-h-11 justify-start rounded-lg px-0 text-xs text-danger"
          onPress={() => {
            onClose();
            onRemove();
          }}
        >
          移除连接
        </Button>
      )}
    </Dialog>
  );
}

function connectionInputError(site: string, token: string) {
  try {
    const url = new URL(site);
    if (
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    )
      throw new Error('请填写 HTTPS 站点根地址，例如 https://images.example');
    if (!token.trim())
      throw new Error('请填写一个示例 Token；原型不会校验或保存真实密钥。');
  } catch (error) {
    return error instanceof Error && error.message.startsWith('请')
      ? error.message
      : '请填写完整、有效的站点根地址。';
  }
  return null;
}
