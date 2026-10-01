import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// These records belong to verify-browser's disposable DATA_DIR, never a preview account.
export async function verifyLibraryDetail171({ page, config, sql, report }) {
  const image = 'library-007';
  const endpoint = `/api/images/${image}`;
  const before = JSON.parse((await page.fetch(endpoint)).body);
  const objects = await sql(
    `SELECT id,key,status FROM media_objects WHERE image_id='${image}' ORDER BY id`,
  );
  const patch = (path, body) =>
    page.fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const modified = await patch(endpoint, {
    displayName: '  已修改的显示名称 🌅  ',
    visibility: 'private',
  });
  assert.equal(modified.status, 200);
  const after = JSON.parse(modified.body);
  assert.equal(after.displayName, '已修改的显示名称 🌅');
  assert.equal(after.visibility, 'private');
  assert.equal(after.originalName, before.originalName);
  assert.equal(after.id, before.id);
  assert.deepEqual(
    await sql(
      `SELECT id,key,status FROM media_objects WHERE image_id='${image}' ORDER BY id`,
    ),
    objects,
  );
  assert.equal((await patch(endpoint, {})).status, 400);
  assert.equal(
    (await patch(endpoint, { displayName: '错误\n名称' })).status,
    400,
  );
  assert.equal(
    JSON.parse((await page.fetch(endpoint)).body).displayName,
    after.displayName,
  );
  assert.equal(
    (
      await patch(endpoint, {
        displayName: before.displayName,
        visibility: before.visibility,
      })
    ).status,
    200,
  );
  report.checks.push(
    'Real owner-cookie PATCH trims Unicode displayName and changes visibility without rewriting originalName, ID, object Key or stored state; empty/control-character edits reject without changing data. Edit UI remains design-blocked.',
  );

  const now = Date.now();
  await sql(
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ('detail-171-album','详情关系验证','',${now},${now})`,
  );
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ('detail-171-tag','详情关系验证','详情关系验证',${now},${now})`,
  );
  const relationships = await patch(`${endpoint}/collections`, {
    albumIds: ['detail-171-album'],
    tagIds: ['detail-171-tag'],
  });
  assert.equal(relationships.status, 200);
  assert.deepEqual(JSON.parse(relationships.body).albums, [
    { id: 'detail-171-album', name: '详情关系验证' },
  ]);
  assert.deepEqual(JSON.parse(relationships.body).tags, [
    { id: 'detail-171-tag', displayName: '详情关系验证' },
  ]);
  const joined = await sql(
    `SELECT joined_at FROM album_images WHERE image_id='${image}' AND album_id='detail-171-album'`,
  );
  assert.equal(
    (await patch(`${endpoint}/collections`, { tagIds: [] })).status,
    200,
  );
  assert.deepEqual(
    await sql(
      `SELECT joined_at FROM album_images WHERE image_id='${image}' AND album_id='detail-171-album'`,
    ),
    joined,
  );
  assert.equal(
    (
      await patch(`${endpoint}/collections`, {
        albumIds: before.albums.map((album) => album.id),
        tagIds: before.tags.map((tag) => tag.id),
      })
    ).status,
    200,
  );
  await sql("DELETE FROM albums WHERE id='detail-171-album'");
  await sql("DELETE FROM tags WHERE id='detail-171-tag'");
  report.checks.push(
    'Single-image final-set relations use real collection provider transactions; omitted album selection retains its join timestamp while an empty tag set clears tags.',
  );

  const unread = await page.fetch(`${endpoint}/metadata`);
  assert.equal(unread.status, 200);
  assert.equal(JSON.parse(unread.body), null);
  const read = await page.fetch(`${endpoint}/metadata/read`, {
    method: 'POST',
  });
  assert.equal(read.status, 202);
  await page.waitForFunction(
    async (path) => {
      const response = await fetch(path);
      if (!response.ok)
        throw new Error(`Metadata verification HTTP ${response.status}`);
      const value = await response.json();
      return value?.status === 'succeeded' || value?.status === 'failed';
    },
    `${endpoint}/metadata`,
    { timeout: 30000 },
  );
  const metadata = JSON.parse((await page.fetch(`${endpoint}/metadata`)).body);
  assert.equal(metadata.status, 'succeeded');
  assert.equal(metadata.historical, false);
  assert.ok(metadata.data && Object.keys(metadata.data).length > 0);
  assert.ok(metadata.readAt);
  assert.equal(
    JSON.parse((await page.fetch(endpoint)).body).processingStatus,
    before.processingStatus,
  );
  report.checks.push(
    'Metadata GET distinguishes unread null; existing POST queues real ExifTool read, returns complete grouped JSON and timestamps, and leaves process state unchanged. Tree/search UI remains design-blocked.',
  );

  await page.goto(`${config.origin}/library?image=${image}`);
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="压缩图"]');
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  assert.equal(
    new URL(await page.url()).searchParams.get('detailView'),
    'versions',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid^="version-info-"]').length,
    ),
    4,
  );
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="detail-versions"]')
        .textContent.includes('当前预览压缩图'),
    ),
  );
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(
      (value) => document.documentElement.classList.contains(value),
      theme,
    );
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: width >= 1200 ? 1080 : 844,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await page.waitForFunction((value) => innerWidth === value, width);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        targets: [
          ...document.querySelectorAll(
            '[data-testid="detail-versions"] button,.shell-footer button',
          ),
        ]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({
            name: node.textContent,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
      }));
      assert.equal(layout.overflow, false);
      for (const target of layout.targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `Version action target ${target.name}`,
        );
      await page.screenshot({
        path: join(config.output, `detail-171-versions-${theme}-${width}.png`),
      });
    }
  }
  await page.focus('loc=role:button[name="返回详情"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="detail-preview"]')]
        .find((node) => node.getClientRects().length)
        ?.getAttribute('src')
        .includes('type=compressed'),
    ),
  );
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  await page.click('loc=role:button[name="← 返回图库"]');
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  report.checks.push(
    'Version workspace uses one owner shell, shows four actual states across five widths/light-dark, preserves the explicit compressed preview on keyboard return, and closes subview directly to the source list.',
  );
  await verifyReprocess({ page, config, sql, report, image });
  await verifyDetail171Consumers({ page, config, sql, report });
}

