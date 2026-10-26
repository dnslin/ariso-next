import { useState } from 'react';
import { Button } from '@heroui/react';
import { Eye, EyeOff, Link2 } from 'lucide-react';
import type { ExtensionSettings } from '../lib/types';
import { Dialog, Field, messageOf, primary, secondary } from './ui';

export function ConnectionDialog({
  settings,
  connected,
  hasItems,
  onClose,
  onConnect,
  onRemove,
}: {
  settings: ExtensionSettings;
  connected: boolean;
  hasItems: boolean;
  onClose: () => void;
  onConnect: (settings: ExtensionSettings) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [site, setSite] = useState(settings.siteUrl);
  const [token, setToken] = useState(settings.token);
  const [showToken, setShowToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  function testConnection() {
    setError('');
    // onConnect requests site permission synchronously, preserving the button gesture.
    const saving = onConnect({ ...settings, siteUrl: site, token });
    setPending(true);
    void saving
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setPending(false));
  }
  function remove() {
    setError('');
    setPending(true);
    void onRemove()
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setPending(false));
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="连接你的 Ariso"
      pending={pending}
      footer={
        <>
          <Button className={secondary} isDisabled={pending} onPress={onClose}>
            取消
          </Button>
          <Button
            className={primary}
            isPending={pending}
            onPress={testConnection}
          >
            <Link2 size={16} />
            {pending ? '正在连接…' : '测试并保存'}
          </Button>
        </>
      }
    >
      <Field
        label="站点地址"
        value={site}
        onChange={setSite}
        placeholder="https://images.example"
        type="url"
        disabled={pending}
      />
      <div className="relative">
        <Field
          label="上传 Token"
          value={token}
          onChange={setToken}
          placeholder="粘贴专用上传 Token"
          type={showToken ? 'text' : 'password'}
          disabled={pending}
        />
        <Button
          isIconOnly
          variant="ghost"
          isDisabled={pending}
          aria-label={showToken ? '隐藏 Token' : '显示 Token'}
          className="absolute right-1 bottom-0 size-11 rounded-lg text-muted"
          onPress={() => setShowToken((value) => !value)}
        >
          {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted">
        在 Ariso 的“API Token”页面创建专用上传 Token，填写最终站点根地址。
      </p>
      {hasItems && (
        <p className="text-xs leading-5 text-muted">
          更换站点会清空本机队列，已保存的图片不受影响。
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs leading-5 text-danger"
        >
          {error}
        </p>
      )}
      {connected && (
        <Button
          variant="ghost"
          isDisabled={pending}
          className="min-h-11 justify-start rounded-lg px-0 text-xs text-danger"
          onPress={remove}
        >
          移除本机连接
        </Button>
      )}
    </Dialog>
  );
}
