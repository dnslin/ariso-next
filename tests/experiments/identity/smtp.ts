import nodemailer from 'nodemailer';

export type SmtpConfig = {
  host: string;
  port: number;
  mode: 'tls' | 'starttls';
  username?: string;
  password?: string;
  fromName: string;
  fromEmail: string;
};

export const smtpTimeouts = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
};

export type SmtpExperimentOptions = {
  ca?: string | Buffer;
  servername?: string;
  timeouts?: Partial<typeof smtpTimeouts>;
};

// Experiment only. The application does not yet import this transport.
export function createSmtpTransport(
  config: SmtpConfig,
  experiment: SmtpExperimentOptions = {},
) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.mode === 'tls',
    requireTLS: config.mode === 'starttls',
    auth: config.username
      ? { user: config.username, pass: config.password }
      : undefined,
    ...smtpTimeouts,
    ...experiment.timeouts,
    tls: {
      rejectUnauthorized: true,
      ca: experiment.ca,
      servername: experiment.servername,
    },
    logger: false,
    debug: false,
  });
}

export async function sendSmtpMail(
  config: SmtpConfig,
  mail: { to: string; subject: string; text: string },
  experiment: SmtpExperimentOptions = {},
) {
  const transport = createSmtpTransport(config, experiment);
  try {
    const info = await transport.sendMail({
      from: { name: config.fromName, address: config.fromEmail },
      ...mail,
    });
    return {
      acceptance: 'smtp-accepted' as const,
      finalReceipt: 'unverified' as const,
      accepted: info.accepted,
      rejected: info.rejected,
      messageId: info.messageId,
    };
  } finally {
    transport.close();
  }
}

// Raw SMTP responses may echo credentials or reset URLs. Keep those out of logs.
export function smtpFailureDiagnostic(error: unknown) {
  const failure = error as NodeJS.ErrnoException & {
    command?: string;
    responseCode?: number;
  };
  const code = failure?.code ?? 'UNKNOWN';
  const command = failure?.command?.split(' ')[0];
  const responseCode = failure?.responseCode;
  let stage: 'connection' | 'authentication' | 'tls' | 'delivery';
  if (code === 'EAUTH') stage = 'authentication';
  else if (
    code === 'ETLS' ||
    command === 'STARTTLS' ||
    /certificate|self-signed|STARTTLS/i.test(failure?.message ?? '')
  )
    stage = 'tls';
  else if (
    ['MAIL', 'RCPT', 'DATA'].includes(command ?? '') ||
    (code === 'ETIMEDOUT' && failure?.message === 'Timeout')
  )
    stage = 'delivery';
  else stage = 'connection';
  // CONN also describes a close or socket read failure after complete DATA.
  const deliveryMayHaveStarted =
    stage === 'delivery' ||
    (code === 'ECONNECTION' &&
      failure?.message === 'Connection closed unexpectedly') ||
    (stage === 'connection' &&
      code === 'ESOCKET' &&
      failure?.syscall === 'read');
  return {
    stage,
    code,
    command,
    responseCode,
    delivery:
      deliveryMayHaveStarted && !(responseCode && responseCode >= 400)
        ? ('unknown' as const)
        : ('not-accepted' as const),
  };
}
