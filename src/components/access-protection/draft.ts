import { z } from 'zod';
import { accessProtectionInputSchema } from '../../server/access-protection/validation';
import type { AccessProtectionInput } from '../../server/access-protection/types';

const key = 'ariso-access-protection-draft';
const draftNumber = z
  .number()
  .nullable()
  .transform((value) => value ?? Number.NaN);
const draftSchema = z.object({
  input: accessProtectionInputSchema.extend({
    rate: draftNumber,
    burst: draftNumber,
  }),
  saved: accessProtectionInputSchema,
  pending: accessProtectionInputSchema.nullable(),
  needsReview: z.boolean(),
});
export type AccessProtectionDraft = {
  input: AccessProtectionInput;
  saved: AccessProtectionInput;
  pending: AccessProtectionInput | null;
  needsReview: boolean;
};

/** Tab-scoped, non-secret form values survive the full login navigation. */
export function readAccessProtectionDraft() {
  try {
    const value =
      typeof sessionStorage === 'undefined'
        ? null
        : sessionStorage.getItem(key);
    return {
      draft: value ? draftSchema.parse(JSON.parse(value)) : null,
      error: '',
    };
  } catch (error) {
    return {
      draft: null,
      error: `无法恢复访问防护草稿：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function storeAccessProtectionDraft(
  draft: AccessProtectionDraft | null,
) {
  if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
  else sessionStorage.removeItem(key);
}
