import { z } from 'zod';
import type { ExtensionSettings } from './types';

export const defaultSettings: ExtensionSettings = {
  siteUrl: '',
  token: '',
  visibility: null,
  linkVersion: 'site',
  albumId: '',
  tag: '',
  storageId: '',
  theme: 'light',
};
const settingsSchema = z.strictObject({
  siteUrl: z.string(),
  token: z.string().trim().min(1, '请输入上传 Token'),
  visibility: z.enum(['public', 'private']).nullable(),
  linkVersion: z.enum(['site', 'original', 'compressed', 'watermark']),
  albumId: z.string().trim().max(255),
  tag: z
    .string()
    .trim()
    .refine(
      (value) => !/\p{Cc}/u.test(value) && [...value].length <= 50,
      '标签须为不含换行的 1–50 个字符',
    ),
  storageId: z.string().trim().max(255),
  theme: z.enum(['light', 'dark']),
});

export function normalizeSiteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('请输入完整的 Ariso HTTPS 根地址');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('请使用最终 HTTPS 站点根地址，不包含路径、账号或查询参数');
  return url.origin;
}

export function normalizeSettings(value: ExtensionSettings): ExtensionSettings {
  const parsed = settingsSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((issue) => issue.message).join('；'),
    );
  if (/^Bearer\s/i.test(parsed.data.token))
    throw new Error('请输入裸 Token，不包含 Bearer 前缀');
  return { ...parsed.data, siteUrl: normalizeSiteUrl(parsed.data.siteUrl) };
}
