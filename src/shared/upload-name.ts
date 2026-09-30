/** Shared Web/API normalization; paths never become part of an original name. */
export function normalizeUploadName(value: string) {
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value))
    throw new Error('文件名不能包含控制字符');
  const name = value.split(/[\\/]/u).at(-1) ?? '';
  if ([...name].length > 255) throw new Error('文件名不能超过 255 个字符');
  return name === '' || name === '.' || name === '..' ? 'image' : name;
}
