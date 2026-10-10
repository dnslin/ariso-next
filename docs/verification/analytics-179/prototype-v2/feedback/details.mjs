/* global taskSpace */
const p = (await taskSpace(2)).page('p2');
const base =
  '/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso/docs/verification/analytics-179/prototype-v2/feedback';
await p.hover('button[aria-label="关闭图片统计"]');
await p.waitForFunction(() =>
  document
    .getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity)
    .every((a) => a.playState !== 'running'),
);
await p.screenshot({ path: base + '/hover-desktop.png' });
await p.keyboard.press('Escape');
await p.waitForSelector('[role="dialog"]', { state: 'hidden' });
await p.cdp('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await p.evaluate(() =>
  document
    .querySelector('.rank-row:last-child')
    .scrollIntoView({ block: 'end' }),
);
await p.screenshot({ path: base + '/ranking-mobile-bottom.png' });
await p.click('loc=role:tab[name="处理异常"]');
await p.waitForSelector('.failure-card');
await p.waitForFunction(() =>
  document
    .getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity)
    .every((a) => a.playState !== 'running'),
);
await p.screenshot({ path: base + '/failures-mobile.png' });
await p.click('loc=role:tab[name="访问统计"]');
await p.focus('button[aria-label="查看林间晨光统计"]');
await p.keyboard.press('Enter');
await p.cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
console.log(
  'Captured actual close hover, tenth existing ranking sample and revised failure cards.',
);
