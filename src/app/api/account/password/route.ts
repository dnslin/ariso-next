import {
  accountResponse,
  readAccountInput,
  updateOwnerPassword,
} from '../../../../server/identity/account.ts';
import { accountPasswordInputSchema } from '../../../../server/identity/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return accountResponse(request, async ({ connection }, owner) =>
    updateOwnerPassword(
      connection.db,
      owner,
      await readAccountInput(request, accountPasswordInputSchema),
    ),
  );
}
