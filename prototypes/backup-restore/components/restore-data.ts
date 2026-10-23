export type RestoreScope = 'local' | 'mixed';
export type RestorePhase =
  | 'import'
  | 'review'
  | 'destinations'
  | 'confirm'
  | 'restoring'
  | 'failed'
  | 'ready'
  | 'login';
export type TargetFields = {
  endpoint: string;
  region: string;
  bucket: string;
  pathPrefix: string;
  accessKey: string;
  secretKey: string;
};
export type RestoreTarget = {
  id: string;
  name: string;
  images: number;
  size: string;
  fields: TargetFields;
  status: 'untested' | 'testing' | 'passed' | 'failed';
  errors: Partial<Record<keyof TargetFields, string>>;
};

export const restoreSteps = ['导入备份', '核对内容', '配置存储', '确认恢复'];
export const emptyTargetFields: TargetFields = {
  endpoint: '',
  region: '',
  bucket: '',
  pathPrefix: '',
  accessKey: '',
  secretKey: '',
};

export function initialTargets(): RestoreTarget[] {
  return [
    { id: 'travel', name: '旅行照片', images: 680, size: '4.8 GB' },
    { id: 'portfolio', name: '作品归档', images: 320, size: '2.6 GB' },
  ].map((target) => ({
    ...target,
    fields: { ...emptyTargetFields },
    status: 'untested',
    errors: {},
  }));
}

export function demoTarget(target: RestoreTarget): RestoreTarget {
  return {
    ...target,
    fields: {
      endpoint: 'https://s3.example.invalid',
      region: 'auto',
      bucket: 'ariso-restored-demo',
      pathPrefix: 'restored/' + target.id,
      accessKey: 'DEMO_ACCESS_KEY',
      secretKey: 'demo-secret-not-real',
    },
    status: 'untested',
    errors: {},
  };
}

export function validWebAddress(value: string) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function targetErrors(fields: TargetFields) {
  const errors: RestoreTarget['errors'] = {};
  if (!validWebAddress(fields.endpoint))
    errors.endpoint = '填写完整的 HTTP 或 HTTPS 地址。';
  if (!fields.region.trim())
    errors.region = '填写区域；服务商不要求时可填 auto。';
  if (!fields.bucket.trim()) errors.bucket = '填写新的 Bucket 名称。';
  if (!fields.accessKey.trim()) errors.accessKey = '填写 Access Key。';
  if (!fields.secretKey.trim()) errors.secretKey = '填写 Secret Key。';
  return errors;
}