async function verifyReprocess({ page, config, sql, report, image }) {
  const endpoint = `/api/images/${image}`;
  const workspace = '[data-testid="detail-reprocess"]';
  const button = (name) => `loc=role:button[name="${name}"]`;
  const direct = async (id = image, view = 'reprocess') => {
    await page.goto(
      `${config.origin}/library?image=${id}${view ? `&detailView=${view}` : ''}`,
    );
    await page.waitForSelector(
      view ? workspace : '[data-testid="detail-body"]',
    );
  };
  const layout = async (state, widths = [390, 1440]) => {
    for (const theme of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await page.waitForFunction(
        (theme) => document.documentElement.classList.contains(theme),
        theme,
      );
      for (const width of widths) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: width >= 1200 ? 1080 : 844,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await page.waitForFunction((width) => innerWidth === width, width);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const measured = await page.evaluate(() => ({
          width: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          state: document.querySelector('[data-testid="detail-reprocess"]')
            .dataset.jobStatus,
          targets: [
            ...document.querySelectorAll(
              '[data-testid="detail-reprocess"] button,[data-testid^="reprocess-scope-"],.shell-footer button',
            ),
          ]
            .filter((node) => node.getClientRects().length)
            .map((node) => ({
              name: node.textContent.trim(),
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
            })),
        }));
        assert.equal(measured.overflow, false, `${state}/${theme}/${width}`);
        for (const target of measured.targets)
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${state}: ${target.name} has a 44px target`,
          );
        await page.screenshot({
          path: join(
            config.output,
            `detail-171-${state}-${theme}-${width}.png`,
          ),
        });
        report.layouts.push({
          state: `detail-171-${state}`,
          theme,
          ...measured,
        });
      }
    }
  };
  const versions = () =>
    sql(
      `SELECT kind,object_id FROM media_versions WHERE image_id='${image}' ORDER BY kind`,
    );
  const [settings] = await sql(
    'SELECT compression_enabled,watermark_mode,watermark_text,watermark_font FROM media_settings WHERE id=1',
  );
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const [active] = await sql("SELECT * FROM media_jobs WHERE id='active-job'");
  const [activeImage] = await sql(
    "SELECT processing_status FROM media_images WHERE id='library-002'",
  );
  const [candidateStorage] = await sql(
    "SELECT s.id,s.local_path FROM media_images i JOIN storage_configs s ON s.id=i.storage_id WHERE i.id='library-002'",
  );
  const candidateId = 'detail-171-render-candidate';
  const candidateKey = `library-fixtures/${candidateId}.png`;
  const candidatePath = join(
    config.dataDirectory,
    'storage',
    candidateStorage.local_path,
    'ariso',
    candidateStorage.id,
    candidateKey,
  );
  try {
    await sql(
      "UPDATE media_settings SET compression_enabled=1,watermark_mode='text',watermark_text='Ariso',watermark_font='latin' WHERE id=1",
    );
    await direct();
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.testid),
      'detail-workspace-title',
    );
    await layout('reprocess-selection', [360, 390, 430, 768, 1440]);
    for (const [scope, label] of [
      ['compressed', '仅压缩图'],
      ['watermark', '仅水印图'],
      ['thumbnail', '仅缩略图'],
    ]) {
      await page.focus(`[data-testid="reprocess-scope-${scope}"] input`);
      await page.keyboard.press('Space');
      await page.waitForFunction(
        (label) =>
          document
            .querySelector('[data-testid="detail-reprocess"]')
            .textContent.includes(`本次范围：${label}`),
        label,
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.testid),
        'detail-workspace-title',
      );
      if (scope === 'thumbnail') await layout('reprocess-confirm-thumbnail');
      if (scope === 'thumbnail') {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width: 390,
          height: 400,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await page.waitForFunction(() => innerHeight === 400);
        await page.evaluate(() => {
          const main = document.querySelector('main');
          main.scrollTop = main.scrollHeight;
        });
        assert.ok(
          await page.evaluate(() => {
            const submit = document
              .querySelector('[data-testid="reprocess-submit"]')
              .getBoundingClientRect();
            return submit.top >= 0 && submit.bottom <= innerHeight;
          }),
          'Short viewport keeps the fixed confirmation action reachable',
        );
        await page.screenshot({
          path: join(config.output, 'detail-171-reprocess-short-dark-390.png'),
        });
      }
      await page.click(button('重新选择'));
      await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    }
    // Every successful response below is from the real worker and actual tools.
    const saved = await versions();
    await sql(
      `UPDATE media_images SET processing_status='failed' WHERE id='${image}'`,
    );
    // Open the real failed filter through a selected source card. The starting
    // failure is controlled; the following retry and its completion are real.
    await page.goto(`${config.origin}/library?status=failed`);
    await page.waitForSelector(`[data-image-id="${image}"]`);
    await page.hover(button('查看图片：中文下载样本.png'));
    await page.click(
      'label:has(input[aria-label="选择图片：中文下载样本.png"])',
    );
    await page.waitForSelector('[data-testid="library-selection"]');
    await page.click(button('查看图片：中文下载样本.png'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('重新处理'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    // Navigation starts a new page runtime; observe the actual request again.
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171Posts = [];
      window.__detail171Statuses = [];
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${image}/reprocess`)
          window.__detail171Posts.push(args[1]?.body);
        if (path === '/api/images/status')
          window.__detail171Statuses.push(JSON.parse(args[1].body).ids);
        return original(...args);
      };
    }, image);
    await page.click('[data-testid="reprocess-submit"]');
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
      timeout: 30000,
    });
    const completed = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(completed.processingJob.status, 'succeeded');
    assert.equal(completed.processingJob.scope, 'all');
    assert.deepEqual(completed.processingJob.expectedVersions, [
      'compressed',
      'thumbnail',
      'watermark',
    ]);
    const replaced = await versions();
    assert.equal(
      replaced.find((value) => value.kind === 'original').object_id,
      saved.find((value) => value.kind === 'original').object_id,
    );
    for (const kind of ['compressed', 'thumbnail', 'watermark'])
      assert.notEqual(
        replaced.find((value) => value.kind === kind).object_id,
        saved.find((value) => value.kind === kind)?.object_id,
      );
    assert.equal(await page.evaluate(() => window.__detail171Posts.length), 1);
    const polls = await page.evaluate(() => window.__detail171Statuses);
    for (const ids of polls) assert.ok(ids.length <= 80);
    // Two polling periods prove a terminal task stops requesting current-ID status.
    const currentPolls = polls.filter(
      (ids) => ids.length === 1 && ids[0] === image,
    ).length;
    await page.waitForTimeout(4200);
    assert.equal(
      await page.evaluate(
        (image) =>
          window.__detail171Statuses.filter(
            (ids) => ids.length === 1 && ids[0] === image,
          ).length,
        image,
      ),
      currentPolls,
    );
    await layout('reprocess-success');
    // Reopen the action on the same mounted image after its confirmed success.
    await page.click(button('查看图片详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('重新处理'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    await page.click('[data-testid="reprocess-submit"]');
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
      timeout: 30000,
    });
    const repeated = JSON.parse((await page.fetch(endpoint)).body);
    assert.notEqual(repeated.processingJob.id, completed.processingJob.id);
    assert.equal(repeated.processingJob.scope, 'thumbnail');
    const repeatedVersions = await versions();
    for (const kind of ['original', 'compressed', 'watermark'])
      assert.equal(
        repeatedVersions.find((value) => value.kind === kind).object_id,
        replaced.find((value) => value.kind === kind).object_id,
      );
    assert.notEqual(
      repeatedVersions.find((value) => value.kind === 'thumbnail').object_id,
      replaced.find((value) => value.kind === 'thumbnail').object_id,
    );
    assert.equal(await page.evaluate(() => window.__detail171Posts.length), 2);
    report.checks.push(
      'Confirmed successful receipt resets when reopening the version-page reprocess action on the same image; a second real thumbnail-only job completes without closing/reloading and preserves all unselected versions.',
    );
    await page.evaluate(() => {
      window.fetch = window.__detail171Fetch;
    });
    await page.click(button('返回图库'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('status'),
      'failed',
    );
    await page.waitForSelector('[data-testid="library-selection"]', {
      state: 'hidden',
    });
    await page.waitForSelector('button[data-refresh-available="true"]');
    await page.click(button('刷新图库'));
    await page.waitForFunction(
      (image) => !document.querySelector(`[data-image-id="${image}"]`),
      image,
    );
    report.checks.push(
      'Real all-scope retry from a selected failed-filter card runs ImageMagick, creates compressed/thumbnail/text-watermark versions and succeeds in UI; original stays fixed, derived object IDs change, submission occurs once, status batches remain ≤80 and current-ID polling stops. Completion marks list refresh available, reconciliation removes the no-longer-failed selection, and manual refresh excludes the image from the real failed query.',
    );

    // Lose a real accepted POST response; never replace it with fabricated API data.
    await direct();
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    const [priorCount] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    const beforeSingle = await versions();
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171LostPosts = 0;
      window.__detail171LostReceipt = null;
      window.__detail171LostRelease = undefined;
      window.__detail171LostHoldUsed = false;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const response = await original(...args);
        if (path === `/api/images/${image}/reprocess`) {
          window.__detail171LostPosts++;
          window.__detail171LostReceipt = await response.clone().json();
          if (response.status !== 202)
            throw new Error(
              `Real reprocess did not accept: ${response.status}`,
            );
          throw new TypeError(
            'Verification: accepted response lost in transport',
          );
        }
        if (
          path === `/api/images/${image}` &&
          window.__detail171LostReceipt &&
          !window.__detail171LostHoldUsed
        ) {
          window.__detail171LostHoldUsed = true;
          await new Promise((resolve) => {
            window.__detail171LostRelease = resolve;
          });
        }
        return response;
      };
    }, image);
    await page.click('[data-testid="reprocess-submit"]');
    await page.waitForFunction(() => !!window.__detail171LostReceipt);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="detail-reprocess"]')
        ?.textContent.includes('提交结果待核对'),
    );
    await page.waitForFunction(
      () => typeof window.__detail171LostRelease === 'function',
    );
    await page.evaluate(() => window.__detail171LostRelease());
    const receipt = await page.evaluate(() => window.__detail171LostReceipt);
    assert.equal(receipt.scope, 'thumbnail');
    await page.waitForFunction(
      async ({ endpoint, job }) => {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`Detail HTTP ${response.status}`);
        const detail = await response.json();
        return (
          detail.processingJob?.id === job &&
          ['succeeded', 'failed'].includes(detail.processingJob.status)
        );
      },
      { endpoint, job: receipt.jobId },
      { timeout: 30000 },
    );
    const single = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(single.processingJob.status, 'succeeded');
    assert.deepEqual(single.processingJob.expectedVersions, ['thumbnail']);
    const afterSingle = await versions();
    for (const kind of ['original', 'compressed', 'watermark'])
      assert.equal(
        afterSingle.find((value) => value.kind === kind).object_id,
        beforeSingle.find((value) => value.kind === kind).object_id,
      );
    assert.notEqual(
      afterSingle.find((value) => value.kind === 'thumbnail').object_id,
      beforeSingle.find((value) => value.kind === 'thumbnail').object_id,
    );
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    const [afterCount] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    assert.equal(afterCount.count, priorCount.count + 1);
    await page.evaluate(() => {
      window.fetch = window.__detail171Fetch;
    });
    report.checks.push(
      'A real accepted thumbnail-only response is lost at fetch transport; the browser submits once and the DB gains one job; real worker success replaces only thumbnail while original/compressed/watermark object IDs remain unchanged.',
    );

    await direct(image, '');
    const labels = {
      original: '原图',
      compressed: '压缩图',
      thumbnail: '缩略图',
      watermark: '水印图',
    };
    for (const kind of Object.keys(labels)) {
      await page.click(`loc=role:tab[name="${labels[kind]}"]`);
      const detail = JSON.parse((await page.fetch(endpoint)).body);
      const version = detail.versions.find((version) => version.kind === kind);
      assert.equal(version.saved, true);
      const head = await page.fetch(version.downloadPath, { method: 'HEAD' });
      assert.equal(head.status, 200);
      const filename = decodeURIComponent(
        head.headers['content-disposition'].match(
          /filename\*=UTF-8''([^;]+)/i,
        )[1],
      );
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await page.click(button(`下载${labels[kind]}`));
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), filename);
      const path = join(
        config.output,
        `detail-171-download-${kind}-${filename}`,
      );
      await download.saveAs(path);
      const [object] = await sql(
        `SELECT o.key,s.id AS storage_id,s.local_path FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN storage_configs s ON s.id=o.storage_id WHERE v.image_id='${image}' AND v.kind='${kind}'`,
      );
      assert.deepEqual(
        await readFile(path),
        await readFile(
          join(
            config.dataDirectory,
            'storage',
            object.local_path,
            'ariso',
            object.storage_id,
            object.key,
          ),
        ),
      );
      await page.waitForSelector('loc=role:alertdialog[name="已发起下载"]');
      if (kind === 'original')
        assert.ok(
          await page.evaluate(() =>
            document
              .querySelector('[role="alertdialog"]')
              .textContent.includes('公开原图可能包含 GPS 和拍摄信息'),
          ),
        );
      await page.hover('loc=role:alertdialog[name="已发起下载"]');
      await page.click(button('关闭通知'));
      await page.waitForSelector('loc=role:alertdialog[name="已发起下载"]', {
        state: 'hidden',
      });
    }
    report.checks.push(
      'All four version tabs download actual stored bytes and production Content-Disposition filenames; public original download toast explicitly discloses GPS/photography risk.',
    );

    await sql(
      "UPDATE media_settings SET compression_enabled=0,watermark_mode='off' WHERE id=1",
    );
    await direct();
    const disabled = await page.evaluate(() =>
      ['compressed', 'watermark'].map(
        (kind) =>
          document.querySelector(
            `[data-testid="reprocess-scope-${kind}"] input`,
          ).disabled,
      ),
    );
    assert.deepEqual(disabled, [true, true]);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="reprocess-submit"]').disabled,
      ),
      false,
    );
    const assertDisabledReasons = async () => {
      const styles = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="reprocess-scope-"]')]
          .filter((content) => content.querySelector('input').disabled)
          .map((content) => {
            const description = content.parentElement.querySelector(
              '[data-slot="description"]',
            );
            let opacity = 1;
            for (
              let node = description;
              node && node.closest('[data-testid="detail-reprocess"]');
              node = node.parentElement
            )
              opacity *= Number(getComputedStyle(node).opacity);
            return {
              content: Number(getComputedStyle(content).opacity),
              reason: description?.textContent,
              opacity,
            };
          }),
      );
      assert.ok(styles.length > 0);
      for (const style of styles) {
        assert.equal(style.content, 0.42, 'Only disabled choice is faded');
        assert.ok(style.reason, 'Disabled choice explains why');
        assert.equal(
          style.opacity,
          1,
          'Reason retains full muted-text opacity',
        );
      }
    };
    await assertDisabledReasons();
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some((node) =>
          node.textContent.includes('去设置开启压缩'),
        ),
      ),
      false,
    );
    await layout('reprocess-disabled-settings');
    await sql("UPDATE media_settings SET watermark_mode='text' WHERE id=1");
    await direct();
    await page.waitForSelector(button('去设置开启压缩'));
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find((node) =>
            node.textContent.includes('去设置开启压缩'),
          ).disabled,
      ),
      true,
    );
    await assertDisabledReasons();
    await layout('reprocess-disabled-compression');
    await sql("UPDATE media_settings SET watermark_mode='off' WHERE id=1");
    await direct();
    await page.click(button('返回详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    for (const name of ['压缩图', '水印图']) {
      await page.click(`loc=role:tab[name="${name}"]`);
      assert.equal(
        await page.evaluate(
          (label) =>
            [
              ...document.querySelectorAll(
                '[data-testid="detail-actions"] button',
              ),
            ].find((node) => node.textContent === `下载${label}`).disabled,
          name,
        ),
        false,
      );
    }
    await direct('library-006');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="reprocess-submit"]').disabled,
      ),
      true,
    );
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-reprocess"]')
          .textContent.includes('存储已停用 · 内容不可读'),
      ),
    );
    await assertDisabledReasons();
    await layout('reprocess-disabled-storage');
    await direct('library-003');
    for (const scope of ['compressed', 'thumbnail', 'watermark'])
      assert.equal(
        await page.evaluate(
          (scope) =>
            document.querySelector(
              `[data-testid="reprocess-scope-${scope}"] input`,
            ).disabled,
          scope,
        ),
        true,
      );
    await assertDisabledReasons();
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-reprocess"]')
          .textContent.includes('关闭开关不会删除'),
      ),
      false,
    );
    await layout('reprocess-first-failure');
    report.checks.push(
      'Saved compression/watermark remain downloadable after settings turn off; disabled scope reasons render, stopped storage forbids submit, and a persisted first-processing failure offers only all-scope retry.',
    );

    await direct('library-002');
    assert.ok(
      await page.evaluate(() => {
        const workspace = document.querySelector(
          '[data-testid="detail-reprocess"]',
        );
        return (
          !workspace.dataset.jobStatus &&
          !workspace.textContent.includes('正在重新处理') &&
          !workspace.textContent.includes('任务已受理') &&
          workspace.textContent.includes('处理中') &&
          document.querySelector('[data-testid="reprocess-submit"]').disabled
        );
      }),
      'An initial processing task is never adopted as a reprocess receipt',
    );
    // These explicit persisted fixtures verify rendering/polling, not real worker results.
    await sql(
      "UPDATE media_images SET processing_status='ready' WHERE id='library-002'",
    );
    await sql(
      `UPDATE media_jobs SET status='queued',next_attempt_at=${Date.now() + 3600000},error=NULL WHERE id='active-job'`,
    );
    await direct('library-002');
    await page.waitForSelector(`${workspace}[data-job-status="queued"]`);
    await layout('reprocess-fixture-queued');
    const published = await sql(
      "SELECT kind,object_id FROM media_versions WHERE image_id='library-002' ORDER BY kind",
    );
    const candidateBytes = await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    );
    await writeFile(candidatePath, candidateBytes);
    await sql(
      `INSERT INTO media_objects (id,image_id,job_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${candidateId}','library-002','active-job',${quote(candidateStorage.id)},${quote(candidateKey)},'compressed','stored',${candidateBytes.length},'png','image/png',${Date.now()},${Date.now()})`,
    );
    await sql(
      `UPDATE media_jobs SET status='running',scope='all',expected_versions='["compressed","thumbnail","watermark"]' WHERE id='active-job'`,
    );
    await direct('library-002');
    await page.waitForSelector(`${workspace}[data-job-status="running"]`);
    await page.waitForFunction(() => {
      const rows = [
        ...document.querySelectorAll(
          '[data-testid="detail-reprocess"] dl > div',
        ),
      ];
      return (
        rows.length === 2 &&
        rows[0].textContent.includes('压缩图') &&
        rows[0].textContent.includes('候选已生成') &&
        rows[0].textContent.includes('尚未替换') &&
        rows[1].textContent.includes('缩略图 / 水印图') &&
        rows[1].textContent.includes('处理中') &&
        rows[1].textContent.includes('全部成功后一起替换')
      );
    });
    const rendered = JSON.parse(
      (await page.fetch('/api/images/library-002')).body,
    );
    assert.deepEqual(rendered.processingJob.generatedVersions, ['compressed']);
    assert.equal(
      rendered.versions.find((version) => version.kind === 'compressed').saved,
      false,
    );
    assert.deepEqual(
      await sql(
        "SELECT kind,object_id FROM media_versions WHERE image_id='library-002' ORDER BY kind",
      ),
      published,
      'Stored candidate does not change published version references',
    );
    await layout('reprocess-fixture-running');
    await sql(
      "UPDATE media_jobs SET status='failed',error='controlled render verification failure' WHERE id='active-job'",
    );
    await page.waitForSelector(`${workspace}[data-job-status="failed"]`);
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-task-status"]')
          .textContent.includes('已有版本保留'),
      ),
    );
    await layout('reprocess-fixture-failed');
    await page.click(button('按最新设置重试'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await sql(
      "UPDATE media_jobs SET status='running',error=NULL WHERE id='active-job'",
    );
    await direct('library-002', '');
    await page.evaluate(() => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171StatusFaultUsed = false;
      window.__detail171StatusRequests = [];
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const response = await original(...args);
        if (path === '/api/images/status') {
          const ids = JSON.parse(args[1].body).ids;
          window.__detail171StatusRequests.push(ids);
          if (
            ids.length === 1 &&
            ids[0] === 'library-002' &&
            !window.__detail171StatusFaultUsed
          ) {
            window.__detail171StatusFaultUsed = true;
            throw new TypeError('Verification: real status response lost');
          }
        }
        return response;
      };
    });
    await page.waitForSelector(button('重试任务状态'), { timeout: 10000 });
    const failedPolls = await page.evaluate(
      () => window.__detail171StatusRequests.length,
    );
    await page.waitForTimeout(2200);
    assert.equal(
      await page.evaluate(() => window.__detail171StatusRequests.length),
      failedPolls,
      'Status transport error stops automatic polling',
    );
    await page.focus(button('重试任务状态'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(button('重试任务状态'), { state: 'hidden' });
    assert.ok(
      (await page.evaluate(() => window.__detail171StatusRequests.length)) >
        failedPolls,
    );
    for (const ids of await page.evaluate(
      () => window.__detail171StatusRequests,
    ))
      assert.deepEqual(ids, ['library-002']);
    await page.evaluate(() => {
      window.fetch = window.__detail171Fetch;
    });
    report.checks.push(
      'Controlled persisted job (not queued to worker) renders single-thumbnail queued, then all-scope running with a real stored compressed fixture candidate: generated/not-yet-replaced and remaining thumbnail/watermark rows render separately while published object IDs stay fixed. This is rendering evidence, not real worker generation. Failed state keeps old versions, retry returns to current settings; losing a real current-ID status response stops polling and keyboard retry reads the real endpoint again.',
    );
  } finally {
    await sql(
      `UPDATE media_settings SET compression_enabled=${settings.compression_enabled},watermark_mode=${quote(settings.watermark_mode)},watermark_text=${quote(settings.watermark_text)},watermark_font=${quote(settings.watermark_font)} WHERE id=1`,
    );
    await sql(
      `UPDATE media_jobs SET status=${quote(active.status)},scope=${quote(active.scope)},expected_versions=${quote(active.expected_versions)},error=${active.error === null ? 'NULL' : quote(active.error)},next_attempt_at=${active.next_attempt_at ?? 'NULL'} WHERE id='active-job'`,
    );
    await sql(
      `UPDATE media_images SET processing_status=${quote(activeImage.processing_status)} WHERE id='library-002'`,
    );
    await sql(`DELETE FROM media_objects WHERE id='${candidateId}'`);
    await rm(candidatePath, { force: true });
  }
  await verifyDetail171ReturnContext({ page, config, report });
}

