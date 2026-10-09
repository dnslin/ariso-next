export type UploadCurlExample = 'minimal' | 'full' | 'unauthorized' | 'invalid';

/** Single quotes keep configured URLs and caller-supplied IDs literal in a shell. */
function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildUploadCurl(
  publicUrl: string,
  example: UploadCurlExample,
  values: { file?: string; storageId?: string; albumIds?: string[] } = {},
) {
  const endpoint = new URL('/api/upload', publicUrl).href;
  const lines = [`curl --request POST ${shellQuote(endpoint)}`];
  if (example !== 'unauthorized')
    lines.push('  --header "Authorization: Bearer ${ARISO_UPLOAD_TOKEN}"');
  if (example === 'full') {
    lines.push(
      `  --form ${shellQuote(`storageId=${values.storageId ?? 'storage-id'}`)}`,
    );
    for (const id of values.albumIds ?? ['album-id-1', 'album-id-2'])
      lines.push(`  --form ${shellQuote(`albumId=${id}`)}`);
    lines.push(
      "  --form 'tag=Go'",
      "  --form 'tag=旅行'",
      "  --form 'visibility=private'",
    );
  }
  if (example === 'invalid') lines.push("  --form 'visibility=invalid'");
  lines.push(`  --form ${shellQuote(`file=@${values.file ?? './photo.jpg'}`)}`);
  return lines.join(' \\\n');
}
