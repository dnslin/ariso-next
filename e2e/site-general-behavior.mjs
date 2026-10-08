import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { button, editableSite, quote } from './site-general-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';
import {
  prepareSiteGeneralHistory,
  verifySiteGeneralBack,
} from './site-general-history.mjs';

export async function verifySiteGeneralBehavior(page, config, tools, report) {
  const historyId = 'issue194-history';
  const storage = await tools.request('/api/storages', 'POST', {
    type: 'local',
    name: 'Issue 194 历史记录',
    localPath: historyId,
  });
  const directory = join(config.dataDirectory, 'storage', historyId);
  try {
    const bytes = await readFile(
      join(config.projectDirectory, 'tests/fixtures/media-formats/source.png'),
    );
    const key = `ariso/images/${historyId}/original.png`;
    await mkdir(join(directory, 'ariso/images', historyId), {
      recursive: true,
    });
    await writeFile(join(directory, key), bytes);
    const instant = Date.parse('2026-03-08T07:00:00.000Z');
    await tools.sql(
      `INSERT INTO media_images(id,storage_id,original_name,display_name,visibility,format,mime,byte_size,processing_status,created_at,updated_at) VALUES(${quote(historyId)},${quote(storage.id)},'source.png','source.png','private','PNG','image/png',${bytes.length},'ready',${instant},${instant})`,
    );
    await tools.sql(
      `INSERT INTO media_objects(id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES(${quote(historyId)},${quote(historyId)},${quote(storage.id)},${quote(key)},'original','stored',${bytes.length},'PNG','image/png',${instant},${instant})`,
    );
    const baseline = await tools.read();
    const history = {
      images: await tools.sql(
        'SELECT id,created_at,updated_at FROM media_images ORDER BY id',
      ),
      objects: await tools.sql(
        'SELECT id,image_id,key,created_at,updated_at FROM media_objects ORDER BY id',
      ),
    };
    assert.ok(history.images.some((row) => row.id === historyId));
    assert.ok(history.objects.some((row) => row.image_id === historyId));
    await tools.open();
    for (const [input, expected] of [
      [{ name: '  Issue 194 站点  ' }, { name: 'Issue 194 站点' }],
      [{ description: '' }, { description: '' }],
      [
        { description: '普通文本 <b>不是 HTML</b>' },
        { description: '普通文本 <b>不是 HTML</b>' },
      ],
      [{ timeZone: 'America/New_York' }, { timeZone: 'America/New_York' }],
    ]) {
      const previous = editableSite(await tools.read());
      await tools.fill(input);
      await tools.save();
      const saved = editableSite(await tools.read());
      assert.deepEqual(saved, { ...previous, ...expected });
      await page.reload();
      await tools.state('ready');
      assert.deepEqual(
        await tools.values(),
        saved,
        'Real reload returns all current saved fields',
      );
    }
    assert.deepEqual(
      await tools.sql(
        'SELECT id,created_at,updated_at FROM media_images ORDER BY id',
      ),
      history.images,
    );
    assert.deepEqual(
      await tools.sql(
        'SELECT id,image_id,key,created_at,updated_at FROM media_objects ORDER BY id',
      ),
      history.objects,
    );
    for (const [name, input] of [
      ['name', ' '],
      ['publicUrl', 'https://example.test/subpath'],
      ['timeZone', '+08:00'],
    ]) {
      await tools.fill({ [name]: input });
      if (name === 'timeZone') {
        await resizeViewport(page, 390);
        await page.mouse.move(200, 420, {
          label: 'move into settings content',
        });
        await page.mouse.wheel(0, -2000, { label: 'return to form heading' });
        await page.waitForFunction(
          () => document.querySelector('main').scrollTop === 0,
        );
      }
      const previous = await tools.read();
      await page.click(button('保存站点信息'));
      await page.waitForFunction(
        (name) =>
          document
            .querySelector(`#site-${name}`)
            ?.getAttribute('aria-invalid') === 'true',
        name,
      );
      assert.equal(
        (await tools.values())[name],
        input,
        'Invalid input is retained for correction',
      );
      assert.deepEqual(
        await tools.read(),
        previous,
        'Field validation does not partially persist',
      );
      if (name === 'timeZone') {
        const visible = await page.evaluate(() => {
          const input = document.querySelector('#site-timeZone');
          const group = input.closest('[data-slot="textfield"]');
          const bounds = group.getBoundingClientRect();
          const main = document.querySelector('main').getBoundingClientRect();
          const footer = document
            .querySelector('.shell-footer')
            .getBoundingClientRect();
          return {
            focused: document.activeElement === input,
            visible:
              bounds.top >= main.top &&
              bounds.bottom <= Math.min(main.bottom, footer.top),
            text: group.textContent.trim(),
          };
        });
        assert.equal(visible.focused, true);
        assert.equal(
          visible.visible,
          true,
          'First invalid timezone field and error are revealed above the fixed footer',
        );
        report.invalidTimeZoneVisibility = visible;
      }
      await tools.evidence(`invalid-${name}`, 390, 'dark');
      await tools.fill({ [name]: previous[name] });
    }
    await tools.fill({
      name: '组合保存',
      description: '全部四字段',
      publicUrl: `${config.origin}/`,
      timeZone: 'UTC',
    });
    await tools.save();
    assert.deepEqual(editableSite(await tools.read()), {
      name: '组合保存',
      description: '全部四字段',
      publicUrl: config.origin,
      timeZone: 'UTC',
    });
    const corsBefore = await tools.sql(
      'SELECT id,cors_status,updated_at FROM storage_configs ORDER BY id',
    );
    await tools.fill({ publicUrl: `${config.origin.toUpperCase()}/` });
    await tools.save();
    assert.deepEqual(
      await tools.sql(
        'SELECT id,cors_status,updated_at FROM storage_configs ORDER BY id',
      ),
      corsBefore,
      'Equivalent normalized origin does not invalidate S3 or change local storage',
    );
    await tools.patch(editableSite(baseline));
    await tools.open();
    await resizeViewport(page, 1440);
    await tools.fill({ description: '离开确认保留的草稿' });
    const draft = await tools.values();
    const dialog = '[role="dialog"]:has-text("放弃未保存的修改")';
    await page.click('main a[href="/settings/storage"]');
    await page.waitForSelector(dialog);
    await page.click(button('继续编辑'));
    await page.waitForSelector(dialog, { state: 'hidden' });
    assert.deepEqual(await tools.values(), draft);
    assert.equal(new URL(await page.url()).pathname, '/settings/general');
    await page.click('loc=role:tab[name="图片处理"]');
    await page.waitForSelector(dialog);
    await page.click(button('放弃修改'));
    await page.waitForURL(`${config.origin}/settings/processing`);
    assert.deepEqual(
      editableSite(await tools.read()),
      editableSite(baseline),
      'Discarding a draft navigates without saving it',
    );
    await tools.open();
    await resizeViewport(page, 390);
    await tools.fill({ description: '手机分类保留草稿' });
    const phoneDraft = await tools.values();
    await page.click('.settings-mobile button');
    await page.click('loc=role:option[name="图片处理"]');
    await page.waitForSelector(dialog);
    await page.click(button('继续编辑'));
    await page.waitForSelector(dialog, { state: 'hidden' });
    assert.deepEqual(await tools.values(), phoneDraft);
    await page.click('main a[href="/settings/storage"]');
    await page.waitForSelector(dialog);
    await page.click(button('放弃修改'));
    await page.waitForURL(`${config.origin}/settings/storage`);
    await tools.open();
    const entries = await prepareSiteGeneralHistory(page, config, tools);
    await tools.fill({ description: '后退必须保留的草稿' });
    await verifySiteGeneralBack(page, tools, report, entries, {
      discard: true,
    });
    await tools.open();
    report.checks.push(
      'Four fields persist independently and as one form through real PATCH and reload; field errors keep exact input and do not partially save; empty description, plain text, IANA timezone and equivalent origin are covered; historical UTC/IDs/Keys are unchanged.',
    );
  } finally {
    await tools.sql(
      `DELETE FROM media_objects WHERE image_id=${quote(historyId)}`,
    );
    await tools.sql(`DELETE FROM media_images WHERE id=${quote(historyId)}`);
    await tools.sql(
      `DELETE FROM storage_configs WHERE id=${quote(storage.id)}`,
    );
    await rm(directory, { recursive: true, force: true });
  }
}

