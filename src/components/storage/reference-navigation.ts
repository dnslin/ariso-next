export function storageReferenceReturn(value: string | null) {
  return value && /^\/settings\/storage\/[^/?#]+\?view=references$/.test(value)
    ? value
    : null;
}

export function storageReferenceDestination(
  storageId: string,
  trash: boolean,
  imageId?: string,
) {
  const params = new URLSearchParams({
    storageId,
    storageReturn: `/settings/storage/${encodeURIComponent(storageId)}?view=references`,
  });
  if (imageId) params.set('image', imageId);
  return `${trash ? '/trash' : '/library'}?${params}`;
}
