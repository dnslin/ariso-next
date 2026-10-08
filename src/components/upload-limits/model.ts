import type { UploadSettingsInput } from '../../shared/upload-settings';

export const uploadLimitFields = [
  {
    name: 'maxFileMiB',
    label: '单文件上限（MiB）',
    description: '填写正整数；1 MiB = 1,048,576 字节。',
  },
  {
    name: 'batchSize',
    label: '每批文件数量',
    description: '1–200 张，且不能超过队列上限。',
  },
  {
    name: 'queueLimit',
    label: '队列上限',
    description: '100–2000 条，包含成功和失败结果。清空已完成后释放名额。',
  },
] as const;

export function uploadLimitsInput(
  value: UploadSettingsInput,
): UploadSettingsInput {
  return {
    maxFileMiB: value.maxFileMiB,
    batchSize: value.batchSize,
    queueLimit: value.queueLimit,
  };
}

export function uploadLimitsMatch(
  a: UploadSettingsInput,
  b: UploadSettingsInput,
) {
  return uploadLimitFields.every(({ name }) => a[name] === b[name]);
}
