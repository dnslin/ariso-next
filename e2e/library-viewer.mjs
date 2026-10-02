import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seedViewerFixtures, viewerId } from './library-viewer-fixtures.mjs';
import {
  closeViewer,
  entry,
  openViewerDirect,
  viewerShot,
  waitViewerImage,
} from './library-viewer-helpers.mjs';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import {
  verifyViewerLayouts,
  verifyViewerLongName,
  verifyViewerShortViewport,
} from './library-viewer-layouts.mjs';
import { verifyViewerVersions } from './library-viewer-versions.mjs';
import { verifyViewerNavigation } from './library-viewer-navigation.mjs';
import { verifyViewerInteractions } from './library-viewer-interactions.mjs';
import { verifyViewerRecovery } from './library-viewer-recovery.mjs';
import {
  verifyViewerDecodeFailures,
  verifyViewerDeletedSource,
  verifyViewerPendingNavigation,
} from './library-viewer-boundaries.mjs';
import { verifyViewerConsumers } from './library-viewer-consumers.mjs';

export async function verifyLibraryViewer(context) {
  const { page, config, sql } = context;
  const representative = config.viewerRepresentativeOnly === true;
  const report = {
    status: 'failed',
    phase: config.viewerCheck ?? (representative ? 'representative' : 'full'),
    checks: [],
    layouts: [],
    screenshots: [],
    limitations: [
      'Ego Chromium; touch and missing Fullscreen capability are browser emulation, not physical device/Safari/soft-keyboard/notch verification.',
      'Screenshots and geometric assertions require independent Figma comparison and user manual acceptance; they do not grant design approval.',
    ],
  };
  let fixtures;
  try {
    fixtures = await seedViewerFixtures(config, sql);
    const viewerContext = { ...context, fixtures, report };
    if (config.viewerCheck === 'deleted-source') {
      await verifyViewerDeletedSource(viewerContext);
    } else if (config.viewerCheck === 'pending-navigation') {
      await verifyViewerPendingNavigation(viewerContext);
    } else if (config.viewerCheck === 'consumers') {
      await verifyViewerConsumers(viewerContext);
      await verifyViewerLongName(viewerContext);
    } else {
      if (config.viewerCheck === 'behavior')
        await setDetail171Theme(page, 'light');
      if (config.viewerCheck !== 'behavior') {
        if (representative) {
          await page.goto(`${config.origin}/library?image=${viewerId(7)}`);
          await page.waitForSelector('[data-testid="detail-body"]');
          for (const theme of ['light', 'dark']) {
            await setDetail171Theme(page, theme);
            for (const width of [1440, 390]) {
              await setDetail171Viewport(page, width);
              await page.waitForFunction(() =>
                [
                  ...document.querySelectorAll(
                    '[data-testid="detail-preview"]',
                  ),
                ].some(
                  (image) =>
                    image.getClientRects().length &&
                    image.complete &&
                    image.naturalWidth > 0,
                ),
              );
              await page.waitForSelector(entry);
              await viewerShot(page, config, report, `entry-${theme}-${width}`);
            }
          }
        }
        await openViewerDirect(page, config, viewerId(7));
        await waitViewerImage(page, viewerId(7), 'compressed');
        await verifyViewerLayouts(viewerContext, 'ready', representative);
        if (!representative) await verifyViewerShortViewport(viewerContext);
        await closeViewer(page);
        if (!representative) await verifyViewerVersions(viewerContext);
      }
      if (!representative) {
        await verifyViewerNavigation(viewerContext);
        await verifyViewerInteractions(viewerContext);
        await verifyViewerRecovery(viewerContext);
        await verifyViewerPendingNavigation(viewerContext);
        await verifyViewerDecodeFailures(viewerContext);
        await verifyViewerDeletedSource(viewerContext);
        await verifyViewerConsumers(viewerContext);
        await verifyViewerLongName(viewerContext);
      }
    }
    report.status = 'passed';
    context.report?.checks.push(...report.checks);
    context.report?.layouts.push(...report.layouts);
  } catch (error) {
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    await fixtures?.cleanup();
    await writeFile(
      join(config.output, 'library-viewer.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}
