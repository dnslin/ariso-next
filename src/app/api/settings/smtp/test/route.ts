import {
  accountResponse,
  readAccountInput,
} from '../../../../../server/identity/account.ts';
import {
  sendOwnerSmtpTest,
  SmtpSendError,
} from '../../../../../server/identity/mail.ts';
import { smtpTestInputSchema } from '../../../../../server/identity/validation.ts';
import { createSecretCrypto } from '../../../../../server/runtime/crypto.ts';
import { createRuntimeLogger } from '../../../../../server/runtime/logger.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return accountResponse(request, async ({ connection, config }, owner) => {
    const body = await request.text();
    if (body)
      await readAccountInput(
        new Request(request, { body }),
        smtpTestInputSchema,
        '邮件设置',
      );
    try {
      return await sendOwnerSmtpTest(
        connection.db,
        createSecretCrypto(config.encryptionKey),
        owner.user.email,
      );
    } catch (error) {
      if (!(error instanceof SmtpSendError)) throw error;
      createRuntimeLogger('identity.smtp', config.logLevel).error(
        { diagnostic: error.diagnostic },
        'SMTP test send failed',
      );
      return Response.json(
        {
          code: error.code,
          message: error.message,
          diagnostic: error.diagnostic,
        },
        { status: error.status },
      );
    }
  });
}
