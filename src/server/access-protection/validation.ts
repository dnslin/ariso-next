import { z, type ZodError } from 'zod';

const positiveInteger = z
  .number({ error: '请输入大于 0 的整数' })
  .int('请输入安全范围内的整数')
  .min(1, '请输入大于 0 的整数');

export const accessProtectionInputSchema = z.strictObject({
  mode: z.enum(['off', 'observe', 'enforce'], { error: '请选择防护模式' }),
  rate: positiveInteger,
  burst: positiveInteger,
});

export function accessProtectionFieldErrors(error: ZodError) {
  return error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((field) => ({ field, message: '未知字段' }))
      : [{ field: issue.path.join('.'), message: issue.message }],
  );
}
