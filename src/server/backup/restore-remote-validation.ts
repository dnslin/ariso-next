import { z } from 'zod';
import { storageCreateInputSchema } from '../storage/validation.ts';

const fields = storageCreateInputSchema.options[1].shape;
export const restoreRemoteTargetInputSchema = z.strictObject({
  endpoint: fields.endpoint,
  region: fields.region,
  bucket: fields.bucket,
  pathPrefix: fields.pathPrefix,
  forcePathStyle: fields.forcePathStyle,
  accessKey: fields.accessKey.unwrap().unwrap().optional(),
  secretKey: fields.secretKey.unwrap().unwrap().optional(),
});
export const restoreRemoteTestInputSchema = z.strictObject({
  revision: z.number().int().positive(),
  wholeBucketHasNoLockRules: z.boolean().optional(),
});
