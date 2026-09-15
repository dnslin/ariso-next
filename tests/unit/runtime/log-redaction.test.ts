import { describe, expect, it } from 'vitest';
import { redactUrlCredentials } from '../../../src/server/runtime/log-redaction';

describe('known URL credentials', () => {
  it.each([
    'token',
    'resetToken',
    'reset_token',
    'uploadToken',
    'access_token',
    'refresh_token',
    'code',
    'X-Amz-Signature',
    'X-Amz-Credential',
    'X-Amz-Security-Token',
    'AWSAccessKeyId',
    'Signature',
    '%74oken',
  ])('隐藏 %s，保留路径与普通参数', (name) => {
    expect(
      redactUrlCredentials(
        `failed /reset?view=full&${name}=private%2Fvalue&page=2`,
      ),
    ).toBe(`failed /reset?view=full&${name}=[Redacted]&page=2`);
  });
  it('处理多个 URL、重复参数和空值', () => {
    expect(
      redactUrlCredentials(
        'failed "https://a/reset?token=one&token=two#section"\n/callback?code=&state=ok',
      ),
    ).toBe(
      'failed "https://a/reset?token=[Redacted]&token=[Redacted]#section"\n/callback?code=[Redacted]&state=ok',
    );
  });
  it('保留普通路径、查询编码及非 URL 文本，不扫描任意秘密', () => {
    const text =
      'ENOENT /data/token/file?sort=a%2Fb&limit=5 password=plain /x?bad%ZZ=value';
    expect(redactUrlCredentials(text)).toBe(text);
  });
});
