import assert from 'node:assert/strict';
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
    rangeAdjustments: [
      'User manual feedback supersedes the former ready/zoom header, versions, caption and footer design: normal viewer is now a viewport picture stage with only an icon close control. The entry is also an icon; saved-version choice is performed in detail and inherited on entry.',
      'Native Fullscreen controls/capability/error-portal checks are no longer applicable because the user removed that feature from the viewer. Viewport containment, keyboard/swipe navigation, gesture zoom/pan, Escape and required error recovery remain actual behavior checks.',
    ],
    limitations: [
      'Ego Chromium; touch is browser emulation, not physical device/Safari/soft-keyboard/notch verification.',
      'Screenshots and geometric assertions require independent review against the revised user instruction and remaining applicable Figma error states, plus user manual acceptance; they do not grant design approval.',
    ],
  };
  let fixtures;
  try {
    report.stage = 'fixture-seed';
    fixtures = await seedViewerFixtures(config, sql);
    const viewerContext = { ...context, fixtures, report };
    if (config.viewerCheck === 'recovery') {
      report.stage = 'recovery';
      await verifyViewerRecovery(viewerContext);
    } else if (config.viewerCheck === 'deleted-source') {
      report.stage = 'deleted-source';
      await verifyViewerDeletedSource(viewerContext);
    } else if (config.viewerCheck === 'pending-navigation') {
      report.stage = 'pending-navigation';
      await verifyViewerPendingNavigation(viewerContext);
    } else if (config.viewerCheck === 'consumers') {
      report.stage = 'consumers';
      await verifyViewerConsumers(viewerContext);
      report.stage = 'long-name';
      await verifyViewerLongName(viewerContext);
    } else {
      if (config.viewerCheck === 'behavior')
        await setDetail171Theme(page, 'light');
      if (config.viewerCheck !== 'behavior') {
        report.stage = 'representative-entry';
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
              const control = await page.evaluate(() => {
                const button = document.querySelector(
                  '[data-testid="detail-viewer-entry"]',
                );
                const rect = button.getBoundingClientRect();
                return {
                  name: button.getAttribute('aria-label'),
                  text: button.textContent.trim(),
                  svg: !!button.querySelector('svg'),
                  width: rect.width,
                  height: rect.height,
                };
              });
              assert.equal(control.name, '查看大图');
              assert.equal(control.text, '');
              assert.equal(control.svg, true);
              assert.ok(control.width >= 44 && control.height >= 44);
              report.entryControls ??= [];
              report.entryControls.push({
                theme,
                viewportWidth: width,
                ...control,
              });
              await viewerShot(page, config, report, `entry-${theme}-${width}`);
            }
          }
        }
        report.stage = 'ready-layouts';
        await openViewerDirect(page, config, viewerId(7));
        await waitViewerImage(page, viewerId(7), 'compressed');
        await verifyViewerLayouts(viewerContext, 'ready', representative);
        if (!representative) await verifyViewerShortViewport(viewerContext);
        await closeViewer(page);
        if (!representative) await verifyViewerVersions(viewerContext);
      }
      if (!representative) {
        await verifyViewerNavigation(viewerContext);
        report.stage = 'interactions';
        await verifyViewerInteractions(viewerContext);
        report.stage = 'recovery';
        await verifyViewerRecovery(viewerContext);
        report.stage = 'pending-navigation';
        await verifyViewerPendingNavigation(viewerContext);
        report.stage = 'decode-failures';
        await verifyViewerDecodeFailures(viewerContext);
        report.stage = 'deleted-source';
        await verifyViewerDeletedSource(viewerContext);
        report.stage = 'consumers';
        await verifyViewerConsumers(viewerContext);
        report.stage = 'long-name';
        await verifyViewerLongName(viewerContext);
      }
    }
    report.status = 'passed';
    report.stage = 'completed';
    context.report?.checks.push(...report.checks);
    context.report?.layouts.push(...report.layouts);
  } catch (error) {
    report.error = String(error.stack ?? error);
    // Capture the failing page before disposable records are removed. No
    // stability wait or focus change may alter the evidence of this failure.
    try {
      report.failurePage = await page.evaluate(() => {
        const bounds = (node) => {
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          };
        };
        const active = document.activeElement;
        const viewport = window.visualViewport;
        return {
          url: location.href,
          viewport: {
            innerWidth,
            innerHeight,
            devicePixelRatio,
            visualWidth: viewport?.width,
            visualHeight: viewport?.height,
            visualScale: viewport?.scale,
            meta: document.querySelector('meta[name="viewport"]')?.content,
          },
          document: bounds(document.documentElement),
          body: bounds(document.body),
          main: bounds(document.querySelector('main')),
          activeElement: active?.outerHTML.slice(0, 4000),
          activeInViewer: !!active?.closest('[data-testid="image-viewer"]'),
          activeInDetail: !!active?.closest('[data-testid="library-detail"]'),
          overlays: [
            ...document.querySelectorAll(
              '[data-slot="modal-backdrop"],[data-slot="modal-container"],[data-slot="modal-dialog"],[data-slot="alert-dialog-dialog"]',
            ),
          ].map((node) => ({
            slot: node.dataset.slot,
            entering: node.hasAttribute('data-entering'),
            exiting: node.hasAttribute('data-exiting'),
            bounds: bounds(node),
          })),
          focusSentinels: [
            ...document.querySelectorAll(
              '[data-focus-scope-start],[data-focus-scope-end]',
            ),
          ].map((node) => node.outerHTML),
          viewer: document
            .querySelector('[data-testid="image-viewer"]')
            ?.outerHTML.slice(0, 16000),
          detail: document
            .querySelector('[data-testid="library-detail"]')
            ?.outerHTML.slice(0, 16000),
          text: document.body.innerText.slice(0, 8000),
        };
      });
    } catch (diagnosticError) {
      report.failureDiagnosticError = String(diagnosticError);
    }
    try {
      const file = 'library-viewer-failure.png';
      await page.screenshot({ path: join(config.output, file) });
      report.screenshots.push(file);
    } catch (screenshotError) {
      report.failureScreenshotError = String(screenshotError);
    }
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
