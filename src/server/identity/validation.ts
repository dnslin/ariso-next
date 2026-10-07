import { z } from 'zod';
import { siteSettingsInputSchema } from '../site/validation.ts';

export const accountInputSchema = z.object({
  code: z.string().min(1, '请输入初始化码'),
  email: z.string().trim().toLowerCase().pipe(z.email('请输入有效邮箱')),
  password: z
    .string()
    .min(8, '密码至少 8 个字符')
    .max(128, '密码最多 128 个字符'),
});

export const setupInputSchema = siteSettingsInputSchema.extend(
  accountInputSchema.shape,
);

export const setupAccountSchema = accountInputSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });

export const accountEmailInputSchema = z.object({
  email: accountInputSchema.shape.email,
  currentPassword: z.string().min(1, '请输入当前密码'),
});

export const accountPasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: accountInputSchema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });

export const uploadTokenCreateInputSchema = z.strictObject({
  name: z.string().trim().min(1, '请输入名称').max(32, '名称最多 32 个字符'),
  expiresIn: z
    .number({ error: '请输入有效的过期时间' })
    .min(1, '过期时间至少晚于当前时间 1 秒')
    .refine(
      (seconds) =>
        Number.isFinite(new Date(Date.now() + seconds * 1000).getTime()),
      '请输入有效的未来时间',
    )
    .optional(),
});

export const uploadTokenUpdateInputSchema = z.strictObject({
  enabled: z.boolean({ error: '请选择启用或停用' }),
});

export const githubSettingsInputSchema = z.strictObject({
  enabled: z.boolean({ error: '请选择是否启用 GitHub 登录' }).optional(),
  clientId: z.string().trim().max(256, 'Client ID 最多 256 个字符').optional(),
  clientSecret: z
    .string()
    .min(1, '请输入新的 Client Secret，或明确清除已保存的密钥')
    .max(4096, 'Client Secret 最多 4096 个字符')
    .refine((value) => !/^[*•●]+$/.test(value), '不能把密钥占位符作为新密钥')
    .nullable()
    .optional(),
});

/** 只消费 provider 的稳定 ID 与公开用户名，不保存整份 profile。 */
export const githubProfileSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]),
  login: z.string().min(1).max(39),
});
