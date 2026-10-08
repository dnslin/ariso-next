import {
  accountResponse,
  readAccountInput,
} from '../../../../server/identity/account.ts';
import {
  readSmtpSettings,
  updateSmtpSettings,
} from '../../../../server/identity/mail.ts';
import { smtpSettingsInputSchema } from '../../../../server/identity/validation.ts';
import { createSecretCrypto } from '../../../../server/runtime/crypto.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return accountResponse(request, ({ connection }) =>
    readSmtpSettings(connection.db),
  );
}

export function PATCH(request: Request) {
  return accountResponse(request, async ({ connection, config }) =>
    updateSmtpSettings(
      connection.db,
      createSecretCrypto(config.encryptionKey),
      await readAccountInput(request, smtpSettingsInputSchema, '邮件设置'),
    ),
  );
}
