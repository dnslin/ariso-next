import { browser } from 'wxt/browser';
import { normalizeSettings } from './settings-input';
import { parseApiError, parseCapabilities } from './result';
import type { Capabilities, ExtensionSettings, SavedConnection } from './types';
import { originPattern } from './permissions';

export { defaultSettings } from './settings-input';
const key = 'ariso.connection';
let connectionWrites: Promise<void> = Promise.resolve();

/** Keep this key's changes in intent order; each caller still receives its own error. */
function changeConnection<T>(operation: () => Promise<T>): Promise<T> {
  const result = connectionWrites.then(operation);
  connectionWrites = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export async function protectSettings() {
  await browser.storage.local.setAccessLevel({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
}
export async function readConnection(): Promise<SavedConnection | null> {
  const saved = (await browser.storage.local.get(key))[key] as
    SavedConnection | undefined;
  if (!saved) return null;
  return {
    settings: normalizeSettings(saved.settings),
    capabilities: parseCapabilities(saved.capabilities),
  };
}
export async function refreshCapabilities(
  settings: ExtensionSettings,
): Promise<Capabilities> {
  const normalized = normalizeSettings(settings);
  let response: Response;
  try {
    response = await fetch(`${normalized.siteUrl}/api/upload/capabilities`, {
      headers: { Authorization: `Bearer ${normalized.token}` },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('无法连接 Ariso，请检查站点最终地址、HTTPS 和域名访问权限');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      parseApiError(body) ??
        `HTTP ${response.status}：无法读取上传能力，请检查站点版本和上传 Token`,
    );
  return parseCapabilities(body);
}
export async function connect(
  settings: ExtensionSettings,
): Promise<SavedConnection> {
  const normalized = normalizeSettings(settings);
  // This permission request must remain before any await to retain the button gesture.
  const permission = browser.permissions
    .request({
      origins: [originPattern(normalized.siteUrl)],
    })
    .then(
      (granted) => ({ granted }),
      (error: unknown) => ({ error }),
    );
  return changeConnection(async () => {
    const result = await permission;
    if ('error' in result) throw result.error;
    if (!result.granted)
      throw new Error('未允许访问该 Ariso 站点，连接尚未保存');
    const capabilities = await refreshCapabilities(normalized);
    const saved = { settings: normalized, capabilities };
    await protectSettings();
    await browser.storage.local.set({ [key]: saved });
    return saved;
  });
}
export async function savePreferences(settings: ExtensionSettings) {
  const normalized = normalizeSettings(settings);
  return changeConnection(async () => {
    const previous = await readConnection();
    if (!previous) throw new Error('请先连接 Ariso');
    if (
      normalized.siteUrl !== previous.settings.siteUrl ||
      normalized.token !== previous.settings.token
    )
      throw new Error('修改站点或 Token 后须重新测试连接');
    await browser.storage.local.set({
      [key]: { settings: normalized, capabilities: previous.capabilities },
    });
  });
}
export async function disconnect() {
  return changeConnection(() => browser.storage.local.remove(key));
}
