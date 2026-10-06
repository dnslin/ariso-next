import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Own the three sharing fixtures, their private logs and their final cleanup. */
export function createSharingRunner({
  signal,
  runBrowser,
  pageLabel,
  output,
  report,
  secrets,
  setupCodes,
  redact,
}) {
  const fixtures = new Set();
  async function runSharingExperiment(spaceId) {
    const { launchSharing } =
      await import('../tests/experiments/sharing/harness.ts');
    const sharingFixture = await launchSharing(signal);
    fixtures.add(sharingFixture);
    try {
      secrets.push('sharing-password', 'sharing-experiment-password');
      report.sharingOrigin = sharingFixture.origin;
      await runBrowser(
        '../tests/experiments/sharing/browser.mjs',
        { origin: sharingFixture.origin, spaceId, pageLabel, output },
        'sharing-experiment.log',
      );
      report.sharingExperiment = 'passed';
      report.sharingBrowserContexts = 'unverified';
    } finally {
      try {
        await writeFile(
          join(output, 'sharing-server.log'),
          redact(sharingFixture.logs()),
        );
      } finally {
        await sharingFixture.stop();
        fixtures.delete(sharingFixture);
      }
    }
  }
  async function runSharingProtocol(spaceId) {
    const { launchSharingProtocol } =
      await import('../e2e/sharing-protocol-fixture.ts');
    const sharingFixture = await launchSharingProtocol(signal);
    fixtures.add(sharingFixture);
    try {
      secrets.push(
        'sharing-protocol-password',
        ...sharingFixture.browserInput.tokens,
        ...setupCodes(sharingFixture.logs()),
      );
      await runBrowser(
        '../e2e/sharing-protocol.mjs',
        { ...sharingFixture.browserInput, spaceId, pageLabel, output },
        'sharing-protocol.log',
      );
      await sharingFixture.verify();
      report.sharingProtocol = 'passed';
    } finally {
      try {
        await writeFile(
          join(output, 'sharing-protocol-server.log'),
          redact(sharingFixture.logs()),
        );
      } finally {
        await sharingFixture.stop();
        fixtures.delete(sharingFixture);
      }
    }
  }
  async function runSharingPublic(spaceId, sharingPublicPhase) {
    const { launchSharingPublic } =
      await import('../e2e/sharing-public-fixture.mjs');
    const fixture = await launchSharingPublic(signal);
    fixtures.add(fixture);
    try {
      secrets.push(
        fixture.browserInput.password,
        fixture.browserInput.credentials.password,
        ...Object.values(fixture.browserInput.albums).map(
          (album) => album.token,
        ),
        ...setupCodes(fixture.logs()),
      );
      await runBrowser(
        '../e2e/sharing-public.mjs',
        {
          ...fixture.browserInput,
          sharingPublicPhase,
          spaceId,
          pageLabel,
          output,
          nodeExecutable: process.execPath,
          projectDirectory: resolve('.'),
          identitySessionScript: pathToFileURL(
            resolve('e2e/identity-session.mjs'),
          ).href,
          geometryScript: pathToFileURL(resolve('e2e/browser-geometry.mjs'))
            .href,
          errorsScript: pathToFileURL(resolve('e2e/browser-errors.mjs')).href,
          sharingErrorsScript: pathToFileURL(
            resolve('e2e/sharing-public-errors.mjs'),
          ).href,
        },
        'sharing-public.log',
      );
      await fixture.verify();
      report.sharingPublic = 'passed';
    } finally {
      try {
        await writeFile(
          join(output, 'sharing-public-server.log'),
          redact(fixture.logs()),
        );
      } finally {
        await fixture.stop();
        fixtures.delete(fixture);
      }
    }
  }
  async function stopFixtures() {
    const results = await Promise.allSettled(
      [...fixtures].map(async (fixture) => {
        await fixture.stop();
        fixtures.delete(fixture);
      }),
    );
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (errors.length)
      throw new AggregateError(
        errors,
        `Sharing fixture cleanup failed:\n${errors.map((error) => error.stack ?? String(error)).join('\n')}`,
      );
  }
  return {
    runExperiment: runSharingExperiment,
    runProtocol: runSharingProtocol,
    runPublic: runSharingPublic,
    stop: stopFixtures,
  };
}
