import assert from 'node:assert/strict';

/** Exercise an animation frame before React's queued DOM commit, without sleeps. */
export async function verifyLoginFeedbackFocus(page, config) {
  await page.goto(`${config.origin}/login`);
  await page.waitForSelector('#email');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  const attempts = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      const originalPostMessage = MessagePort.prototype.postMessage;
      const queued = [];
      let hold = false;
      window.__feedbackFrame = null;
      window.__completeFeedbackResponse = null;
      MessagePort.prototype.postMessage = function (...args) {
        if (hold) {
          queued.push(() => originalPostMessage.apply(this, args));
          if (queued.length === 1)
            requestAnimationFrame(() => {
              window.__feedbackFrame = {
                queuedCommits: queued.length,
                alertPresent: !!document.querySelector('[role="alert"]'),
              };
            });
        } else return originalPostMessage.apply(this, args);
      };
      window.fetch = async (...args) => {
        if (args[0] === '/api/auth/sign-in/email')
          return new Response('{}', { status: 200 });
        if (args[0] === '/api/auth/get-session') {
          return new Promise((resolve) => {
            window.__completeFeedbackResponse = () => {
              hold = true;
              resolve(new Response('null', { status: 200 }));
            };
          });
        }
        return originalFetch(...args);
      };
      window.__releaseFeedbackCommit = () => {
        hold = false;
        MessagePort.prototype.postMessage = originalPostMessage;
        window.fetch = originalFetch;
        queued.splice(0).forEach((run) => run());
      };
    });
    let frame;
    try {
      await page.focus('loc=role:button[name="登录"]');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () =>
          window.__completeFeedbackResponse &&
          document.querySelector('button[type="submit"]').disabled,
      );
      await page.evaluate(() => window.__completeFeedbackResponse());
      await page.waitForFunction(() => window.__feedbackFrame !== null);
      frame = await page.evaluate(() => window.__feedbackFrame);
      if (attempt === 0)
        assert.equal(
          frame.alertPresent,
          false,
          'The first error must not be committed before the controlled frame',
        );
      assert.ok(
        frame.queuedCommits > 0,
        'The regression must delay a real React commit',
      );
    } finally {
      await page.evaluate(() => window.__releaseFeedbackCommit());
    }
    await page.waitForFunction(() => {
      const alert = document.querySelector('[role="alert"]');
      return (
        alert?.textContent.includes('尚未确认登录会话，请重试。') &&
        document.activeElement?.getAttribute('tabindex') === '-1' &&
        document.activeElement.contains(alert)
      );
    });
    // Editing must not continually steal focus back to the existing error.
    await page.focus('#email');
    await page.keyboard.press('End');
    await page.keyboard.press('Space');
    await page.waitForFunction(() =>
      document.querySelector('#email').value.endsWith(' '),
    );
    assert.equal(await page.evaluate(() => document.activeElement.id), 'email');
    attempts.push({ attempt: attempt + 1, ...frame, focusedAfterCommit: true });
  }
  await page.goto(`${config.origin}/login`);
  await page.waitForSelector('#email');
  return {
    scenario: 'Deferred React commit and repeated identical login feedback',
    injection: 'browser fetch boundary and controlled MessagePort scheduling',
    attempts,
  };
}
