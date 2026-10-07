import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { sendSmtpMail, smtpFailureDiagnostic } from './smtp.ts';

const settingsSchema = z.strictObject({
  smtp: z
    .strictObject({
      host: z.string().trim().min(1),
      port: z.number().int().min(1).max(65_535),
      mode: z.enum(['tls', 'starttls']),
      username: z.string().trim().min(1).optional(),
      password: z.string().optional(),
      fromName: z.string(),
      fromEmail: z.email(),
    })
    .refine(
      ({ username, password }) =>
        Boolean(username) === (password !== undefined),
      {
        message:
          'SMTP username and password must both be present or both omitted',
      },
    ),
  ownerEmail: z.email(),
  caFile: z.string().min(1).optional(),
  servername: z.string().min(1).optional(),
});

// Optional manual runner. Settings and credentials come only from this local file.
export function loadRealSmtpSettings(path: string) {
  const absolutePath = resolve(path);
  let contents: string;
  try {
    contents = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw Object.assign(error as Error, {
      stage: 'configuration',
      path: absolutePath,
    });
  }
  return settingsSchema.parse(JSON.parse(contents));
}

export async function runRealSmtpExperiment(path: string) {
  const settings = loadRealSmtpSettings(path);
  let ca: Buffer | undefined;
  if (settings.caFile) {
    const caPath = resolve(settings.caFile);
    try {
      ca = readFileSync(caPath);
    } catch (error) {
      throw Object.assign(error as Error, {
        stage: 'configuration',
        path: caPath,
      });
    }
  }
  const receiptMarker = `ariso-smtp-${randomUUID()}`;
  const result = await sendSmtpMail(
    settings.smtp,
    {
      to: settings.ownerEmail,
      subject: `Ariso SMTP experiment ${receiptMarker}`,
      text: `Receipt marker: ${receiptMarker}\nConfirm this marker in the owner's mailbox. SMTP acceptance alone does not prove external receipt.`,
    },
    {
      ca,
      servername: settings.servername,
    },
  );
  return { ...result, receiptMarker };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) {
    console.error(
      'Usage: node tests/experiments/identity/smtp-run.ts <local-settings.json>',
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await runRealSmtpExperiment(path)));
    } catch (error) {
      // Never print raw errors: server replies and invalid JSON may contain secrets.
      const failure = error as NodeJS.ErrnoException & { stage?: string };
      console.error(
        JSON.stringify(
          failure.stage === 'configuration' ||
            error instanceof z.ZodError ||
            error instanceof SyntaxError
            ? {
                stage: 'configuration',
                code: failure.code ?? 'SMTP_CONFIG_INVALID',
                path: failure.path ?? resolve(path),
              }
            : smtpFailureDiagnostic(error),
        ),
      );
      process.exitCode = 1;
    }
  }
}
