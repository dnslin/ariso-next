import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SMTPServer, type SMTPServerOptions } from 'smtp-server';

export function createSmtpCertificates() {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-smtp-tls-'));
  function openssl(args: string[]) {
    execFileSync('openssl', args, { cwd: directory, stdio: 'pipe' });
  }
  try {
    openssl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '1',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
      '-subj',
      '/CN=Ariso SMTP experiment CA',
    ]);
    openssl([
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'server.key',
      '-out',
      'server.csr',
      '-subj',
      '/CN=localhost',
    ]);
    writeFileSync(
      join(directory, 'server.ext'),
      'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',
    );
    openssl([
      'x509',
      '-req',
      '-in',
      'server.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'server.pem',
      '-days',
      '1',
      '-sha256',
      '-extfile',
      'server.ext',
    ]);
    return {
      ca: readFileSync(join(directory, 'ca.pem')),
      key: readFileSync(join(directory, 'server.key')),
      cert: readFileSync(join(directory, 'server.pem')),
      close: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export type CapturedSmtpMail = {
  secure: boolean;
  from: string;
  recipients: string[];
  raw: string;
};

export async function openSmtpFixture(
  certificates: ReturnType<typeof createSmtpCertificates>,
  options: SMTPServerOptions = {},
  dataResponse: {
    delayMs?: number;
    error?: Error;
    disconnectAfterData?: 'close' | 'reset';
  } = {},
) {
  const received: CapturedSmtpMail[] = [];
  const errors: Error[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sockets = new Set<Socket>();
  const server = new SMTPServer({
    key: certificates.key,
    cert: certificates.cert,
    authOptional: true,
    disableReverseLookup: true,
    logger: false,
    closeTimeout: 100,
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', callback);
      stream.on('end', () => {
        received.push({
          secure: session.secure,
          from: session.envelope.mailFrom
            ? session.envelope.mailFrom.address
            : '',
          recipients: session.envelope.rcptTo.map(({ address }) => address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        if (dataResponse.disconnectAfterData) {
          if (dataResponse.disconnectAfterData === 'reset') {
            for (const socket of sockets) socket.resetAndDestroy();
          } else {
            for (const connection of server.connections) connection.close();
          }
          return;
        }
        if (dataResponse.delayMs) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            callback(dataResponse.error);
          }, dataResponse.delayMs);
          timers.add(timer);
        } else callback(dataResponse.error);
      });
    },
    ...options,
  });
  server.server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('error', (error) => errors.push(error));
  await new Promise<void>((resolve, reject) => {
    server.server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.server.address();
  if (!address || typeof address === 'string')
    throw new Error('SMTP fixture did not open a TCP listener');
  return {
    port: address.port,
    received,
    errors,
    async close() {
      for (const timer of timers) clearTimeout(timer);
      await new Promise<void>((resolve) => server.close(resolve));
    },
  };
}
