export const tagDialogSelector =
  ':is([role="dialog"],[role="alertdialog"]):not([data-slot="toast"])';

export async function readTagDialog(page) {
  return page.evaluate(
    (selector) => document.querySelector(selector).textContent,
    tagDialogSelector,
  );
}

export async function waitTagDialogText(page, text) {
  await page.waitForFunction(
    ({ selector, text }) =>
      document.querySelector(selector)?.textContent.includes(text),
    { selector: tagDialogSelector, text },
  );
}

export async function waitTagSuccess(page, text) {
  await page.waitForFunction(
    ({ selector, text }) =>
      document
        .querySelector('[data-slot="toast"].toast--success')
        ?.textContent.includes(text) && !document.querySelector(selector),
    { selector: tagDialogSelector, text },
  );
}
