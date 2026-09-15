import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const nonceLength = 12;
const tagLength = 16;

/** 密钥来自已校验的 RuntimeConfig；不读取环境变量或访问数据库。 */
export function createSecretCrypto(encryptionKey: Buffer) {
  return {
    encryptSecret(plaintext: string): string {
      const nonce = randomBytes(nonceLength);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce, {
        authTagLength: tagLength,
      });
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
        'base64',
      );
    },

    /** context 只传配置位置，不传密钥、明文或密文。未配置字段由业务方保留 null。 */
    decryptSecret(ciphertext: string, context: string): string {
      const payload = Buffer.from(ciphertext, 'base64');
      // Node 的 Base64 解码会忽略非法字符；拒绝被修改的非规范文本。
      if (
        payload.toString('base64') !== ciphertext ||
        payload.length < nonceLength + tagLength
      ) {
        throw new Error(
          `${context}: 密文格式无效，必须是 Base64(nonce || tag || ciphertext)`,
        );
      }
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          encryptionKey,
          payload.subarray(0, nonceLength),
          { authTagLength: tagLength },
        );
        decipher.setAuthTag(
          payload.subarray(nonceLength, nonceLength + tagLength),
        );
        return Buffer.concat([
          decipher.update(payload.subarray(nonceLength + tagLength)),
          decipher.final(),
        ]).toString('utf8');
      } catch (cause) {
        throw new Error(
          `${context}: 密文认证失败，请恢复原 ARISO_ENCRYPTION_KEY 或数据备份`,
          { cause },
        );
      }
    },
  };
}
