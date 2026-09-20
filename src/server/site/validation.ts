import { z } from 'zod';

export const publicUrlSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: '请输入完整的 HTTP(S) 根地址' });
      return z.NEVER;
    }
    // 同时检查原始路径，避免 URL 解析把 /a/..、空查询或空片段静默移除。
    if (
      !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(value) ||
      value.includes('@') ||
      url.username ||
      url.password ||
      url.pathname !== '/'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '仅支持 HTTP(S) 根地址，不得包含凭据、查询、片段或子路径',
      });
      return z.NEVER;
    }
    return url.origin;
  });

export const timeZoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      if (!value || /^[+-]/.test(value)) throw new RangeError('UTC offset');
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: value,
      }).resolvedOptions().timeZone;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: '请选择有效的 IANA 时区或 UTC，不支持纯 UTC 偏移',
      });
      return z.NEVER;
    }
  });

export const siteSettingsInputSchema = z.object({
  publicUrl: publicUrlSchema,
  timeZone: timeZoneSchema,
});

export type SiteSettingsInput = z.output<typeof siteSettingsInputSchema>;
