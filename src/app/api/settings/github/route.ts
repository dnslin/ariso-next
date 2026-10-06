import {
  accountResponse,
  readAccountInput,
} from '../../../../server/identity/account.ts';
import {
  readGithubSettings,
  updateGithubSettings,
} from '../../../../server/identity/github-settings.ts';
import { githubSettingsInputSchema } from '../../../../server/identity/validation.ts';
import { createSecretCrypto } from '../../../../server/runtime/crypto.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return accountResponse(request, ({ connection, config, github }) =>
    readGithubSettings(
      connection.db,
      createSecretCrypto(config.encryptionKey),
      github,
    ),
  );
}

export function PATCH(request: Request) {
  return accountResponse(request, async ({ connection, config, github }) =>
    updateGithubSettings(
      connection.db,
      createSecretCrypto(config.encryptionKey),
      github,
      await readAccountInput(request, githubSettingsInputSchema),
    ),
  );
}
