import { accountResponse } from '../../../../../server/identity/account.ts';
import { getAuth } from '../../../../../server/identity/auth.ts';
import { linkGithubAccount } from '../../../../../server/identity/github.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return accountResponse(request, (server, owner) =>
    linkGithubAccount(
      server.connection.db,
      owner.user.id,
      getAuth(server)!,
      request,
    ),
  );
}