export async function verifySiteGeneralAddress(page, config, tools, report) {
  const original = await tools.read();
  const fixture = 'issue194-browser-s3';
  const now = Date.now();
  await tools.sql(
    `INSERT INTO storage_configs(id,name,type,enabled,cors_status,created_at,updated_at) VALUES(${quote(fixture)},'Issue 194 S3','s3',0,'passed',${now},${now})`,
  );
  const next = `http://localhost:${new URL(config.origin).port}`;
  try {
    await tools.open();
    await tools.fill({ publicUrl: next });
    await tools.save();
    assert.equal(
      new URL(await page.url()).origin,
      config.origin,
      'Address save leaves the current page and browser origin in place',
    );
    assert.equal((await tools.read()).publicUrl, next);
    assert.equal(
      (
        await tools.sql(
          `SELECT cors_status FROM storage_configs WHERE id=${quote(fixture)}`,
        )
      )[0].cors_status,
      'invalidated',
    );
    assert.equal(
      await page.evaluate(
        (next) =>
          document.querySelector('[data-testid="site-callback-url"]')
            .textContent === `${next}/api/auth/callback/github`,
        next,
      ),
      true,
    );
    for (const text of ['OAuth', '浏览器直传', '旧域名'])
      assert.equal(
        await page.evaluate(
          (text) => document.querySelector('main').textContent.includes(text),
          text,
        ),
        true,
      );
    await tools.evidence('origin-changed', 1440, 'light');
    await tools.evidence('origin-changed', 390, 'dark');
    await tools.reveal(
      'main [data-slot="card"] > div.border-t',
      'origin-region',
    );
    const oldWrite = await page.fetch('/api/settings/site', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '旧来源不得保存' }),
    });
    assert.equal(oldWrite.status, 403);
    assert.equal(JSON.parse(oldWrite.body).code, 'INVALID_ORIGIN');
    await page.goto(`${next}/login`);
    const login = await page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
    assert.equal(login.status, 200, login.body);
    await page.goto(`${next}/settings/general`);
    await tools.state('ready');
    const updated = await tools.request(
      '/api/settings/site',
      'PATCH',
      { description: '从新地址保存' },
      next,
    );
    assert.equal(updated.description, '从新地址保存');
    assert.equal(updated.githubCallbackUrl, `${next}/api/auth/callback/github`);
    await tools.request(
      '/api/settings/site',
      'PATCH',
      editableSite(original),
      next,
    );
    report.checks.push(
      'UI address change persists and invalidates a real disabled S3 configuration; notices remain readable, no redirect occurs, old-origin PATCH is rejected, and real new-origin login and settings PATCH succeed with the latest callback.',
    );
  } finally {
    // An interrupted acceptance check must still restore the disposable runtime
    // without guessing which browser-origin cookie is currently available.
    await tools.sql(
      `UPDATE site_settings SET name=${quote(original.name)},description=${quote(original.description)},public_url=${quote(original.publicUrl)},time_zone=${quote(original.timeZone)} WHERE id=1`,
    );
    await tools.sql(`DELETE FROM storage_configs WHERE id=${quote(fixture)}`);
    await tools.open();
  }
}
