import { apiKey } from '@better-auth/api-key';

// SPEC-identity §9; protocol experiment only, not production integration.
export function uploadKeyPlugin() {
  return apiKey({
    references: 'user',
    requireName: true,
    storage: 'database',
    disableKeyHashing: false,
    startingCharactersConfig: { shouldStore: false },
    enableSessionForAPIKeys: false,
    keyExpiration: {
      defaultExpiresIn: null,
      disableCustomExpiresTime: false,
      minExpiresIn: 1 / 86400,
      maxExpiresIn: Number.POSITIVE_INFINITY,
    },
    rateLimit: { enabled: false },
    permissions: { defaultPermissions: { upload: ['create'] } },
  });
}
