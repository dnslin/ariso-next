import type { AccessProtectionInput } from '../../server/access-protection/types';

export const accessProtectionPath = '/settings/general/access-protection';
export const protectionModeLabels = {
  off: '关闭',
  observe: '仅观察',
  enforce: '启用拦截',
} as const;
export const protectionFields = [
  {
    name: 'rate',
    label: '持续请求频率',
    unit: '次 / 秒 / IP',
    description:
      '同一 IP 每秒恢复的请求额度。不同图片、版本和匿名分享共用额度。',
  },
  {
    name: 'burst',
    label: '突发请求额度',
    unit: '次 / IP',
    description:
      '最多可积累的请求额度，用于容纳相册和外链页面的集中加载。额度会按持续频率恢复，不按单张图片的热度封禁。',
  },
] as const;

export function protectionInput(
  value: AccessProtectionInput,
): AccessProtectionInput {
  return { mode: value.mode, rate: value.rate, burst: value.burst };
}
export function protectionMatches(
  a: AccessProtectionInput,
  b: AccessProtectionInput,
) {
  return (
    a.mode === b.mode &&
    Object.is(a.rate, b.rate) &&
    Object.is(a.burst, b.burst)
  );
}
export function protectionSubmission(
  input: AccessProtectionInput,
  saved: AccessProtectionInput,
): AccessProtectionInput {
  return input.mode === 'off'
    ? { ...protectionInput(saved), mode: 'off' }
    : protectionInput(input);
}
