import { caseFold } from 'unicode-case-folding';
import { z } from 'zod';

function nameSchema(limit: number) {
  return (
    z
      .string()
      // Check before trim so leading/trailing controls cannot disappear.
      .refine((value) => !/[\p{Cc}\u2028\u2029]/u.test(value), {
        message: '名称不能包含换行或控制字符',
      })
      .transform((value) => value.trim().normalize('NFC'))
      .refine((value) => [...value].length >= 1 && [...value].length <= limit, {
        message: `名称须包含 1–${limit} 个 Unicode 码点`,
      })
  );
}

export const albumInputSchema = z.object({
  name: nameSchema(100),
  description: z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .refine((value) => [...value].length <= 2000, {
      message: '描述最多包含 2000 个 Unicode 码点',
    })
    .default(''),
});

export const tagNameSchema = nameSchema(50).transform((displayName) => ({
  displayName,
  normalizedKey: caseFold(displayName).normalize('NFC'),
}));

export const tagNamesSchema = z.array(tagNameSchema);
