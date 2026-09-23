import type { Service } from '../storage-s3/config.ts';

export type Outcome = 'passed' | 'size-rejected' | 'failed' | 'not-run';
export type Sample = { bytes: number; put: Outcome; copy: Outcome };

export function summarizeBoundary(samples: Sample[]) {
  const successes = samples
    .filter((sample) => sample.put === 'passed' && sample.copy === 'passed')
    .map((sample) => sample.bytes);
  const rejections = samples
    .filter(
      (sample) =>
        sample.put === 'size-rejected' || sample.copy === 'size-rejected',
    )
    .map((sample) => sample.bytes);
  const maximumSuccessfulBytes = successes.length
    ? Math.max(...successes)
    : null;
  const firstRejectedBytes = rejections.length ? Math.min(...rejections) : null;
  return {
    maximumSuccessfulBytes,
    firstRejectedBytes,
    exactBytes:
      maximumSuccessfulBytes !== null &&
      firstRejectedBytes === maximumSuccessfulBytes + 1
        ? maximumSuccessfulBytes
        : null,
  };
}

export function commonCapacity(samples: Record<Service, Sample[]>) {
  const groups = Object.values(samples);
  const candidates = [
    ...new Set(
      groups
        .flat()
        .filter((sample) => sample.put === 'passed' && sample.copy === 'passed')
        .map((sample) => sample.bytes),
    ),
  ].sort((a, b) => b - a);
  const bytes = candidates.find(
    (candidate) =>
      groups.every((group) =>
        group.some(
          (sample) =>
            sample.bytes === candidate &&
            sample.put === 'passed' &&
            sample.copy === 'passed',
        ),
      ) &&
      groups.some((group) => summarizeBoundary(group).exactBytes === candidate),
  );
  if (bytes === undefined) return null;
  const maximumMiB = Math.floor(bytes / 1_048_576);
  return {
    bytes,
    maximumMiB,
    maximumConfiguredBytes: maximumMiB * 1_048_576,
    defaultBytes: 50 * 1_048_576,
  };
}