export async function verifyDetail171ReturnContext({ page, config, report }) {
  const button = (name) =>
    `loc=role:${['网格', '瀑布流'].includes(name) ? 'radio' : 'button'}[name="${name}"]`;
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 400,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.waitForFunction(() => innerHeight === 400);
  const sourceUrl = `${config.origin}/library?visibility=public&sort=uploaded_asc`;
  await page.goto(sourceUrl);
  await page.waitForSelector('[data-testid="library-gallery"]');
  const previousLayout = await page.evaluate(
    () => document.querySelector('[data-testid="library-list"]').dataset.layout,
  );
  await page.click(button('瀑布流'));
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="library-list"]').dataset.layout ===
      'masonry',
  );
  const ordered = [];
  let cursor = null;
  let total;
  do {
    const params = new URLSearchParams({
      scope: 'normal',
      visibility: 'public',
      sort: 'uploaded_asc',
      pageSize: '80',
    });
    if (cursor) params.set('cursor', cursor);
    const response = await page.fetch(`/api/images?${params}`);
    assert.equal(response.status, 200);
    const result = JSON.parse(response.body);
    ordered.push(...result.items.map((item) => item.id));
    total = result.total;
    cursor = result.nextCursor;
  } while (!ordered.includes('library-007') && cursor);
  const position = ordered.indexOf('library-007') + 1;
  assert.ok(
    position > 0,
    'Real public source query contains the download fixture',
  );
  const needed = Math.min(total, Math.max(80, position));
  let loaded = await page.evaluate(() =>
    Number(
      document.querySelector('[data-testid="library-list"]').dataset
        .loadedCount,
    ),
  );
  while (loaded < needed) {
    await page.click('[data-testid="library-load-more"]');
    await page.waitForFunction(
      (previous) =>
        Number(
          document.querySelector('[data-testid="library-list"]').dataset
            .loadedCount,
        ) > previous,
      loaded,
    );
    loaded = await page.evaluate(() =>
      Number(
        document.querySelector('[data-testid="library-list"]').dataset
          .loadedCount,
      ),
    );
  }
  assert.ok(loaded >= needed);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  // A loaded item can still be absent from the virtual DOM. Start at the end
  // and walk actual scroll windows until its real card is mounted.
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      end: main.scrollHeight - main.clientHeight,
      height: main.clientHeight,
    };
  });
  let mounted = false;
  const step = Math.max(100, geometry.height / 2);
  for (let top = geometry.end; top >= -step; top -= step) {
    await page.evaluate((top) => {
      document.querySelector('main').scrollTo(0, Math.max(0, top));
    }, top);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    mounted = await page.evaluate(
      () => !!document.querySelector('[data-image-id="library-007"]'),
    );
    if (mounted) break;
  }
  assert.equal(
    mounted,
    true,
    'Loaded source card becomes available in its virtual window',
  );
  const source = 'loc=role:button[name="查看图片：中文下载样本.png"]';
  await page.hover(source);
  await page.click('label:has(input[aria-label="选择图片：中文下载样本.png"])');
  await page.waitForSelector('[data-testid="library-selection"]');
  await page.focus(source);
  const scroll = await page.evaluate(
    () => document.querySelector('main').scrollTop,
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="水印图"]');
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  await page.click(button('返回详情'));
  await page.waitForSelector('[data-testid="detail-body"]');
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="detail-preview"]')]
        .find((node) => node.getClientRects().length)
        ?.src.includes('type=watermark'),
    ),
  );
  await page.click(button('关闭图片详情'));
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  assert.equal(await page.url(), new URL(sourceUrl).href);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('input[aria-label="选择图片：中文下载样本.png"]')
          .checked,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="library-list"]').dataset.layout,
    ),
    'masonry',
  );
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      '查看图片：中文下载样本.png',
  );
  assert.ok(
    Math.abs(
      (await page.evaluate(() => document.querySelector('main').scrollTop)) -
        scroll,
    ) <= 1,
  );
  report.checks.push(
    `Real public source order locates the card at ${position}; ${loaded} items are loaded and actual virtual windows are traversed. Card keyboard opening → version workspace → detail retains watermark preview; closing preserves visibility/sort URL, masonry layout, source scroll and exact trigger focus.`,
  );
  if (previousLayout === 'grid') await page.click(button('网格'));
}

