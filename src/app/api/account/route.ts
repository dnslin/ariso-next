import { accountResponse } from '../../../server/identity/account.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return accountResponse(request, (_runtime, owner) => ({
    email: owner.user.email,
  }));
}
