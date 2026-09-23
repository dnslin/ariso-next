const task = await taskSpace(config.spaceId);
const page = task.page('p1');
await page.goto(config.url);
const result = await page.evaluate(async () => {
  const limits = window.uploadLabLimits;
  const exactResponse = await fetch('/upload', {
    method: 'POST',
    body: new Blob([new Uint8Array(limits.maxBytes)]),
  });
  const exact = {
    status: exactResponse.status,
    body: await exactResponse.json(),
  };
  const overResponse = await fetch('/upload', {
    method: 'POST',
    body: new Blob([new Uint8Array(limits.maxBytes + 1)]),
  });
  const over = { status: overResponse.status, body: await overResponse.json() };
  const shortXhrTimeout = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/wait');
    xhr.timeout = 100;
    xhr.ontimeout = () => resolve('timeout');
    xhr.onload = () => reject(new Error('Expected client timeout'));
    xhr.onerror = () => reject(new Error('Unexpected network error'));
    xhr.send();
  });
  const waitResponse = await fetch('/wait');
  return {
    limits,
    exact,
    over,
    shortXhrTimeout,
    wait: { status: waitResponse.status, body: await waitResponse.json() },
    userAgent: navigator.userAgent,
  };
});
const { writeFile } = await import('node:fs/promises');
await writeFile(
  `${config.output}/browser.json`,
  JSON.stringify(result, null, 2) + '\n',
);
console.log(result);
