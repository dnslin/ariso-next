import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { waitForImageWorkflow } from './image-workflows-fixture.mjs';
import { detailDialog, workflowButton } from './image-workflows-page.mjs';
import {
  observeReplacement,
  chooseDetailReplacement,
  readSelectedDetailPreview,
  ensureWorkflowOwnerVisible,
  recordCappedReplacementReception,
} from './image-replacement-helpers.mjs';

const fileInput = '[data-testid="replacement-file-input"]';
const status = '[data-testid="detail-replacement-status"]';

export async function verifyImageWorkflowReplacement({
  task,
  page,
  report,
  fixture,
  ui,
  sizes,
  visitor,
}) {
  const imageId = fixture.privateImage.id;
  report.stage = 'replacement-owner-visible-before-actions';
  await ensureWorkflowOwnerVisible(page, report, 'after-share-visitor-return');
  const before = await fixture.detail(imageId);
  report.stage = 'replacement-read-current-preview';
  const selected = await page.evaluate(readSelectedDetailPreview);
  const selectedRole = {
    原图: 'original',
    压缩图: 'compressed',
    缩略图: 'thumbnail',
    水印图: 'watermark',
  }[selected.label];
  assert.ok(
    selectedRole,
    `The actual selected tab has a known version label: ${JSON.stringify(selected)}`,
  );
  assert.equal(selected.selectedCount, 1);
  assert.equal(selected.panelVisible, true);
  assert.equal(selected.imageCount, 1);
  assert.equal(
    selected.role,
    selectedRole,
    'The selected tab and visible preview source agree before replacing',
  );
  const previousPreview = before.versions.find(
    (version) => version.kind === selectedRole,
  );
  assert.equal(selected.path, previousPreview.previewPath);
  assert.equal(selected.contentId, previousPreview.contentId);
  report.replacementSelectedPreview = selected;
  const observation = await observeReplacement(page);
  try {
    const versions = {};
    for (const version of before.versions.filter((value) => value.saved)) {
      assert.ok(version.links);
      versions[version.kind] = {
        contentId: version.contentId,
        links: version.links,
        hash: (await fixture.bytes(version.links.url)).hash,
      };
    }
    const beforeCancel = await fixture.json(`/api/images/${imageId}/replace`);
    report.stage = 'replacement-cancel-native-chooser';
    await chooseDetailReplacement(page, [], report);
    await page.waitForSelector(fileInput, { state: 'attached' });
    await page.waitForSelector(detailDialog);
    assert.equal((await observation.read()).chooserClicks, 1);
    assert.deepEqual((await observation.read()).requests, []);
    assert.deepEqual(
      await fixture.json(`/api/images/${imageId}/replace`),
      beforeCancel,
      'Cancelling native file selection neither sends a replacement nor creates a task',
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('detailView'),
      null,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-testid="detail-replacement"], [data-testid="replacement-submit"], img[alt="待替换的新图片"]',
          ).length,
      ),
      0,
      'The existing detail never opens a comparison or confirmation workpage',
    );
    report.checks.push({ scenario: 'replacement-cancel-sends-no-request' });

    const invalid = join(fixture.directory, 'invalid-replacement.png');
    await writeFile(invalid, 'This is not an image.');
    report.stage = 'replacement-invalid-file-auto-submit';
    await chooseDetailReplacement(page, [invalid], report);
    await page.waitForFunction(
      () => window.__imageWorkflowReplacement.requests[0]?.status === 422,
    );
    await page.waitForSelector(`${status}[data-state="failed"]`);
    const rejected = (await observation.read()).requests[0];
    const rejection = JSON.parse(rejected.body);
    const failed = await fixture.json(`/api/images/${imageId}/replace`);
    const failureText = await page.evaluate(
      () =>
        document.querySelector('[data-testid="detail-replacement-status"]')
          .textContent,
    );
    assert.equal(
      await page.evaluate(() => {
        const feedback = document.querySelector(
          '[data-testid="detail-replacement-status"]',
        );
        return (
          feedback.getAttribute('role') === 'alert' ||
          !!feedback.querySelector('[role="alert"]')
        );
      }),
      true,
    );
    assert.ok(
      failureText.includes(rejection.message) ||
        failureText.includes(failed.job.error),
      'The original detail keeps the actual HTTP or processing failure visible',
    );
    const unchanged = await fixture.detail(imageId);
    for (const field of [
      'id',
      'originalName',
      'width',
      'height',
      'byteSize',
      'versions',
    ])
      assert.deepEqual(
        unchanged[field],
        before[field],
        `Rejected input preserves ${field}`,
      );
    for (const previous of Object.values(versions))
      assert.equal(
        (await fixture.bytes(previous.links.url)).hash,
        previous.hash,
      );
    await ui.capture(
      'replacement-error',
      detailDialog,
      'button[aria-label="关闭图片详情"]',
    );
    assert.equal(
      (await observation.read()).requests.length,
      1,
      'A rejected file is not automatically retried',
    );
    report.checks.push({
      scenario: 'replacement-real-error-keeps-old-content',
      status: rejected.status,
    });

    report.stage = 'replacement-valid-file-auto-submit';
    await chooseDetailReplacement(page, [fixture.paths.replacement], report);
    await page.waitForSelector(`${status}[data-state="succeeded"]`, {
      timeout: 120000,
    });
    assert.equal(
      (await observation.read()).requests.length,
      2,
      'Selecting a valid replacement sends exactly one new POST without confirmation',
    );
    const successText = await page.evaluate(
      () =>
        document.querySelector('[data-testid="detail-replacement-status"]')
          .textContent,
    );
    assert.match(successText, /图片已替换|替换成功/);
    assert.doesNotMatch(
      successText,
      /正在准备候选/,
      'The completed replacement no longer displays the earlier acceptance progress message',
    );
    report.checks.push({
      scenario: 'replacement-success-has-no-stale-candidate-progress',
      terminal: true,
    });
    report.stage = 'replacement-wait-real-publication';
    const published = await waitForImageWorkflow(
      () => fixture.json(`/api/images/${imageId}/replace`),
      (state) => {
        assert.ok(
          !['failed', 'cancelled'].includes(state.job?.status),
          JSON.stringify(state),
        );
        return state.job?.status === 'succeeded';
      },
      'The real UI replacement publishes all prepared versions',
    );
    const after = await fixture.detail(imageId);
    const currentPreview = after.versions.find(
      (version) => version.kind === selectedRole,
    );
    report.stage = `replacement-current-preview-${selectedRole}-decode`;
    const decoded = await waitForImageWorkflow(
      () => page.evaluate(readSelectedDetailPreview),
      (state) =>
        state.selectedCount === 1 &&
        state.label === selected.label &&
        state.panelVisible &&
        state.imageCount === 1 &&
        state.role === selectedRole &&
        state.path === currentPreview.previewPath &&
        state.contentId === currentPreview.contentId &&
        state.complete &&
        state.width === currentPreview.width &&
        state.height === currentPreview.height &&
        state.width > 0 &&
        state.height > 0,
      'The same selected version decodes the newly published content at its actual dimensions',
    );
    assert.equal(
      decoded.label,
      selected.label,
      'Replacement does not switch the active preview tab',
    );
    assert.equal(decoded.role, selectedRole);
    assert.notEqual(currentPreview.contentId, previousPreview.contentId);
    assert.notEqual(
      currentPreview.previewPath,
      previousPreview.previewPath,
      'The owner preview requests the newly published content rather than reusing the old decoded image',
    );
    report.checks.push({
      scenario: 'replacement-current-preview-displays-new-content',
      contentId: currentPreview.contentId,
      selectedRole,
      label: decoded.label,
      decodedDimensions: [decoded.width, decoded.height],
    });
    report.stage = 'replacement-verify-stable-identity-and-links';
    for (const field of [
      'id',
      'displayName',
      'visibility',
      'createdAt',
      'albums',
      'tags',
    ])
      assert.deepEqual(
        after[field],
        before[field],
        `Replacement preserves ${field}`,
      );
    assert.equal(after.originalName, 'replacement.png');
    assert.deepEqual([after.width, after.height], [1600, 1000]);
    assert.deepEqual(after.defaultLink.links, before.defaultLink.links);
    const publishedVersions = {};
    for (const [kind, previous] of Object.entries(versions)) {
      const version = after.versions.find((value) => value.kind === kind);
      assert.equal(version.saved, true);
      assert.deepEqual(
        version.links,
        previous.links,
        `${kind} stable external links`,
      );
      assert.notEqual(
        version.contentId,
        previous.contentId,
        `${kind} publishes new content identity`,
      );
      const hash = (await fixture.bytes(version.links.url)).hash;
      assert.notEqual(hash, previous.hash, `${kind} actually serves new bytes`);
      publishedVersions[kind] = { links: version.links, hash };
    }
    const publishedSizes = {};
    report.stage = 'replacement-verify-stable-size-content';
    for (const [preset, previous] of Object.entries(sizes)) {
      const current = await fixture.json(
        `/api/images/${imageId}/sizes?version=compressed&preset=${preset}`,
      );
      assert.equal(current.status, 'ready');
      assert.deepEqual(
        current.links,
        previous.links,
        `${preset} published URLs remain stable`,
      );
      const actual = await fixture.dimensions(
        current.links.url,
        `private-${preset}-replaced`,
      );
      assert.notEqual(
        actual.hash,
        previous.hash,
        `${preset} actually serves the replacement`,
      );
      assert.equal(
        Math.max(actual.width, actual.height),
        Math.min({ small: 640, medium: 1280, large: 1920 }[preset], 1600),
      );
      assert.equal(actual.width / actual.height, 1600 / 1000);
      publishedSizes[preset] = { links: current.links, hash: actual.hash };
      report.checks.push({
        scenario: 'replacement-updates-stable-size-url',
        preset,
        ...actual,
      });
    }
    report.stage = 'replacement-verify-share-revocation';
    assert.equal(
      (await fixture.json(`/api/images/${imageId}/share`)).share.state,
      'revoked',
    );
    await visitor.anonymous.reload();
    await visitor.anonymous.waitForSelector(
      'loc=role:heading[name="分享已失效"]',
    );
    assert.equal(
      (await visitor.anonymous.fetch(`/s/image/${visitor.share.token}/media`))
        .status,
      410,
    );
    assert.equal(
      (await visitor.anonymous.fetch(`/i/${imageId}?type=compressed`)).status,
      401,
    );
    await task.cdp('Target.activateTarget', { targetId: page.targetId });
    await ensureWorkflowOwnerVisible(
      page,
      report,
      'after-revoked-visitor-return',
    );
    report.checks.push({
      scenario: 'replacement-preserves-identity-and-revokes-share',
      imageId,
      jobId: published.job.id,
      preservedRelations: { albums: after.albums, tags: after.tags },
      stableVersions: Object.keys(versions),
      invalidatedShareStatus: 410,
    });
    await ui.capture(
      'replacement-success',
      detailDialog,
      'button[aria-label="关闭图片详情"]',
      [1440, 390],
      ['light'],
    );

    // Slow only this target's native upload. The selected File and its one XHR
    // remain the product operation; Node is used only to read server state.
    const uploadIndex = (await observation.read()).requests.length;
    assert.equal(uploadIndex, 2);
    let active;
    let receivingJobId = null;
    await ensureWorkflowOwnerVisible(
      page,
      report,
      'before-native-replacement-reception',
    );
    await page.cdp('Network.enable');
    try {
      report.stage = 'replacement-native-reception-start';
      await page.cdp('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: 128,
      });
      const selectedBefore = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-image-id] input[type="checkbox"]:checked',
          ),
        ]
          .map((node) => node.closest('[data-image-id]').dataset.imageId)
          .sort(),
      );
      await chooseDetailReplacement(page, [fixture.paths.held], report);
      await page.waitForSelector(`${status}[data-state="uploading"]`);
      const receiving = await waitForImageWorkflow(
        () => fixture.json(`/api/images/${imageId}/replace`),
        (state) =>
          state.job?.id !== published.job.id &&
          state.job?.status === 'running' &&
          state.job.step === 'receiving',
        'The file chosen in details reaches the real receiving boundary before its browser XHR ends',
      );
      receivingJobId = receiving.job.id;
      const pending = (await observation.read()).requests[uploadIndex];
      assert.equal(pending.filename, 'held.png');
      assert.equal(pending.ended, false);
      assert.equal(pending.aborted, false);
      assert.equal(pending.status, null);
      active = await fixture.detail(imageId);
      assert.equal(active.activeJob?.kind, 'replace');
      assert.equal(active.activeJob?.step, 'receiving');
      assert.equal(active.activeJob.id, receiving.job.id);
      for (const [kind, previous] of Object.entries(publishedVersions))
        assert.equal(
          (await fixture.bytes(previous.links.url)).hash,
          previous.hash,
          `${kind} remains published while the next file is receiving`,
        );
      for (const [preset, previous] of Object.entries(publishedSizes))
        assert.equal(
          (await fixture.bytes(previous.links.url)).hash,
          previous.hash,
          `${preset} keeps its published bytes while the next file is receiving`,
        );
      for (const field of ['originalName', 'width', 'height', 'byteSize'])
        assert.deepEqual(
          active[field],
          after[field],
          `${field} changes only at publication`,
        );
      assert.equal(
        active.processingJob?.id,
        after.processingJob?.id,
        'The replacement does not masquerade as a reprocess',
      );
      await recordCappedReplacementReception(
        page,
        fixture,
        imageId,
        uploadIndex,
        receivingJobId,
        'before-receiving-capture',
        report,
      );
      await ui.capture(
        'replacement-receiving',
        detailDialog,
        'button[aria-label="关闭图片详情"]',
        [1440, 390],
        ['light'],
      );
      await recordCappedReplacementReception(
        page,
        fixture,
        imageId,
        uploadIndex,
        receivingJobId,
        'after-receiving-capture',
        report,
      );
      report.stage = 'replacement-native-reception-close-details';
      await recordCappedReplacementReception(
        page,
        fixture,
        imageId,
        uploadIndex,
        receivingJobId,
        'before-detail-close',
        report,
      );
      await page.click(workflowButton('关闭图片详情'));
      await page.waitForSelector(detailDialog, { state: 'hidden' });
      const closed = await observation.read();
      assert.equal(closed.requests.length, uploadIndex + 1);
      assert.equal(closed.requests[uploadIndex].ended, false);
      assert.equal(closed.requests[uploadIndex].aborted, false);
      assert.equal(closed.requests[uploadIndex].status, null);
      await recordCappedReplacementReception(
        page,
        fixture,
        imageId,
        uploadIndex,
        receivingJobId,
        'after-detail-close',
        report,
      );
      report.stage = 'replacement-native-reception-card-receiving';
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`[data-image-id="${id}"]`)
            ?.textContent.includes('替换图片：执行中 · 接收新文件'),
        imageId,
      );
      report.stage = 'replacement-native-reception-focus-return';
      await page.waitForFunction(
        (name) =>
          document.activeElement?.getAttribute('aria-label') ===
          `查看图片：${name}`,
        after.displayName,
      );
      const selectedAfter = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-image-id] input[type="checkbox"]:checked',
          ),
        ]
          .map((node) => node.closest('[data-image-id]').dataset.imageId)
          .sort(),
      );
      assert.deepEqual(
        selectedAfter,
        selectedBefore,
        'Returning keeps the owner selection',
      );
      await ui.capture(
        'replacement-return-active',
        '[data-testid="library-gallery"]',
        null,
        [1440, 390],
        ['light'],
      );
      await recordCappedReplacementReception(
        page,
        fixture,
        imageId,
        uploadIndex,
        receivingJobId,
        'after-active-card-capture',
        report,
      );
      report.checks.push({
        scenario: 'native-replacement-continues-after-detail-close',
        imageId,
        jobId: receiving.job.id,
        filename: pending.filename,
        uploadRequestIndex: uploadIndex,
        pendingBeforeClose: true,
        pendingAfterClose: true,
        aborted: false,
        ownerSelectionPreserved: true,
      });
    } catch (error) {
      await recordCappedReplacementReception(
        page,
        fixture,
        imageId,
        uploadIndex,
        receivingJobId,
        `failed-${report.stage}-before-network-restore`,
        report,
      );
      throw error;
    } finally {
      // The isolated runner never installs another network profile. Disable only
      // the upload cap introduced above; preserve real connectivity and latency.
      await page.cdp('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
    report.stage = 'replacement-native-xhr-acceptance-after-close';
    await page.waitForFunction(
      (index) =>
        window.__imageWorkflowReplacement.requests[index]?.ended === true,
      uploadIndex,
      { timeout: 120000 },
    );
    const completedRequests = (await observation.read()).requests;
    assert.equal(
      completedRequests.length,
      uploadIndex + 1,
      'Closing details never resends the selected File',
    );
    const completedRequest = completedRequests[uploadIndex];
    assert.equal(completedRequest.aborted, false);
    assert.equal(completedRequest.status, 202);
    const accepted = JSON.parse(completedRequest.body);
    assert.equal(accepted.imageId, imageId);
    assert.equal(
      accepted.jobId,
      active.activeJob.id,
      'The one browser XHR receipt belongs to the task observed while receiving',
    );
    report.stage = 'replacement-native-job-completion-after-close';
    await waitForImageWorkflow(
      () => fixture.json(`/api/images/${imageId}/replace`),
      (state) => {
        assert.ok(
          !['failed', 'cancelled'].includes(state.job?.status),
          JSON.stringify(state),
        );
        return (
          state.job?.id === accepted.jobId && state.job.status === 'succeeded'
        );
      },
      'The returned task completes through the real queue',
    );
    const terminal = await fixture.detail(imageId);
    const thumbnail = terminal.versions.find(
      (version) => version.kind === 'thumbnail',
    );
    await page.waitForFunction(
      ({ id, contentId }) => {
        const card = document.querySelector(`[data-image-id="${id}"]`);
        return (
          card &&
          !card.textContent.includes('替换图片：') &&
          [...card.querySelectorAll('img')].some(
            (image) =>
              new URL(
                image.currentSrc || image.src,
                location.href,
              ).searchParams.get('v') === contentId &&
              image.complete &&
              image.naturalWidth > 0,
          )
        );
      },
      { id: imageId, contentId: thumbnail.contentId },
      { timeout: 120000 },
    );
    report.stage = 'replacement-reopen-completed-detail-preview';
    await ui.openDetail(terminal);
    await waitForImageWorkflow(
      () => page.evaluate(readSelectedDetailPreview),
      (state) => {
        const version = terminal.versions.find(
          (version) => version.kind === state.role,
        );
        return (
          state.selectedCount === 1 &&
          state.panelVisible &&
          state.imageCount === 1 &&
          !!version &&
          state.path === version.previewPath &&
          state.contentId === version.contentId &&
          state.complete &&
          state.width === version.width &&
          state.height === version.height &&
          state.width > 0 &&
          state.height > 0
        );
      },
      'The reopened active panel decodes its actual published version',
    );
    await page.click(workflowButton('关闭图片详情'));
    await page.waitForSelector(detailDialog, { state: 'hidden' });
    report.checks.push({
      scenario: 'return-transfers-real-replacement-to-shared-status',
      jobId: accepted.jobId,
      activeKind: active.activeJob.kind,
      terminalThumbnailContentId: thumbnail.contentId,
      ownerSelectionPreserved: true,
      oldBytesPreservedDuringReception: true,
      timing:
        'The real detail chooser sends one native browser XHR under a temporary CDP upload cap. The same XHR remains pending and unaborted when details close, receives exactly one 202 after normal speed is restored, and its original server job completes. No Node POST substitutes for this UI handover.',
    });
  } finally {
    await observation.dispose();
  }
}
