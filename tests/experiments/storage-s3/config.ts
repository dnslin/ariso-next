import { z } from 'zod';

export const services = ['aws', 'r2', 'minio'] as const;
export type Service = (typeof services)[number];
export const configSchema = z
  .object({
    service: z.enum(services),
    endpoint: z.url().refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      );
    }, 'Use the S3 API origin, without credentials, path, query or fragment'),
    region: z.string().min(1),
    bucket: z.string().min(1),
    forcePathStyle: z.boolean(),
    credentials: z.object({
      accessKeyId: z.string().min(1),
      secretAccessKey: z.string().min(1),
      sessionToken: z.string().min(1).optional(),
    }),
    serviceVersion: z.string().min(1),
    revision: z.string().min(1),
    ownerConfirmation: z.object({
      revision: z.string().min(1),
      privateBucketAndNoPublicAliases: z.literal(true),
      wholeBucketHasNoLockRules: z.literal(true).optional(),
      evidence: z.string().min(1),
    }),
  })
  .superRefine((config, context) => {
    if (config.revision !== config.ownerConfirmation.revision)
      context.addIssue({
        code: 'custom',
        message: 'Owner confirmation must refer to this configuration revision',
      });
    if (config.service === 'r2') {
      const url = new URL(config.endpoint);
      if (
        url.protocol !== 'https:' ||
        url.port ||
        !/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(
          url.hostname,
        )
      )
        context.addIssue({
          code: 'custom',
          message: 'R2 capability exception requires its official S3 endpoint',
        });
      if (!config.ownerConfirmation.wholeBucketHasNoLockRules)
        context.addIssue({
          code: 'custom',
          message:
            'Confirm the entire R2 bucket has no lock rules, not only the probe prefix',
        });
    }
  });
export type StorageConfig = z.infer<typeof configSchema>;
