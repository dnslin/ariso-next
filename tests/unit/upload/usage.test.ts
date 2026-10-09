import { expect, it } from 'vitest';
import { buildUploadCurl } from '../../../src/shared/upload-usage.ts';

it('uses the current site origin and leaves the caller token outside the command', () => {
  const command = buildUploadCurl('https://images.example:8443', 'minimal');
  expect(command).toContain("'https://images.example:8443/api/upload'");
  expect(command).toContain('${ARISO_UPLOAD_TOKEN}');
  expect(command).toContain("--form 'file=@./photo.jpg'");
  expect(command).not.toContain('storageId');
});

it('emits literal repeated multipart fields rather than comma or bracket aliases', () => {
  const command = buildUploadCurl('https://images.example', 'full');
  expect(command.match(/--form 'albumId=/g)).toHaveLength(2);
  expect(command.match(/--form 'tag=/g)).toHaveLength(2);
  expect(command).toContain("--form 'visibility=private'");
  expect(command).not.toContain('albumId[]');
});

it('quotes file paths and IDs without shell expansion or quote injection', () => {
  const command = buildUploadCurl('https://images.example', 'full', {
    file: "./$(touch unsafe)'photo.jpg",
    storageId: "a'b",
    albumIds: ['$(secret)', 'x`y'],
  });
  expect(command).toContain("'storageId=a'\\''b'");
  expect(command).toContain("'albumId=$(secret)'");
  expect(command).toContain("'file=@./$(touch unsafe)'\\''photo.jpg'");
});

it('provides reproducible missing-auth and invalid-field examples', () => {
  expect(
    buildUploadCurl('https://images.example', 'unauthorized'),
  ).not.toContain('Authorization');
  expect(buildUploadCurl('https://images.example', 'invalid')).toContain(
    "--form 'visibility=invalid'",
  );
});
