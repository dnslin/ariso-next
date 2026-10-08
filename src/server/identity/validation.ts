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

export const smtpSettingsInputSchema = z
  .strictObject({
    host: z
      .string()
      .trim()
      .min(1, '请输入 SMTP 主机')
      .max(253, '主机最多 253 个字符')
      .refine(
        (value) =>
          !/[\s/\\:@\[\]]/.test(value) || z.ipv6().safeParse(value).success,
        '请输入主机名或 IP 地址，不包含协议或端口',
      )
      .optional(),
    port: z
      .number({ error: '请输入有效端口' })
      .int('端口必须是整数')
      .min(1, '端口至少为 1')
      .max(65535, '端口最多为 65535')
      .optional(),
    mode: z
      .enum(['tls', 'starttls'], { error: '请选择 TLS 或 STARTTLS' })
      .optional(),
    username: z.string().trim().max(512, '用户名最多 512 个字符').optional(),
    password: z
      .string()
      .min(1, '保留密码请留空输入；清除请使用清除凭据操作')
      .max(4096, '密码最多 4096 个字符')
      .refine(
        (value) =>
          !/^[*•●]+$/.test(value) && !['已设置', '已保存'].includes(value),
        '不能把密码占位符作为新密码',
      )
      .optional(),
    fromName: z
      .string()
      .trim()
      .min(1, '请输入发件人名称')
      .max(256, '发件人名称最多 256 个字符')
      .optional(),
    fromEmail: accountInputSchema.shape.email.optional(),
    clearCredentials: z.literal(true).optional(),
  })
  .refine(
    (input) =>
      !input.clearCredentials ||
      (input.username === undefined && input.password === undefined),
    {
      path: ['clearCredentials'],
      message: '清除凭据时不能同时提交用户名或密码',
    },
  );

export const smtpTestInputSchema = z.strictObject({});
