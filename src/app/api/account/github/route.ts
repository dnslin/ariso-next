import { accountResponse } from '../../../../server/identity/account.ts';
import { getAuth } from '../../../../server/identity/auth.ts';
import {
  readGithubBinding,
  unlinkGithubAccount,
} from '../../../../server/identity/github.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return accountResponse(request, ({ connection }, owner) =>
    readGithubBinding(connection.db, owner.user.id),
  );
}

export function DELETE(request: Request) {
  return accountResponse(request, (server, owner) =>
    unlinkGithubAccount(
      server.connection.db,
      owner.user.id,
      getAuth(server)!,
      request,
    ),
  );
}
