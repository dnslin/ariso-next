export function backupBrowserSecrets(config) {
  return [
    config.password,
    config.setupCode,
    config.credentials?.password,
    ...(config.restoreTargets ?? []).flatMap((target) => [
      target.value.accessKey,
      target.value.secretKey,
    ]),
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

export function serializeBackupBrowserReport(report, secrets) {
  const variants = [
    ...new Set(
      secrets
        .filter(Boolean)
        .flatMap((secret) => [
          secret,
          encodeURIComponent(secret),
          JSON.stringify(secret).slice(1, -1),
        ]),
    ),
  ].sort((a, b) => b.length - a.length);
  return JSON.stringify(
    report,
    (_key, value) =>
      typeof value === 'string'
        ? variants.reduce(
            (safe, secret) => safe.replaceAll(secret, '[redacted]'),
            value,
          )
        : value,
    2,
  );
}
