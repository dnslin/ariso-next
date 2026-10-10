import { describe, expect, it } from 'vitest';
import { selectBrowserPlan } from '../../../scripts/browser-plan.mjs';

function select(suite: string, only?: string) {
  return selectBrowserPlan({ suite, only, pageLabel: 'p1' });
}

describe('focused browser execution plans', () => {
  it('runs the real theme suite in full and scopes phase options to theme', () => {
    expect(select('full').stages).toContainEqual(['theme', 'theme']);
    const stages = select('full').stages.map(
      ([name]: [string, string]) => name,
    );
    expect(stages.indexOf('theme')).toBe(stages.indexOf('tags') + 1);
    expect(stages.indexOf('theme')).toBeLessThan(
      stages.indexOf('upload-relations'),
    );
    expect(select('theme')).toEqual({
      stages: [['theme', 'theme']],
      config: { themePhase: undefined },
    });
    for (const phase of ['representative', 'behavior', 'consumers'])
      expect(select('theme', phase)).toEqual({
        stages: [['theme', 'theme']],
        config: { themePhase: phase },
      });
    expect(select('full').config).not.toHaveProperty('themePhase');
    for (const suite of ['site-general', 'analytics', 'smtp', 'account'])
      expect(select(suite).config).not.toHaveProperty('themePhase');
    expect(() => select('theme', 'recovery')).toThrow('--only');
    for (const field of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'theme',
          pageLabel: 'p2',
          [field]: 'unused.json',
        }),
      ).toThrow();
  });

  it('keeps the brand experiment isolated from unrelated phase and fixture arguments', () => {
    expect(select('brand-experiment')).toEqual({ stages: [], config: {} });
    expect(() => select('brand-experiment', 'representative')).toThrow(
      '--only',
    );
    for (const field of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'brand-experiment',
          pageLabel: 'p1',
          [field]: 'unused.json',
        }),
      ).toThrow();
  });
  it('keeps production branding independent of unrelated phase and fixture options', () => {
    expect(select('branding')).toEqual({ stages: [], config: {} });
    expect(selectBrowserPlan({ suite: 'branding', pageLabel: 'p2' })).toEqual({
      stages: [],
      config: {},
    });
    expect(() => select('branding', 'representative')).toThrow('--only');
    for (const field of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'branding',
          pageLabel: 'p1',
          [field]: 'unused.json',
        }),
      ).toThrow();
  });

  it('provides storage-cors as a complete focused stage on its primary page', () => {
    expect(select('storage-cors')).toEqual({
      stages: [['storage-cors', 'storageCors']],
      config: {},
    });
    expect(() =>
      selectBrowserPlan({ suite: 'storage-cors', pageLabel: 'p2' }),
    ).toThrow('Browser suite storage-cors requires EGO_PAGE_LABEL=p1');
  });

  it.each([
    ['identity-session', 'identity-session-scene', 'identitySession'],
    ['workspace-continuity', 'workspace-continuity', 'workspaceContinuity'],
  ])(
    'selects the complete 1440px %s regression without unrelated phases',
    (suite, script, result) => {
      expect(select(suite)).toEqual({
        stages: [[script, result]],
        config: { width: 1440 },
      });
      for (const phase of [
        'representative',
        'behavior',
        'recovery',
        'consumers',
        'detail',
        'shell',
      ])
        expect(() => select(suite, phase)).toThrow('--only');
      for (const field of ['storageConfig', 'previewConfig'])
        expect(() =>
          selectBrowserPlan({ suite, pageLabel: 'p1', [field]: 'unused.json' }),
        ).toThrow();
      expect(select(suite).config).not.toHaveProperty('analyticsPhase');
      expect(select('full').stages).not.toContainEqual([script, result]);
    },
  );

  it('keeps the existing workspace primary-page boundary while identity can use the selected page', () => {
    expect(() =>
      selectBrowserPlan({ suite: 'workspace-continuity', pageLabel: 'p2' }),
    ).toThrow('EGO_PAGE_LABEL=p1');
    expect(
      selectBrowserPlan({ suite: 'identity-session', pageLabel: 'p2' }).config,
    ).toEqual({ width: 1440 });
  });

  it.each(['representative', 'cleanup', 'recovery', 'live'])(
    'rejects partial or unrelated phase %s in storage-cors',
    (only) => {
      expect(() => select('storage-cors', only)).toThrow(
        '--only requires an applicable targeted suite',
      );
    },
  );

  it.each([
    ['storageConfig', '--storage-config applies only to storage-admin live'],
    [
      'previewConfig',
      '--preview-config applies only to storage-admin feedback',
    ],
  ])('rejects unrelated %s in storage-cors', (field, message) => {
    expect(() =>
      selectBrowserPlan({
        suite: 'storage-cors',
        pageLabel: 'p1',
        [field]: 'unused.json',
      }),
    ).toThrow(message);
  });

  it.each([
    ['library', ['library']],
    ['library-feedback', ['library-query']],
    ['account', ['account']],
    ['identity-session', ['identity-session-scene']],
    ['workspace-continuity', ['workspace-continuity']],
    ['oauth', []],
    ['brand-experiment', []],
    ['branding', []],
    ['smtp', ['smtp']],
    ['password-reset', ['password-reset']],
    ['tokens', ['tokens']],
    ['shell-navigation', ['shell-navigation']],
    ['sharing-management', ['sharing-management']],
    ['site-general', ['site-general']],
    ['site-branding', ['site-branding']],
    ['theme', ['theme']],
    ['analytics', ['analytics']],
    ['albums', ['albums']],
    ['album-cover', ['album-cover']],
    ['tags', ['tags']],
    ['upload-settings', ['upload-settings']],
    ['upload-input', ['upload-input']],
    ['upload-usage', ['upload-usage']],
    ['viewer', ['library-viewer-run']],
    ['upload', ['upload-submissions', 'upload-relations']],
    ['upload-regression', ['upload', 'upload-polling']],
    ['upload-s3', ['upload-s3']],
    ['copy-dropdown', ['library-copy-dropdown']],
    ['library-batch', ['library-batch']],
    ['library-reprocess', ['library-batch-reprocess']],
    ['library-copy', ['library-copy']],
    ['storage-admin', ['storage-admin', 'shell-navigation']],
    ['storage-cors', ['storage-cors']],
    ['processing', ['processing', 'shell-navigation']],
    ['trash', ['trash-query-batch', 'trash-cleanup']],
  ] as const)(
    'keeps all default scenes and their order for %s',
    (suite, scripts) => {
      expect(select(suite).stages.map(([script]: string[]) => script)).toEqual(
        scripts,
      );
    },
  );

  it.each([
    ...['representative', 'behavior', 'recovery', 'consumers'].map(
      (phase) => ['upload-settings', phase, ['upload-settings']] as const,
    ),
    ['upload', 'relations', ['upload-relations']],
    ['upload', 'submissions', ['upload-submissions']],
    ['upload-regression', 'main', ['upload']],
    ['storage-admin', 'live', ['storage-admin-live']],
    ['storage-admin', 'dialogs', ['storage-admin-dialogs']],
    ['storage-admin', 'feedback', ['storage-admin-feedback']],
    ['storage-admin', 'regressions', ['storage-admin-regressions']],
    ['processing', 'consumers', ['processing', 'shell-navigation']],
    ['processing', 'settings', ['processing']],
    ['trash', 'cleanup', ['trash-cleanup']],
    ['trash', 'approved-results', ['trash-query-batch']],
    ['library', 'recovery', ['library']],
    ['library', 'consumers', ['library']],
    ['library-batch', 'recovery', ['library-batch']],
    ['smtp', 'representative', ['smtp']],
    ['smtp', 'interactions', ['smtp']],
    ['smtp', 'recovery', ['smtp']],
    ['password-reset', 'representative', ['password-reset']],
    ['password-reset', 'interactions', ['password-reset']],
    ['password-reset', 'recovery', ['password-reset']],
    ['smtp', 'focus', ['smtp']],

    ['sharing-management', 'representative', ['sharing-management']],
    ['sharing-management', 'behavior', ['sharing-management']],
    ['sharing-management', 'recovery', ['sharing-management']],
    ['site-general', 'representative', ['site-general']],
    ['site-general', 'behavior', ['site-general']],
    ['site-general', 'recovery', ['site-general']],
    ['site-general', 'consumers', ['site-general']],
    ...[
      'representative',
      'behavior',
      'recovery',
      'consumers',
      'detail',
      'shell',
    ].map((phase) => ['analytics', phase, ['analytics']] as const),
    ['tokens', 'representative', ['tokens']],
    ['tokens', 'behavior', ['tokens']],
    ['tokens', 'lifecycle', ['tokens']],
    ['tokens', 'recovery', ['tokens']],
    ['tokens', 'create-recovery', ['tokens']],
    ['tokens', 'action-recovery', ['tokens']],
    ['tokens', 'consumers', ['tokens']],
    ['upload-usage', 'representative', ['upload-usage']],
    ['upload-usage', 'interactions', ['upload-usage']],
    ['upload-usage', 'recovery', ['upload-usage']],
  ] as const)(
    'selects the actual scenes for %s / %s',
    (suite, only, scripts) => {
      expect(
        select(suite, only).stages.map(([script]: string[]) => script),
      ).toEqual(scripts);
    },
  );

  it.each([
    ['upload-settings', 'recovery', { uploadSettingsPhase: 'recovery' }],
    ['site-general', 'recovery', { siteGeneralPhase: 'recovery' }],
    ...[
      'representative',
      'behavior',
      'recovery',
      'consumers',
      'detail',
      'shell',
    ].map((phase) => ['analytics', phase, { analyticsPhase: phase }] as const),
    ['library', 'recovery', { libraryPhase: 'recovery' }],
    ['library', 'consumers', { libraryPhase: 'consumers' }],
    ['smtp', 'representative', { smtpPhase: 'representative' }],
    ['smtp', 'interactions', { smtpPhase: 'interactions' }],
    ['smtp', 'recovery', { smtpPhase: 'recovery' }],
    [
      'password-reset',
      'representative',
      { passwordResetPhase: 'representative' },
    ],
    ['password-reset', 'interactions', { passwordResetPhase: 'interactions' }],
    ['password-reset', 'recovery', { passwordResetPhase: 'recovery' }],
    ['smtp', 'focus', { smtpPhase: 'focus' }],
    ['tokens', 'recovery', { tokensPhase: 'recovery' }],
    ['tokens', 'lifecycle', { tokensPhase: 'lifecycle' }],
    ['tokens', 'create-recovery', { tokensPhase: 'create-recovery' }],
    ['tokens', 'action-recovery', { tokensPhase: 'action-recovery' }],
    [
      'sharing-public',
      'representative',
      { sharingPublicPhase: 'representative' },
    ],
    ['sharing-public', 'behavior', { sharingPublicPhase: 'behavior' }],
    ['sharing-public', 'race', { sharingPublicPhase: 'race' }],
    ['sharing-public', 'recovery', { sharingPublicPhase: 'recovery' }],
    [
      'sharing-viewer',
      'representative',
      { sharingViewerPhase: 'representative' },
    ],
    ['sharing-viewer', 'interactions', { sharingViewerPhase: 'interactions' }],
    ['sharing-viewer', 'revocation', { sharingViewerPhase: 'revocation' }],
    ['sharing-viewer', 'race', { sharingViewerPhase: 'race' }],
    [
      'viewer',
      'recovery',
      { viewerRepresentativeOnly: false, viewerCheck: 'recovery' },
    ],
    [
      'processing',
      'recovery',
      { processingPhase: 'recovery', processingNavigationFixtures: false },
    ],
    ['library-copy', 'revision', { libraryCopyPhase: 'revision' }],
    ['library-batch', 'cache', { libraryBatchPhase: 'cache' }],
    ['library-batch', 'recovery', { libraryBatchPhase: 'recovery' }],
    ['trash', 'approved-results', { trashPhase: 'approved-results' }],
    ['upload-s3', 'cleanup', { onlyCleanup: true }],
    ['sharing-management', 'recovery', { sharingManagementPhase: 'recovery' }],
  ] as const)(
    'passes only the owning scene fields for %s / %s',
    (suite, only, config) => {
      expect(select(suite, only).config).toEqual(config);
    },
  );

  it('executes all branding UI phases by default and scopes focused phases to branding', () => {
    expect(select('full').stages).toContainEqual([
      'site-branding',
      'site-branding',
    ]);
    expect(select('site-branding')).toEqual({
      stages: [['site-branding', 'siteBranding']],
      config: { siteBrandingPhase: undefined },
    });
    for (const phase of ['representative', 'behavior', 'recovery', 'consumers'])
      expect(select('site-branding', phase)).toEqual({
        stages: [['site-branding', 'siteBranding']],
        config: { siteBrandingPhase: phase },
      });
    for (const suite of [
      'full',
      'branding',
      'site-general',
      'analytics',
      'processing',
    ])
      expect(select(suite).config).not.toHaveProperty('siteBrandingPhase');
    for (const phase of ['settings', 'detail', 'lifecycle'])
      expect(() => select('site-branding', phase)).toThrow('--only');
    for (const option of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'site-branding',
          pageLabel: 'p2',
          [option]: 'unused.json',
        }),
      ).toThrow();
    expect(
      selectBrowserPlan({ suite: 'site-branding', pageLabel: 'p2' }).stages,
    ).toEqual([['site-branding', 'siteBranding']]);
  });

  it('keeps site phases out of other scenes and preserves all site phases in full', () => {
    expect(select('site-general').config).toEqual({
      siteGeneralPhase: undefined,
    });
    expect(select('full').config).not.toHaveProperty('siteGeneralPhase');
    for (const suite of [
      'processing',
      'sharing-management',
      'account',
      'tokens',
    ]) {
      expect(select(suite).config).not.toHaveProperty('siteGeneralPhase');
      expect(() => select(suite, 'consumers-site')).toThrow(
        '--only requires an applicable targeted suite',
      );
    }
  });

  it('runs the existing library consumer in its own phase while the default library remains complete', () => {
    expect(select('library', 'consumers')).toEqual({
      stages: [['library', 'library']],
      config: { libraryPhase: 'consumers' },
    });
    expect(select('library').config).toEqual({ libraryPhase: undefined });
    expect(select('full').config).not.toHaveProperty('libraryPhase');
    for (const suite of [
      'analytics',
      'identity-session',
      'workspace-continuity',
    ])
      expect(select(suite).config).not.toHaveProperty('libraryPhase');
    expect(select('library', 'consumers').config).not.toHaveProperty(
      'analyticsPhase',
    );
    expect(() => select('library', 'detail')).toThrow('--only');
  });

  it('keeps analytics phases on its own scene and runs all phases by default on an independently selected page', () => {
    expect(selectBrowserPlan({ suite: 'analytics', pageLabel: 'p2' })).toEqual({
      stages: [['analytics', 'analytics']],
      config: { analyticsPhase: undefined },
    });
    expect(select('full').config).not.toHaveProperty('analyticsPhase');
    for (const suite of [
      'site-general',
      'processing',
      'upload-settings',
      'viewer',
      'smtp',
    ])
      expect(select(suite).config).not.toHaveProperty('analyticsPhase');
    for (const only of ['live', 'settings', 'race', 'interactions'])
      expect(() => select('analytics', only)).toThrow('--only');
    for (const field of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'analytics',
          pageLabel: 'p2',
          [field]: 'unused.json',
        }),
      ).toThrow();
  });

  it('keeps consumer navigation and representative viewer behavior explicit', () => {
    expect(select('sharing-management').config).toEqual({
      sharingManagementPhase: undefined,
    });
    expect(select('processing').config).toEqual({
      processingPhase: undefined,
      processingNavigationFixtures: true,
    });
    expect(select('processing', 'consumers').config).toEqual({
      processingPhase: 'consumers',
      processingNavigationFixtures: true,
    });
    expect(select('storage-admin').config).toEqual({ storageNavigation: true });
    expect(select('copy-dropdown').config).toEqual({ phase: 'green' });
    expect(select('viewer', 'representative').config).toEqual({
      viewerRepresentativeOnly: true,
      viewerCheck: 'representative',
    });
    expect(select('upload-regression', 'main').config).toEqual({});
    expect(select('account').config).toEqual({});
    expect(select('oauth').config).toEqual({});
    expect(select('library-feedback').config).toEqual({
      libraryQueryPhase: 'feedback',
    });

    expect(select('tokens').config).toEqual({ tokensPhase: undefined });
  });

  it('includes every existing business stage and all sharing scenes in the default full flow', () => {
    expect(select('full')).toEqual({
      stages: [
        ['library-batch', 'library-batch'],
        ['library-batch-reprocess', 'library-reprocess'],
        ['library-copy', 'library-copy'],
        ['trash-query-batch', 'trash-query-batch'],
        ['trash-cleanup', 'trash-cleanup'],
        ['shell-navigation', 'shell-navigation'],
        ['albums', 'albums'],
        ['album-cover', 'album-cover'],
        ['tags', 'tags'],
        ['theme', 'theme'],
        ['upload-settings', 'upload-settings'],
        ['upload', 'upload'],
        ['upload-polling', 'upload-polling'],
        ['upload-input', 'upload-input'],
        ['upload-submissions', 'upload-submissions'],
        ['upload-relations', 'upload-relations'],
        ['upload-usage', 'upload-usage'],
        ['sharing-management', 'sharing-management'],
        ['site-general', 'site-general'],
        ['site-branding', 'site-branding'],
        ['analytics', 'analytics'],

        ['password-reset', 'password-reset'],
        ['smtp', 'smtp'],
      ],
      config: {},
    });
  });

  it('keeps reset phases scoped while default full actually schedules recovery before SMTP', () => {
    expect(select('password-reset').config).toEqual({
      passwordResetPhase: undefined,
    });
    expect(select('full').stages).toContainEqual([
      'password-reset',
      'password-reset',
    ]);
    expect(select('full').config).not.toHaveProperty('passwordResetPhase');
    expect(() => select('password-reset', 'consumers')).toThrow('--only');
    for (const suite of [
      'smtp',
      'account',
      'tokens',
      'site-general',
      'processing',
    ])
      expect(select(suite).config).not.toHaveProperty('passwordResetPhase');
    for (const field of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'password-reset',
          pageLabel: 'p1',
          [field]: 'unused.json',
        }),
      ).toThrow();
  });

  it('rejects SMTP phases on other suites and unrelated scene options on SMTP', () => {
    expect(() => select('smtp', 'behavior')).toThrow('--only');
    expect(() => select('sharing-management', 'interactions')).toThrow(
      '--only',
    );
    for (const option of ['storageConfig', 'previewConfig'])
      expect(() =>
        selectBrowserPlan({
          suite: 'smtp',
          pageLabel: 'p1',
          [option]: '/fixture',
        }),
      ).toThrow();
  });
  it('limits upload usage phases to their own suite and keeps full execution complete', () => {
    expect(select('upload-usage', 'recovery')).toEqual({
      stages: [['upload-usage', 'uploadUsage']],
      config: { uploadUsagePhase: 'recovery' },
    });
    expect(select('full').stages).toContainEqual([
      'upload-usage',
      'upload-usage',
    ]);
    expect(select('full').config).not.toHaveProperty('uploadUsagePhase');
    for (const suite of ['upload', 'tokens', 'processing', 'upload-settings'])
      expect(select(suite).config).not.toHaveProperty('uploadUsagePhase');
    expect(() => select('upload-usage', 'consumers')).toThrow('--only');
    expect(() =>
      selectBrowserPlan({ suite: 'upload-usage', pageLabel: 'p2' }),
    ).toThrow('EGO_PAGE_LABEL=p1');
  });
});
