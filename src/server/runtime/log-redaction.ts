/** 固定日志字段契约；业务模块新增凭据位置时在此补充。 */
const secretFields = [
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'set-cookie',
  'Set-Cookie',
  'apiKey',
  'x-api-key',
  'X-API-Key',
  'uploadToken',
  'accessToken',
  'refreshToken',
  'resetToken',
  'token',
  'accessKey',
  'secretKey',
  'accessKeyId',
  'secretAccessKey',
  'sessionToken',
  'password',
  'clientSecret',
  'oauthSecret',
  'sharePassword',
  'betterAuthSecret',
  'encryptionKey',
  'BETTER_AUTH_SECRET',
  'ARISO_ENCRYPTION_KEY',
];

// 根字段及常用上下文容器；不扫描任意深度的业务配置。
export const logRedactionPaths = [
  '',
  '*',
  'req.headers',
  'request.headers',
  'err.cause',
].flatMap((prefix) =>
  secretFields.map((field) => `${prefix}[${JSON.stringify(field)}]`),
);

const sensitiveQueryParameters = new Set([
  'token',
  'resettoken',
  'reset_token',
  'uploadtoken',
  'access_token',
  'refresh_token',
  'code',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'awsaccesskeyid',
  'signature',
]);

/** 只替换显式查询参数的值，不重写 URL，保留原始路径、参数顺序和编码。 */
export function redactUrlCredentials(text: string): string {
  return text.replace(
    /([?&])([^\s?&#="'<>]+)=([^\s&#"'<>]*)/g,
    (match: string, separator: string, name: string) => {
      // 参数名中的 ASCII 百分号编码也是同一查询键；无效编码保持原样。
      const key = name
        .replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        )
        .toLowerCase();
      return sensitiveQueryParameters.has(key)
        ? `${separator}${name}=[Redacted]`
        : match;
    },
  );
}
