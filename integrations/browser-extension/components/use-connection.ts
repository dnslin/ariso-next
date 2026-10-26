import { useCallback, useEffect, useState } from 'react';
import {
  connect,
  disconnect,
  readConnection,
  refreshCapabilities,
  savePreferences,
} from '../lib/settings';
import type { UploadController } from '../lib/controller';
import type { ExtensionSettings, SavedConnection } from '../lib/types';
import { messageOf } from './ui';

export function useConnection(
  controller: UploadController,
  onError: (message: string) => void,
) {
  const [connection, setConnection] = useState<SavedConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState('');

  useEffect(() => {
    let disposed = false;
    void readConnection()
      .then(async (saved) => {
        if (!saved || disposed) return;
        setConnection(saved);
        try {
          const capabilities = await refreshCapabilities(saved.settings);
          if (disposed) return;
          controller.setCapabilities(capabilities);
          setConnection({ settings: saved.settings, capabilities });
        } catch (error) {
          if (!disposed) setIssue(messageOf(error));
        }
      })
      .catch((error) => {
        if (!disposed) setIssue(messageOf(error));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [controller]);

  const change = useCallback(
    (settings: ExtensionSettings) => {
      setConnection((previous) =>
        previous ? { ...previous, settings } : previous,
      );
      void savePreferences(settings).catch((error) =>
        onError(`设置未能保存到本机：${messageOf(error)}`),
      );
    },
    [onError],
  );

  function connectTo(settings: ExtensionSettings) {
    // connect begins the permission request before any await in this handler.
    return connect(settings).then((saved) => {
      const switched =
        connection !== null &&
        connection.settings.siteUrl !== saved.settings.siteUrl;
      if (switched) controller.clear();
      controller.setCapabilities(saved.capabilities);
      setConnection(saved);
      setIssue('');
    });
  }
  async function remove() {
    await disconnect();
    controller.clear();
    setConnection(null);
    setIssue('');
  }
  return { connection, loading, issue, change, connectTo, remove };
}
