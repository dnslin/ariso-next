import assert from 'node:assert/strict';
import { button } from './site-general-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

const leaveDialog = 'loc=role:dialog[name="放弃未保存的修改?"]';

async function historyPosition(page) {
  const history = await page.cdp('Page.getNavigationHistory');
  const entry = history.entries[history.currentIndex];
  const navigation = await page.evaluate(() => {
    if (!window.navigation?.currentEntry)
      throw new Error('Navigation API current entry is required');
    return {
      key: window.navigation.currentEntry.key,
      navigationIndex: window.navigation.currentEntry.index,
    };
  });
  assert.ok(entry, 'CDP supplies an actual current history entry');
  assert.ok(navigation.key, 'Navigation API supplies the original entry key');
  return {
    id: entry.id,
    url: entry.url,
    index: history.currentIndex,
    ids: history.entries.map(({ id }) => id),
    ...navigation,
  };
}

export async function prepareSiteGeneralHistory(page, config, tools) {
  // Enter through the actual Next Link so this is a same-document traversal,
  // rather than fabricating history or testing a cross-document reload.
  await resizeViewport(page, 1440);
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[type="file"]', { state: 'attached' });
  const target = await historyPosition(page);
  await page.click('.shell-navigation a[href="/settings/general"]');
  await page.waitForURL(`${config.origin}/settings/general`);
  await tools.state('ready');
  const current = await historyPosition(page);
  assert.equal(
    current.index,
    target.index + 1,
    'Actual client navigation adds exactly one settings history item',
  );
  assert.notEqual(current.key, target.key);
  assert.notEqual(current.id, target.id);
  return { target: { ...target, ids: current.ids }, current };
}

export async function verifySiteGeneralBack(
  page,
  tools,
  report,
  entries,
  { phase = 'ready', discard = false } = {},
) {
  const draft = await tools.values();
  const server = await tools.read();
  await page.cdp('Page.navigateToHistoryEntry', { entryId: entries.target.id });
  await page.waitForSelector(leaveDialog);
  assert.deepEqual(
    await historyPosition(page),
    entries.current,
    'Pending back leaves the original settings history index/key and all entry IDs unchanged',
  );
  if (phase === 'unknown')
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"]')].some(
          (node) =>
            node.textContent.includes('可能') &&
            node.textContent.includes('核对'),
        ),
      ),
      true,
    );
  await page.click(button('继续编辑'));
  await page.waitForSelector(leaveDialog, { state: 'hidden' });
  await tools.state(phase);
  assert.deepEqual(
    await tools.values(),
    draft,
    'Cancel back retains every input, including an unknown outcome with matching saved fields',
  );
  assert.deepEqual(
    await historyPosition(page),
    entries.current,
    'Cancel back does not replace, push, or move a history item',
  );
  assert.deepEqual(
    await tools.read(),
    server,
    'Back and cancel do not write settings',
  );
  if (discard) {
    await page.cdp('Page.navigateToHistoryEntry', {
      entryId: entries.target.id,
    });
    await page.waitForSelector(leaveDialog);
    await page.click(button('放弃修改'));
    await page.waitForURL(entries.target.url);
    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    assert.deepEqual(
      await historyPosition(page),
      entries.target,
      'Discard traverses to the exact original upload item and Navigation key, without pushing substitute history',
    );
    assert.deepEqual(
      await tools.read(),
      server,
      'Discarding navigation does not save the draft',
    );
  }
  report.checks.push(
    `Real CDP Back in ${phase}: confirmation and cancel preserve draft/index/key/all history IDs${discard ? '; discard returns to the original history entry without push' : ''}.`,
  );
}
