import { defineConfig } from 'vitest/config';

// Historical prototypes have production replacements. Run them explicitly.
const experimentTests = [
  'tests/experiments/analytics/collector.test.ts',
  'tests/unit/collections/unicode-experiment.test.ts',
  'tests/unit/storage/s3-protocol.test.ts',
  'tests/unit/sharing/client.test.ts',
  'tests/integration/analytics/{lifecycle,scale,usage,usage-remote}.test.ts',
  'tests/integration/collections/unicode-experiment.test.ts',
  'tests/integration/identity/{api-key,api-key-http,cli-reset,database,github,http,reset-password,smtp}.test.ts',
  'tests/integration/library/sqlite-query.test.ts',
  'tests/integration/sharing/http.test.ts',
  'tests/integration/media/{process-experiment,resource-measurement}.test.ts',
  'tests/integration/storage/{late-put-*,local-experiment,s3-protocol,s3-runner}.test.ts',
  'tests/integration/upload/transport.test.ts',
];

// Browser acceptance and its tooling run locally, outside GitHub Actions.
const browserToolingTests =
  process.env.GITHUB_ACTIONS === 'true'
    ? [
        'tests/unit/runtime/browser-*.test.ts',
        'tests/unit/runtime/analytics-fixture.test.ts',
        'tests/unit/runtime/oauth-transport.test.ts',
        'tests/unit/runtime/sharing-browser-errors.test.ts',
        'tests/unit/scripts/{browser-control,browser-errors,upload-control}.test.ts',
        'tests/integration/identity/browser-runner.test.ts',
        'tests/integration/runtime/ui-browser-runner.test.ts',
        'tests/integration/storage/browser-evidence.test.ts',
      ]
    : [];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          exclude: [...browserToolingTests, ...experimentTests],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          exclude: [
            ...browserToolingTests,
            ...experimentTests,
            'tests/integration/delivery/formats.test.ts',
            'tests/integration/delivery/reprocess.test.ts',
            'tests/integration/media/metadata.test.ts',
            'tests/integration/media/metadata-http.test.ts',
            'tests/integration/media/process.test.ts',
            'tests/integration/media/reprocess.test.ts',
            'tests/integration/media/reprocess-http.test.ts',
            'tests/integration/media/watermark.test.ts',
            'tests/integration/media/preview.test.ts',
            'tests/integration/media/preview-http.test.ts',
            'tests/integration/media/formats.test.ts',
            'tests/integration/media/format-recovery.test.ts',
            'tests/integration/upload/formats.test.ts',
            'tests/integration/media/file-formats.test.ts',
            'tests/integration/media/svg.test.ts',
            'tests/integration/site/brand-parser.test.ts',
            'tests/integration/site/branding.test.ts',
            'tests/integration/site/branding-http.test.ts',
            'tests/integration/media/watermark-validation.test.ts',
            'tests/integration/media/watermark-assets.test.ts',
            'tests/integration/media/watermark-http.test.ts',
            'tests/integration/media/watermark-runtime.test.ts',
            'tests/integration/media/formats-tools.test.ts',
            'tests/integration/media/recovery-tools.test.ts',
            'tests/integration/media/delete-tools.test.ts',
            'tests/integration/upload/local.test.ts',
            'tests/integration/upload/local-http.test.ts',
            'tests/integration/upload/api.test.ts',
            'tests/integration/upload/usage.test.ts',
            'tests/integration/upload/public-receive.test.ts',
            'tests/integration/upload/s3.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'media-tools',
          environment: 'node',
          include: [
            'tests/integration/delivery/formats.test.ts',
            'tests/integration/delivery/reprocess.test.ts',
            'tests/integration/media/metadata.test.ts',
            'tests/integration/media/metadata-http.test.ts',
            'tests/integration/media/process.test.ts',
            'tests/integration/media/reprocess.test.ts',
            'tests/integration/media/reprocess-http.test.ts',
            'tests/integration/media/watermark.test.ts',
            'tests/integration/media/preview.test.ts',
            'tests/integration/media/preview-http.test.ts',
            'tests/integration/media/formats.test.ts',
            'tests/integration/media/format-recovery.test.ts',
            'tests/integration/upload/formats.test.ts',
            'tests/integration/media/file-formats.test.ts',
            'tests/integration/media/svg.test.ts',
            'tests/integration/site/brand-parser.test.ts',
            'tests/integration/site/branding.test.ts',
            'tests/integration/site/branding-http.test.ts',
            'tests/integration/media/watermark-validation.test.ts',
            'tests/integration/media/watermark-assets.test.ts',
            'tests/integration/media/watermark-http.test.ts',
            'tests/integration/media/watermark-runtime.test.ts',
            'tests/integration/media/formats-tools.test.ts',
            'tests/integration/media/recovery-tools.test.ts',
            'tests/integration/media/delete-tools.test.ts',
            'tests/integration/upload/local.test.ts',
            'tests/integration/upload/local-http.test.ts',
            'tests/integration/upload/api.test.ts',
            'tests/integration/upload/usage.test.ts',
            'tests/integration/upload/public-receive.test.ts',
            'tests/integration/upload/s3.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'experiments',
          environment: 'node',
          include: experimentTests,
        },
      },
    ],
  },
});
