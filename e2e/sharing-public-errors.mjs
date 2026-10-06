export function unexpectedSharingErrors(errors, missingThumbnailUrl) {
  return errors.filter(
    (error) =>
      error.kind !== 'error' ||
      error.message !== `Resource failed: ${missingThumbnailUrl}`,
  );
}
