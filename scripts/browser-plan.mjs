import assert from 'node:assert/strict';

// A focused suite owns its accepted phases, page boundary and execution plan.
const suites = {
  full: {
    primaryPage: true,
    stages: [
      ['admin-motion', 'admin-motion'],
      ['library-motion', 'library-motion'],
      ['library-batch', 'library-batch'],
      ['library-batch-reprocess', 'library-reprocess'],
      ['library-copy', 'library-copy'],
      ['trash-query-batch', 'trash-query-batch'],
      ['trash-cleanup', 'trash-cleanup'],
      ['shell-navigation', 'shell-navigation'],
      ['albums', 'albums'],
      ['album-motion', 'album-motion'],
      ['album-cover', 'album-cover'],
      ['tags', 'tags'],
      // Tags cleanup leaves the empty state needed by theme navigation checks.
      // Later upload scenarios create their own real tags.
      ['theme', 'theme'],
      ['upload-settings', 'upload-settings'],
      ['upload', 'upload'],
      ['upload-polling', 'upload-polling'],
      ['upload-input', 'upload-input'],
      ['upload-submissions', 'upload-submissions'],
      ['upload-relations', 'upload-relations'],
      ['collection-shortcuts', 'collection-shortcuts'],
      ['upload-usage', 'upload-usage'],
      ['sharing-management', 'sharing-management'],
      ['site-general', 'site-general'],
      ['site-branding', 'site-branding'],
      ['analytics', 'analytics'],
      ['password-reset', 'password-reset'],
      ['smtp', 'smtp'],
      ['uiux-p1', 'uiux-p1'],
      ['uiux-20261015', 'uiux-20261015'],
      ['image-workflows', 'image-workflows'],
      ['image-editor', 'image-editor'],
      ['smart-collections-dedup', 'smart-collections-dedup'],
      ['access-protection', 'access-protection'],
    ],
  },
  'image-editor': { stages: [['image-editor', 'imageEditor']] },
  'brand-experiment': {},
  'image-workflows': {
    stages: [['image-workflows', 'imageWorkflows']],
  },
  'smart-collections-dedup': {
    stages: [['smart-collections-dedup', 'smartCollectionsDedup']],
  },
  'access-protection': {
    stages: [['access-protection', 'accessProtection']],
  },
  branding: {},
  backup: {},
  'sharing-experiment': {},
  'sharing-protocol': {},
  'sharing-public': {
    only: ['representative', 'behavior', 'race', 'recovery', 'gallery'],
    config: (only) => ({ sharingPublicPhase: only }),
  },
  'sharing-viewer': {
    only: ['representative', 'interactions', 'revocation', 'race'],
    config: (only) => ({ sharingViewerPhase: only }),
  },
  'sharing-management': {
    only: ['representative', 'behavior', 'recovery'],
    stages: [['sharing-management', 'sharingManagement']],
    config: (only) => ({ sharingManagementPhase: only }),
  },
  'site-general': {
    only: ['representative', 'behavior', 'recovery', 'consumers'],
    stages: [['site-general', 'siteGeneral']],
    config: (only) => ({ siteGeneralPhase: only }),
  },
  'site-branding': {
    only: ['representative', 'behavior', 'recovery', 'consumers'],
    stages: [['site-branding', 'siteBranding']],
    config: (only) => ({ siteBrandingPhase: only }),
  },
  analytics: {
    only: [
      'representative',
      'behavior',
      'recovery',
      'consumers',
      'detail',
      'shell',
    ],
    stages: [['analytics', 'analytics']],
    config: (only) => ({ analyticsPhase: only }),
  },
  theme: {
    only: ['representative', 'behavior', 'consumers'],
    stages: [['theme', 'theme']],
    config: (only) => ({ themePhase: only }),
  },
  account: { stages: [['account', 'account']] },
  'identity-session': {
    stages: [['identity-session-scene', 'identitySession']],
    config: () => ({ width: 1440 }),
  },
  'workspace-continuity': {
    primaryPage: true,
    stages: [['workspace-continuity', 'workspaceContinuity']],
    config: () => ({ width: 1440 }),
  },
  oauth: {},
  'password-reset': {
    only: ['representative', 'interactions', 'recovery'],
    stages: [['password-reset', 'passwordReset']],
    config: (only) => ({ passwordResetPhase: only }),
  },
  smtp: {
    only: ['representative', 'interactions', 'recovery', 'focus'],
    stages: [['smtp', 'smtp']],
    config: (only) => ({ smtpPhase: only }),
  },
  tokens: {
    only: [
      'representative',
      'behavior',
      'lifecycle',
      'recovery',
      'create-recovery',
      'action-recovery',
      'consumers',
    ],
    stages: [['tokens', 'tokens']],
    config: (only) => ({ tokensPhase: only }),
  },
  library: {
    only: ['recovery', 'consumers', 'sizes'],
    stages: [['library', 'library']],
    config: (only) => ({ libraryPhase: only }),
  },
  'library-feedback': {
    primaryPage: true,
    stages: [['library-query', 'libraryFeedback']],
    config: () => ({ libraryQueryPhase: 'feedback' }),
  },
  'library-motion': { stages: [['library-motion', 'libraryMotion']] },
  'admin-motion': { stages: [['admin-motion', 'adminMotion']] },
  'shell-navigation': { stages: [['shell-navigation', 'shellNavigation']] },
  albums: { primaryPage: true, stages: [['albums', 'albums']] },
  'uiux-p1': { primaryPage: true, stages: [['uiux-p1', 'uiuxP1']] },
  'uiux-20261015': {
    primaryPage: true,
    only: ['settings', 'collections', 'upload', 'viewer', 'metadata'],
    stages: [['uiux-20261015', 'uiux20261015']],
    config: (only) => ({ uiux20261015Phase: only }),
  },
  'album-motion': {
    stages: [['album-motion', 'albumMotion']],
  },
  'collection-shortcuts': {
    only: ['upload', 'picker', 'menus', 'regressions'],
    stages: [['collection-shortcuts', 'collectionShortcuts']],
    config: (only) => ({ shortcutPhase: only }),
  },
  'album-cover': { primaryPage: true, stages: [['album-cover', 'albumCover']] },
  tags: { primaryPage: true, stages: [['tags', 'tags']] },
  'upload-settings': {
    only: ['representative', 'behavior', 'recovery', 'consumers'],
    stages: [['upload-settings', 'upload-settings']],
    config: (only) => ({ uploadSettingsPhase: only }),
  },
  'upload-input': {
    primaryPage: true,
    stages: [['upload-input', 'uploadInput']],
  },
  'upload-usage': {
    primaryPage: true,
    only: ['representative', 'interactions', 'recovery'],
    stages: [['upload-usage', 'uploadUsage']],
    config: (only) => ({ uploadUsagePhase: only }),
  },
  viewer: {
    only: [
      'representative',
      'behavior',
      'recovery',
      'refresh',
      'consumers',
      'deleted-source',
      'pending-navigation',
      'tiff-preview',
    ],
    stages: [['library-viewer-run', 'libraryViewer']],
    config: (only) => ({
      viewerRepresentativeOnly: only === 'representative',
      viewerCheck: only,
    }),
  },
  upload: {
    only: ['relations', 'submissions'],
    stages: (only) =>
      only === undefined
        ? [
            ['upload-submissions', 'uploadSubmissions'],
            ['upload-relations', 'uploadRelations'],
          ]
        : [
            [
              `upload-${only}`,
              only === 'relations' ? 'uploadRelations' : 'uploadSubmissions',
            ],
          ],
  },
  'upload-regression': {
    only: ['main'],
    stages: (only) =>
      only === 'main'
        ? [['upload', 'upload']]
        : [
            ['upload', 'upload'],
            ['upload-polling', 'uploadPolling'],
          ],
  },
  'm2-mobile': { primaryPage: true },
  'upload-s3': {
    only: ['cleanup'],
    stages: [['upload-s3', 'uploadS3']],
    config: (only) => ({ onlyCleanup: only === 'cleanup' }),
  },
  'copy-dropdown': {
    stages: [['library-copy-dropdown', 'copyDropdown']],
    config: () => ({ phase: 'green' }),
  },
  'library-batch': {
    only: [
      'representative',
      'visibility',
      'feedback',
      'tag-states',
      'lifecycle',
      'cache',
      'review-fixes',
      'recovery',
    ],
    stages: [['library-batch', 'libraryBatch']],
    config: (only) => ({ libraryBatchPhase: only }),
  },
  'library-reprocess': {
    stages: [['library-batch-reprocess', 'libraryReprocess']],
  },
  'library-copy': {
    only: ['representative', 'feedback', 'revision'],
    stages: [['library-copy', 'libraryCopy']],
    config: (only) => ({ libraryCopyPhase: only }),
  },
  'storage-admin': {
    only: ['live', 'dialogs', 'feedback', 'regressions'],
    stages: (only) => {
      if (only === 'live') return [['storage-admin-live', 'storageAdmin']];
      if (only === 'dialogs')
        return [['storage-admin-dialogs', 'storageAdmin']];
      if (only === 'feedback')
        return [['storage-admin-feedback', 'storageAdminFeedback']];
      if (only === 'regressions')
        return [['storage-admin-regressions', 'storageAdminRegressions']];
      return [
        ['storage-admin', 'storageAdmin'],
        ['shell-navigation', 'shellNavigation'],
      ];
    },
    config: (only) => ({ storageNavigation: only === undefined }),
  },
  'storage-cors': {
    primaryPage: true,
    stages: [['storage-cors', 'storageCors']],
  },
  processing: {
    only: ['representative', 'settings', 'preview', 'recovery', 'consumers'],
    stages: (only) =>
      only === undefined || only === 'consumers'
        ? [
            ['processing', 'processing'],
            ['shell-navigation', 'shellNavigation'],
          ]
        : [['processing', 'processing']],
    config: (only) => ({
      processingPhase: only,
      processingNavigationFixtures: only === undefined || only === 'consumers',
    }),
  },
  trash: {
    only: [
      'representative',
      'cleanup',
      'query-error',
      'confirmation',
      'approved-ui',
      'approved-results',
      'approved-query',
      'approved-progress',
      'review-fixes',
      'shortcut-focus',
    ],
    stages: (only) => {
      if (only === 'cleanup') return [['trash-cleanup', 'trashCleanup']];
      if (only !== undefined) return [['trash-query-batch', 'trashQueryBatch']];
      return [
        ['trash-query-batch', 'trashQueryBatch'],
        ['trash-cleanup', 'trashCleanup'],
      ];
    },
    config: (only) => ({ trashPhase: only }),
  },
};

