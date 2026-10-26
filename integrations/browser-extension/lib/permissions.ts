/** Chrome host match patterns do not contain ports; HTTP targets still do. */
export function originPattern(value: string) {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}/*`;
}
