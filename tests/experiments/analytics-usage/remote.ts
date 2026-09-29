import assert from 'node:assert/strict';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';

/** Enumerate only this experiment's fresh namespace; never the whole bucket. */
export async function listSampleObjects(
  client: S3Client,
  bucket: string,
  prefix: string,
) {
  const objects: { key: string; bytes: number | null }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 2,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? []) {
      assert.ok(object.Key);
      assert.ok(
        object.Key.startsWith(prefix),
        'Object outside experiment prefix',
      );
      objects.push({ key: object.Key, bytes: object.Size ?? null });
    }
    token = page.NextContinuationToken;
    assert.ok(
      !page.IsTruncated || token,
      'Truncated listing has no continuation token',
    );
  } while (token);
  return objects;
}

export async function inspectSampleObject(
  client: S3Client,
  bucket: string,
  key: string,
) {
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      exists: true,
      bytes: result.ContentLength ?? null,
      requestId: result.$metadata.requestId,
    };
  } catch (error) {
    if (
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    )
      return { exists: false, bytes: null };
    throw error;
  }
}

export async function deleteSampleObject(
  client: S3Client,
  bucket: string,
  key: string,
) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  const result = await inspectSampleObject(client, bucket, key);
  assert.equal(result.exists, false, `Object remains after deletion: ${key}`);
  return result;
}