/** @param {{ suite: string, only?: string, pageLabel: string, storageConfig?: string, previewConfig?: string }} options */
export function selectBrowserPlan({
  suite,
  only,
  pageLabel,
  storageConfig,
  previewConfig,
}) {
  const definition = Object.hasOwn(suites, suite) ? suites[suite] : undefined;
  assert.ok(definition, 'Unknown browser suite');
  assert.ok(
    only === undefined || definition.only?.includes(only),
    '--only requires an applicable targeted suite',
  );
  assert.ok(
    !previewConfig || (suite === 'storage-admin' && only === 'feedback'),
    '--preview-config applies only to storage-admin feedback',
  );
  assert.ok(
    !storageConfig ||
      suite === 'backup' ||
      (suite === 'storage-admin' && only === 'live'),
    '--storage-config applies only to storage-admin live or backup',
  );
  assert.match(pageLabel, /^p[1-9]\d*$/, 'Invalid EGO_PAGE_LABEL');
  assert.ok(
    !definition.primaryPage || pageLabel === 'p1',
    `Browser suite ${suite} requires EGO_PAGE_LABEL=p1`,
  );
  return {
    stages:
      typeof definition.stages === 'function'
        ? definition.stages(only)
        : (definition.stages ?? []),
    config: definition.config?.(only) ?? {},
  };
}
