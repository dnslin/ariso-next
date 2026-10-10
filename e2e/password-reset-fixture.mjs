import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createSmtpCertificates,
  openSmtpFixture,
} from '../tests/experiments/identity/smtp-fixture.ts';

// Nodemailer sends the Chinese plain-text recovery email as base64 or quoted
// printable. Decode only the actual text body captured by the real listener.
function recoveryLink(raw) {
  const separator = raw.indexOf('\r\n\r\n');
  const headers = raw.slice(0, separator);
  let body = raw.slice(separator + 4);
  if (/Content-Transfer-Encoding: base64/i.test(headers))
    body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
  else if (/Content-Transfer-Encoding: quoted-printable/i.test(headers))
    body = body
      .replace(/=\r?\n/g, '')
      .replace(/=([a-f\d]{2})/gi, (_all, hex) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
  const url = body.match(
    /https?:\/\/[^\s<>]+\/api\/auth\/reset-password\/[^\s<>]+/,
  )?.[0];
  if (!url) throw new Error('Real SMTP recovery mail has no native reset link');
  return url;
}

/** Separate real SMTP deliveries for the disposable password-recovery runtime. */
export async function startPasswordResetBrowserFixture(directory) {
  const certificates = createSmtpCertificates();
  const listeners = [];
  let control;
  try {
    const caPath = join(directory, 'password-reset-ca.pem');
    await writeFile(caPath, certificates.ca);
    const targets = {};
    for (const [name, response] of [
      ['accepted', {}],
      [
        'failed',
        {
          error: Object.assign(new Error('Recovery mail rejected'), {
            responseCode: 550,
          }),
        },
      ],
      ['unknown', { disconnectAfterData: 'reset' }],
    ]) {
      const listener = await openSmtpFixture(
        certificates,
        { secure: true },
        response,
      );
      listeners.push({ name, ...listener });
      targets[name] = { host: '127.0.0.1', port: listener.port, mode: 'tls' };
    }
    control = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/messages') {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify(
          Object.fromEntries(
            listeners.map(({ name, received }) => [
              name,
              received.map(({ secure, recipients, raw }) => ({
                secure,
                recipients,
                url: recoveryLink(raw),
              })),
            ]),
          ),
        ),
      );
    });
    control.listen(0, '127.0.0.1');
    await once(control, 'listening');
    return {
      caPath,
      browserInput: {
        targets,
        control: `http://127.0.0.1:${control.address().port}`,
      },
      async close() {
        const outcomes = await Promise.allSettled([
          new Promise((resolve, reject) =>
            control.close((error) => (error ? reject(error) : resolve())),
          ),
          ...listeners.map((listener) => listener.close()),
        ]);
        certificates.close();
        const failures = outcomes.filter(
          (outcome) => outcome.status === 'rejected',
        );
        if (failures.length)
          throw new AggregateError(
            failures.map(({ reason }) => reason),
            'Password-reset fixture cleanup failed',
          );
      },
    };
  } catch (error) {
    await Promise.allSettled(listeners.map((listener) => listener.close()));
    control?.close();
    certificates.close();
    throw error;
  }
}
