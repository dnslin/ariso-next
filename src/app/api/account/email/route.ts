import {
  accountResponse,
  readAccountInput,
  updateOwnerEmail,
} from '../../../../server/identity/account.ts';
import { accountEmailInputSchema } from '../../../../server/identity/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function PATCH(request: Request) {
  return accountResponse(request, async ({ connection }, owner) =>
    updateOwnerEmail(
      connection.db,
      owner,
      await readAccountInput(request, accountEmailInputSchema),
    ),
  );
}
