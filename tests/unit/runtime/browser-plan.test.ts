import { describe, expect, it } from 'vitest';
import { selectBrowserPlan } from '../../../scripts/browser-plan.mjs';

function select(suite: string, only?: string) {
  return selectBrowserPlan({ suite, only, pageLabel: 'p1' });
}

describe('focused browser execution plans', () => {
  it('provides storage-cors as a complete focused stage on its primary page', () => {
    expect(select('storage-cors')).toEqual({
      stages: [['storage-cors', 'storageCors']],
      config: {},
    });
    expect(() =>
      selectBrowserPlan({ suite: 'storage-cors', pageLabel: 'p2' }),
    ).toThrow('Browser suite storage-cors requires EGO_PAGE_LABEL=p1');
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
    ['oauth', []],
    ['tokens', ['tokens']],
    ['shell-navigation', ['shell-navigation']],
    ['sharing-management', ['sharing-management']],
    ['site-general', ['site-general']],
    ['albums', ['albums']],
    ['album-cover', ['album-cover']],
    ['tags', ['tags']],
    ['upload-settings', ['upload-settings']],
    ['upload-input', ['upload-input']],
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
    ['library-batch', 'recovery', ['library-batch']],

    ['sharing-management', 'representative', ['sharing-management']],
    ['sharing-management', 'behavior', ['sharing-management']],
    ['sharing-management', 'recovery', ['sharing-management']],
    ['site-general', 'representative', ['site-general']],
    ['site-general', 'behavior', ['site-general']],
    ['site-general', 'recovery', ['site-general']],
    ['site-general', 'consumers', ['site-general']],
    ['tokens', 'representative', ['tokens']],
    ['tokens', 'behavior', ['tokens']],
    ['tokens', 'lifecycle', ['tokens']],
    ['tokens', 'recovery', ['tokens']],
    ['tokens', 'create-recovery', ['tokens']],
    ['tokens', 'action-recovery', ['tokens']],
    ['tokens', 'consumers', ['tokens']],
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
    ['library', 'recovery', { libraryPhase: 'recovery' }],
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
        ['upload-settings', 'upload-settings'],
        ['upload', 'upload'],
        ['upload-polling', 'upload-polling'],
        ['upload-input', 'upload-input'],
        ['upload-submissions', 'upload-submissions'],
        ['upload-relations', 'upload-relations'],
        ['sharing-management', 'sharing-management'],
        ['site-general', 'site-general'],
      ],
      config: {},
    });
  });
});
