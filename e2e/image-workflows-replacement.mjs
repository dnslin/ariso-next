import assert from 'node:assert/strict';
import { waitForImageWorkflow } from './image-workflows-fixture.mjs';
import { detailDialog, workflowButton } from './image-workflows-page.mjs';

const workspace = '[data-testid="detail-replacement"]';

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
  const before = await fixture.detail(imageId);
  const versions = {};
  for (const version of before.versions.filter((value) => value.saved)) {
    assert.ok(version.links);
    versions[version.kind] = {
      contentId: version.contentId,
      links: version.links,
      hash: (await fixture.bytes(version.links.url)).hash,
    };
  }
  await ui.more('替换图片');
  await page.waitForSelector(workspace);
  await page.waitForSelector(detailDialog, { state: 'hidden' });
  await page.setInputFiles('input[aria-label="选择替换图片文件"]', [
    fixture.paths.replacement,
  ]);
  await page.waitForFunction(() => {
    const image = document.querySelector('img[alt="待替换的新图片"]');
    return (
      image?.src.startsWith('blob:') && image.complete && image.naturalWidth > 0
    );
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="replacement-submit"]')?.disabled,
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-testid="detail-replacement"] input[type="checkbox"]',
        ).length,
    ),
    0,
    'The approved workpage has one confirmation action',
  );
  await ui.capture(
    'replacement-ready',
    workspace,
    '[data-testid="replacement-submit"]',
  );
  await page.focus('[data-testid="replacement-submit"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
    timeout: 120000,
  });
  const successText = await page.evaluate(
    () =>
      document.querySelector('[data-testid="detail-replacement"]').textContent,
  );
  assert.match(successText, /替换成功/);
  assert.doesNotMatch(
    successText,
    /正在准备候选/,
    'The completed replacement no longer displays the earlier acceptance progress message',
  );
  report.checks.push({
    scenario: 'replacement-success-has-no-stale-candidate-progress',
    terminal: true,
  });
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
    (version) => version.kind === 'compressed',
  );
  await page.waitForFunction(
    ({ path, width, height }) => {
      const image = document.querySelector(
        '[data-testid="detail-replacement"] [data-testid="detail-preview"]',
      );
      return (
        image?.getAttribute('src') === path &&
        image.complete &&
        image.naturalWidth === width &&
        image.naturalHeight === height
      );
    },
    {
      path: currentPreview.previewPath,
      width: currentPreview.width,
      height: currentPreview.height,
    },
  );
  assert.notEqual(
    currentPreview.previewPath,
    before.versions.find((version) => version.kind === 'compressed')
      .previewPath,
    'The owner preview requests the newly published content rather than reusing the old decoded image',
  );
  report.checks.push({
    scenario: 'replacement-current-preview-displays-new-content',
    contentId: currentPreview.contentId,
  });
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
    assert.notEqual(
      (await fixture.bytes(version.links.url)).hash,
      previous.hash,
      `${kind} actually serves new bytes`,
    );
  }
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
    report.checks.push({
      scenario: 'replacement-updates-stable-size-url',
      preset,
      ...actual,
    });
  }
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
    workspace,
    null,
    [1440, 390],
    ['light'],
  );
  await page.click(`${workspace} [data-testid="detail-return"]`);
  await page.waitForSelector(workspace, { state: 'hidden' });
  await page.waitForFunction(
    () =>
      !!document.activeElement?.closest('[data-testid="detail-more-entry"]'),
  );

  // A real incomplete multipart creates the actual receiving task. Holding the
  // last bytes makes returning before completion deterministic without DB seeds.
  const reception = await fixture.holdReplacement(imageId, fixture.paths.held);
  await ui.more('替换图片');
  await page.waitForSelector(`${workspace}[data-job-status="running"]`);
  await page.waitForSelector('loc=role:heading[name="正在替换图片"]');
  const selectedBefore = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-image-id] input[type="checkbox"]:checked',
      ),
    ]
      .map((node) => node.closest('[data-image-id]').dataset.imageId)
      .sort(),
  );
  await page.click(`${workspace} [data-testid="detail-return"]`);
  await page.waitForSelector(workspace, { state: 'hidden' });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="detail-body"]')
      ?.textContent.includes('替换图片：执行中 · 接收新文件'),
  );
  const active = await fixture.detail(imageId);
  assert.equal(active.activeJob?.kind, 'replace');
  assert.equal(active.activeJob?.step, 'receiving');
  assert.equal(
    active.processingJob?.id,
    after.processingJob?.id,
    'The replacement does not masquerade as a reprocess',
  );
  await page.click(workflowButton('关闭图片详情'));
  await page.waitForSelector(detailDialog, { state: 'hidden' });
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-image-id="${id}"]`)
        ?.textContent.includes('替换图片：执行中 · 接收新文件'),
    imageId,
  );
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
  reception.release();
  const accepted = await reception.promise;
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
  await ui.openDetail(terminal);
  await page.waitForFunction(
    (expected) => {
      const image = [
        ...document.querySelectorAll('[data-testid="detail-preview"]'),
      ].find(
        (node) => node.getClientRects().length && !node.closest('[inert]'),
      );
      return (
        image &&
        image.complete &&
        image.naturalWidth > 0 &&
        image.naturalWidth === expected
      );
    },
    terminal.versions.find((version) => version.kind === 'compressed').width,
  );
  await page.click(workflowButton('关闭图片详情'));
  await page.waitForSelector(detailDialog, { state: 'hidden' });
  report.checks.push({
    scenario: 'return-transfers-real-replacement-to-shared-status',
    jobId: accepted.jobId,
    activeKind: active.activeJob.kind,
    terminalThumbnailContentId: thumbnail.contentId,
    ownerSelectionPreserved: true,
    timing:
      'The test pauses a real multipart body before completion, then releases its bytes. It does not fabricate a media job or success response.',
  });
}
