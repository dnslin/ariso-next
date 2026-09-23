export const deliveryErrors = {
  INVALID_IMAGE_REQUEST: [400, '图片请求参数无效'],
  OWNER_LOGIN_REQUIRED: [401, '请登录后访问私有图片'],
  IMAGE_NOT_FOUND: [404, '图片不存在'],
  IMAGE_UNAVAILABLE: [404, '图片已回收或正在删除'],
  VERSION_UNAVAILABLE: [404, '请求的图片版本不可用'],
  IMAGE_NOT_READY: [409, '图片尚未处理完成'],
  STORAGE_DISABLED: [409, '图片所属存储已停用'],
  IMAGE_CHANGED: [409, '图片版本发生变化，请重试'],
  STORAGE_OBJECT_MISSING: [404, '图片文件不存在'],
  PRECONDITION_FAILED: [412, '图片请求前提条件不满足'],
  DELIVERY_FAILED: [500, '图片读取失败，请稍后重试'],
} as const;

export type DeliveryErrorCode = keyof typeof deliveryErrors;

export function isDeliveryErrorCode(code: unknown): code is DeliveryErrorCode {
  return typeof code === 'string' && Object.hasOwn(deliveryErrors, code);
}

export function deliveryError(code: DeliveryErrorCode) {
  const [status, message] = deliveryErrors[code];
  return Object.assign(new Error(message), { status, code });
}
