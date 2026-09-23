import { describe, expect, it } from 'vitest';
import {
  deliveryError,
  isDeliveryErrorCode,
} from '../../../src/server/delivery/errors.ts';
import { imageFailure } from '../../../src/server/delivery/response.ts';

describe('delivery error metadata', () => {
  it.each([
    ['INVALID_IMAGE_REQUEST', 400, '图片请求参数无效'],
    ['IMAGE_CHANGED', 409, '图片版本发生变化，请重试'],
    ['DELIVERY_FAILED', 500, '图片读取失败，请稍后重试'],
  ] as const)(
    'keeps thrown and HTTP %s errors consistent',
    async (code, status, message) => {
      const error = deliveryError(code);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code, status, message });
      const response = imageFailure(
        new Request('https://images.example/i/image-1'),
        code,
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code, message });
      const head = imageFailure(
        new Request('https://images.example/i/image-1', { method: 'HEAD' }),
        code,
      );
      expect(head.status).toBe(status);
      expect(await head.text()).toBe('');
    },
  );

  it.each([undefined, null, 404, 'UNKNOWN', 'toString', '__proto__'])(
    'does not accept unknown or inherited error code %s',
    (code) => {
      expect(isDeliveryErrorCode(code)).toBe(false);
    },
  );
  it('recognizes storage errors propagated from the object reader', () => {
    expect(isDeliveryErrorCode('STORAGE_OBJECT_MISSING')).toBe(true);
  });
});
