import type {
  RestoreRemoteTarget,
  RestoreRemoteTargetInput,
} from '../../server/backup/restore-remote-types';

export function remoteTargetInitial(
  target?: RestoreRemoteTarget,
): RestoreRemoteTargetInput {
  return {
    endpoint: target?.endpoint ?? '',
    region: target?.region ?? 'auto',
    bucket: target?.bucket ?? '',
    pathPrefix: target?.pathPrefix ?? '',
    forcePathStyle: target?.forcePathStyle ?? false,
    accessKey: '',
    secretKey: '',
  };
}
export function remoteTargetDirty(
  input: RestoreRemoteTargetInput,
  target?: RestoreRemoteTarget,
) {
  return (
    !target ||
    (
      ['endpoint', 'region', 'bucket', 'pathPrefix', 'forcePathStyle'] as const
    ).some((key) => input[key] !== target[key]) ||
    !!input.accessKey ||
    !!input.secretKey
  );
}
export function remoteTargetPayload(
  input: RestoreRemoteTargetInput,
): RestoreRemoteTargetInput {
  const { accessKey, secretKey, ...location } = input;
  return {
    ...location,
    ...(accessKey ? { accessKey } : {}),
    ...(secretKey ? { secretKey } : {}),
  };
}
export function remoteTargetErrors(
  input: RestoreRemoteTargetInput,
  configured: boolean,
) {
  const errors: Record<string, string> = {};
  if (!input.endpoint.trim()) errors.endpoint = '请输入新 S3 的服务地址';
  if (!input.region.trim())
    errors.region = '请输入区域；服务商不要求时可填 auto';
  if (!input.bucket.trim()) errors.bucket = '请输入新的 Bucket 名称';
  if (!configured && !input.accessKey) errors.accessKey = '请输入 Access Key';
  if (!configured && !input.secretKey) errors.secretKey = '请输入 Secret Key';
  return errors;
}
export function remoteTargetsReady(
  storageIds: string[],
  targets: RestoreRemoteTarget[],
  drafts: Record<string, RestoreRemoteTargetInput>,
) {
  return storageIds.every((id) => {
    const target = targets.find((item) => item.storageId === id);
    return (
      target &&
      target.credentialsConfigured &&
      !target.cleanupPending &&
      target.testStatus === 'passed' &&
      target.testedRevision === target.revision &&
      (!drafts[id] || !remoteTargetDirty(drafts[id], target))
    );
  });
}
