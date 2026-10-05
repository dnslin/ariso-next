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
