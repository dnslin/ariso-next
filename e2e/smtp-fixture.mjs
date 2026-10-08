import { createServer } from 'node:http';
import { createServer as createSocket } from 'node:net';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  createSmtpCertificates,
  openSmtpFixture,
} from '../tests/experiments/identity/smtp-fixture.ts';

/** Real SMTP listeners and disposable CA, used only by the isolated browser runtime. */
export async function startSmtpBrowserFixture(directory) {
  const certificates = createSmtpCertificates();
  const listeners = [];
  let control;
  try {
    const caPath = join(directory, 'smtp-ca.pem');
    await writeFile(caPath, certificates.ca);
    const password = randomBytes(18).toString('hex');
    const username = 'browser-smtp';
    const authenticated = {
      authOptional: false,
      onAuth(auth, _session, callback) {
        if (auth.username === username && auth.password === password)
          callback(null, { user: username });
        else callback(new Error('Browser fixture authentication rejected'));
      },
    };
    const targets = {};
    for (const [name, options, response] of [
      ['tls', { secure: true, ...authenticated }],
      ['starttls', { secure: false, ...authenticated }],
      ['relay', { secure: true }],
      [
        'delivery',
        { secure: true },
        {
          error: Object.assign(new Error('Browser fixture delivery rejected'), {
            responseCode: 550,
          }),
        },
      ],
      ['unknown', { secure: true }, { disconnectAfterData: 'reset' }],
      ['tlsFailure', { secure: false, disabledCommands: ['STARTTLS'] }],
    ]) {
      const listener = await openSmtpFixture(certificates, options, response);
      listeners.push({ name, ...listener });
      targets[name] = {
        host: '127.0.0.1',
        port: listener.port,
        mode: name === 'starttls' || name === 'tlsFailure' ? 'starttls' : 'tls',
      };
    }
    // A closed local listener gives a deterministic refused TCP connection.
    const socket = createSocket();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    targets.connection = {
      host: '127.0.0.1',
      port: socket.address().port,
      mode: 'tls',
    };
    await new Promise((resolve, reject) =>
      socket.close((error) => (error ? reject(error) : resolve())),
    );
    control = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/state') {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify(
          Object.fromEntries(
            listeners.map(({ name, received, errors }) => [
              name,
              {
                received: received.map(({ secure, from, recipients }) => ({
                  secure,
                  from,
                  recipients,
                })),
                errors: errors.map(({ message }) => message),
              },
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
        username,
        password,
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
            failures.map((failure) => failure.reason),
            'SMTP browser fixture cleanup failed',
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
