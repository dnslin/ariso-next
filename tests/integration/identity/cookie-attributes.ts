export function hasSecureAttribute(setCookie: string) {
  return setCookie
    .split(';')
    .slice(1)
    .some((attribute) => attribute.trim().toLowerCase() === 'secure');
}