export async function verifyDetail171Consumers({ page, config, sql, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  const resize = async (width, theme) => {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: width === 1440 ? 1080 : 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction(
      ({ width, theme }) =>
        innerWidth === width &&
        document.documentElement.classList.contains(theme),
      { width, theme },
    );
  };
  const expectedNavigation = [
    ['总览', null],
    ['上传', '/upload'],
    ['图库', '/library'],
    ['相册', '/albums'],
    ['标签', null],
    ['分享管理', null],
    ['回收站', '/trash'],
    ['访问统计', null],
    ['存储管理', null],
    ['站点设置', null],
  ];
  let branding;
  const screenshot = async (state, width, theme, current) => {
    const shell = await page.evaluate(() => ({
      shells: document.querySelectorAll('.admin-shell').length,
      mains: document.querySelectorAll('#main-content').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      brand: [...document.querySelectorAll('a.shell-brand')].map((node) =>
        node.textContent.trim(),
      ),
      account: document
        .querySelector('.shell-navigation button[aria-label="账号菜单"]')
        .textContent.trim(),
      navigation: [
        ...document.querySelectorAll('.shell-navigation nav .shell-nav-link'),
      ].map((node) => [
        node.querySelector('.shell-nav-label').textContent.trim(),
        node.getAttribute('href'),
      ]),
      current: [
        ...document.querySelectorAll(
          '.shell-navigation nav [aria-current="page"]',
        ),
      ].map((node) => node.getAttribute('href')),
      headerHeight: document
        .querySelector('.shell-mobile-header')
        .getBoundingClientRect().height,
    }));
    assert.equal(shell.shells, 1);
    assert.equal(shell.mains, 1);
    assert.equal(shell.overflow, false);
    assert.deepEqual(shell.navigation, expectedNavigation);
    assert.deepEqual(shell.current, [current]);
    const identity = { brand: shell.brand, account: shell.account };
    branding ??= identity;
    assert.deepEqual(identity, branding);
    if (width === 390) assert.equal(shell.headerHeight, 64);
    await page.screenshot({
      path: join(
        config.output,
        `detail-171-consumer-${state}-${theme}-${width}.png`,
      ),
    });
    report.layouts.push({
      state: `detail-171-consumer-${state}`,
      width,
      theme,
      ...shell,
    });
  };

  await resize(1440, 'light');
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  await page.click(button('开始上传'));
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="ready"]',
    {
      timeout: 30000,
    },
  );
  const queue = await page.evaluate(() => {
    const item = document.querySelector('[data-testid="upload-item"]');
    window.__detail171ConsumerDocument = crypto.randomUUID();
    return {
      queueId: item.dataset.queueId,
      imageId: item.dataset.imageId,
      document: window.__detail171ConsumerDocument,
    };
  });
  assert.ok(queue.imageId);
  const [uploaded] = await sql(
    `SELECT display_name,processing_status FROM media_images WHERE id='${queue.imageId}'`,
  );
  assert.equal(uploaded.processing_status, 'ready');
  const uploadRow = `[data-testid="upload-item"][data-queue-id="${queue.queueId}"]`;
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await resize(width, theme);
      await screenshot('upload-ready', width, theme, '/upload');
      await page.click(`${uploadRow} button:text-is("查看详情")`);
      await page.waitForSelector('[data-testid="detail-body"]');
      await page.click('loc=role:tab[name="缩略图"]');
      await page.click('[data-testid="detail-version-entry"]');
      await page.waitForSelector('[data-testid="detail-versions"]');
      const location = new URL(await page.url());
      assert.equal(location.pathname, '/library');
      assert.equal(location.searchParams.get('image'), queue.imageId);
      assert.equal(location.searchParams.get('detailView'), 'versions');
      assert.equal(location.searchParams.get('preview'), 'thumbnail');
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="detail-versions"]')
            .textContent.includes('当前预览缩略图'),
        ),
      );
      await screenshot('upload-versions', width, theme, '/library');
      await page.evaluate(() => history.back());
      await page.waitForURL(`${config.origin}/upload`);
      await page.waitForSelector(`${uploadRow}[data-state="ready"]`);
      assert.deepEqual(
        await page.evaluate(
          (selector) => ({
            imageId: document.querySelector(selector).dataset.imageId,
            document: window.__detail171ConsumerDocument,
          }),
          uploadRow,
        ),
        { imageId: queue.imageId, document: queue.document },
        'Client version navigation and browser Back preserve the actual ready queue',
      );
      if (
        await page.evaluate(
          () => !!document.querySelector('[data-testid="library-detail"]'),
        )
      ) {
        await page.click(button('关闭图片详情'));
        await page.waitForSelector('[data-testid="library-detail"]', {
          state: 'hidden',
        });
      }
    }
  }
  report.checks.push(
    `Manual File upload runs the real receiver and worker to ready (${queue.imageId}); upload detail selects thumbnail and routes to version information with that selection. Browser Back at desktop/phone in both themes preserves the same document, queue ID, image ID and ready state.`,
  );

  const created = await page.fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '详情公共消费验证',
      description: 'Issue 171 disposable browser fixture',
    }),
  });
  assert.equal(created.status, 201);
  const album = JSON.parse(created.body).album;
  const albumPath = `/albums/${encodeURIComponent(album.id)}`;
  try {
    const membership = await page.fetch(
      `/api/images/${queue.imageId}/collections`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumIds: [album.id] }),
      },
    );
    assert.equal(membership.status, 200);
    assert.deepEqual(JSON.parse(membership.body).albums, [
      { id: album.id, name: album.name },
    ]);
    const source = button(`查看图片：${uploaded.display_name}`);
    const card = `[data-image-id="${queue.imageId}"]`;
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 390]) {
        await resize(width, theme);
        await page.goto(`${config.origin}${albumPath}`);
        await page.waitForSelector(card);
        await page.hover(source);
        await page.click(
          `label:has(input[aria-label="选择图片：${uploaded.display_name}"])`,
        );
        await page.waitForSelector(`${card}[data-selected="true"]`);
        await screenshot('album-selected', width, theme, '/albums');
        await page.focus(source);
        const scroll = await page.evaluate(
          () => document.querySelector('main').scrollTop,
        );
        await page.keyboard.press('Enter');
        await page.waitForSelector('[data-testid="detail-body"]');
        await page.click('loc=role:tab[name="缩略图"]');
        await page.click('[data-testid="detail-version-entry"]');
        await page.waitForSelector('[data-testid="detail-versions"]');
        const location = new URL(await page.url());
        assert.equal(location.pathname, albumPath);
        assert.equal(location.searchParams.get('image'), queue.imageId);
        assert.equal(location.searchParams.get('preview'), 'thumbnail');
        await screenshot('album-versions', width, theme, '/albums');
        await page.click(button('返回详情'));
        await page.waitForSelector('[data-testid="detail-body"]');
        assert.ok(
          await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid="detail-preview"]')]
              .find((node) => node.getClientRects().length)
              ?.src.includes('type=thumbnail'),
          ),
        );
        await page.click(button('关闭图片详情'));
        await page.waitForFunction(
          () => !new URL(location.href).searchParams.has('image'),
        );
        assert.equal(await page.url(), `${config.origin}${albumPath}`);
        await page.waitForSelector(`${card}[data-selected="true"]`);
        await page.waitForFunction(
          (name) =>
            document.activeElement?.getAttribute('aria-label') ===
            `查看图片：${name}`,
          uploaded.display_name,
        );
        assert.ok(
          Math.abs(
            (await page.evaluate(
              () => document.querySelector('main').scrollTop,
            )) - scroll,
          ) <= 1,
        );
        assert.equal(
          await page.evaluate(() =>
            document
              .querySelector('[data-testid="library-selection"] button')
              .getAttribute('aria-label'),
          ),
          '操作已选 1 张图片',
        );
      }
    }
    report.checks.push(
      `Real album POST and final-set collections PATCH place the uploaded image in ${album.id}; keyboard card → detail → versions → detail → close preserves album route, selected thumbnail, one selected image, source scroll and trigger focus on desktop/phone in both themes. Shared shell brand, account, ten navigation entries and current route remain consistent.`,
    );
  } finally {
    const removed = await page.fetch(`/api/albums/${album.id}`, {
      method: 'DELETE',
    });
    assert.equal(
      removed.status,
      200,
      'Only this newly created disposable album is removed',
    );
  }
  // Accepted upload media remains in the runner's disposable DATA_DIR.
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-list"]');
}
