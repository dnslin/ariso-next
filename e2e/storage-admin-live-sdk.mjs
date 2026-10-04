import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import assert from 'node:assert/strict';

export async function inspectManagementNamespace(
  target,
  prefix,
  cleanup = false,
) {
  const client = new S3Client({
    endpoint: target.endpoint,
    region: target.region,
    forcePathStyle: target.forcePathStyle,
    credentials: target.credentials,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const keys = [];
  try {
    let token;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: target.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? [])
        if (object.Key) keys.push(object.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated)
        assert.ok(
          token,
          'Truncated namespace listing must provide its continuation token',
        );
    } while (token);
    if (cleanup)
      for (const key of keys)
        await client.send(
          new DeleteObjectCommand({ Bucket: target.bucket, Key: key }),
        );
    return keys;
  } finally {
    client.destroy();
  }
}
