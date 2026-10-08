import assert from 'node:assert/strict';
import { smtpControl, smtpFill, smtpValue } from './smtp-page.mjs';
import { smtpTransport } from './smtp-transport.mjs';

/** Lost real writes and competing real saves exercise recovery without fake DTOs. */
export async function verifyUnknownSmtp(
  page,
  {
    width,
    fixture,
    report,
    ui,
    request,
    seeded,
    idle,
    readySave,
    acceptedTest,
  },
) {
  const pending = async (state) => {
    await page.waitForSelector(
      `${smtpControl('pending')}[data-state="${state}"]`,
    );
    const actions = await page.evaluate(() =>
      ['save', 'test', 'clear', 'tip'].map((name) => {
        const node = document.querySelector(`[data-testid="smtp-${name}"]`);
        return { name, exists: !!node, disabled: node?.disabled };
      }),
    );
    for (const action of actions) {
      assert.equal(
        action.exists,
        true,
        `Pending ${state} retains ${action.name} for the fixture's saved credentials`,
      );
      assert.equal(
        action.disabled,
        true,
        `Pending ${state} prevents ${action.name} until explicit recovery`,
      );
    }
  };
  const resume = async (name = 'current') => {
    await ui.activate(`resume-${name}`);
    await page.waitForSelector(smtpControl('pending'), { state: 'hidden' });
    await idle();
  };
  const assertSingleWrite = async (transport) =>
    assert.equal(
      (await transport.observed()).requests.filter(
        (item) => item.method === 'PATCH',
      ).length,
      1,
      'Unknown result never repeats the originating write',
    );

  await seeded(fixture.targets.tls);
  await smtpFill(page, 'from-name', `回读失败后核对 ${width}`);
  const failedRead = await smtpTransport(page, {
    method: 'PATCH',
    lose: true,
    loseReadAfterWrite: true,
  });
  try {
    await ui.activate('save');
    await failedRead.settled('GET');
    await pending('read-error');
    await ui.themedGeometry(`unknown-read-error-${width}`);
    await assertSingleWrite(failedRead);
    await ui.activate('reload');
    await page.waitForFunction(
      () =>
        window.__smtpTransport.responses.filter(
          (response) => response.method === 'GET',
        ).length >= 2,
    );
    await pending('matched');
    assert.equal(
      (await request()).fromName,
      `回读失败后核对 ${width}`,
      'Explicit reread sees the actual committed configuration',
    );
    await ui.themedGeometry(`unknown-reread-matched-${width}`);
    await assertSingleWrite(failedRead);
    await resume();
  } finally {
    await failedRead.dispose();
  }

  await seeded(fixture.targets.tls, {
    password: 'previous-wrong-fixture-password',
  });
  await smtpFill(page, 'password', fixture.password);
  const passwordUnknown = await smtpTransport(page, {
    method: 'PATCH',
    lose: true,
  });
  try {
    await ui.activate('save');
    await passwordUnknown.settled('GET');
    await pending('password-unknown');
    assert.equal(
      (await request()).hasPassword,
      true,
      'Public readback proves presence but cannot verify a replaced secret',
    );
    await ui.themedGeometry(`password-unknown-${width}`);
    await assertSingleWrite(passwordUnknown);
    await resume();
    assert.equal(
      await smtpValue(page, 'password'),
      '',
      'Explicit recovery clears the unconfirmed password input',
    );
  } finally {
    await passwordUnknown.dispose();
  }
  await smtpFill(page, 'password', fixture.password);
  const reentered = await smtpTransport(page);
  try {
    await readySave();
    await reentered.settled('PATCH');
    await idle();
    assert.equal(
      (await reentered.observed()).requests.find(
        (item) => item.method === 'PATCH',
      ).hasPasswordField,
      true,
      'Owner explicitly reenters and saves the replacement secret',
    );
  } finally {
    await reentered.dispose();
  }
  await acceptedTest();

  for (const choice of ['draft', 'current']) {
    await seeded(fixture.targets.tls);
    const draftName = `未确认输入 ${choice} ${width}`;
    const currentName = `另一保存操作 ${choice} ${width}`;
    await smtpFill(page, 'from-name', draftName);
    const mismatch = await smtpTransport(page, {
      method: 'PATCH',
      lose: true,
      concurrentWrite: { fromName: currentName },
    });
    try {
      await ui.activate('save');
      await mismatch.settled('GET');
      await pending('mismatch');
      assert.equal(
        (await mismatch.observed()).concurrentWrite.status,
        200,
        'A second real save creates the readback mismatch',
      );
      assert.equal(
        (await request()).fromName,
        currentName,
        'GET returns the actual competing server state',
      );
      await ui.themedGeometry(`readback-mismatch-${choice}-${width}`);
      await assertSingleWrite(mismatch);
      await resume(choice);
      assert.equal(
        await smtpValue(page, 'from-name'),
        choice === 'draft' ? draftName : currentName,
        'Explicit recovery chooses the corresponding form values',
      );
      assert.equal(
        (await request()).fromName,
        currentName,
        'Choosing how to edit does not write again',
      );
      await assertSingleWrite(mismatch);
      if (choice === 'draft')
        assert.equal(
          await page.evaluate(
            (selector) => document.querySelector(selector).disabled,
            smtpControl('save'),
          ),
          false,
          'Retained unmatched input is ready for a new explicit save',
        );
    } finally {
      await mismatch.dispose();
    }
  }
  report.checks.push(
    `${width}: unknown save readback failure/retry, password presence cannot prove replacement, explicit password reentry, and real competing-write mismatch with both recovery choices.`,
  );
}
