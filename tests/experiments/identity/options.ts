import type { BetterAuthOptions } from 'better-auth';

// Protocol experiment only; never imported by the production application.
export const options = {
  basePath: '/api/auth',
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      ownerSlot: {
        type: 'number',
        required: true,
        defaultValue: 1,
        input: false,
        returned: false,
      },
    },
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    cookieCache: { enabled: false },
  },
  account: {
    accountLinking: { disableImplicitLinking: true },
    storeStateStrategy: 'database',
  },
  socialProviders: {
    github: {
      clientId: 'identity-protocol-experiment',
      clientSecret: 'not-a-real-provider-secret',
      disableSignUp: true,
    },
  },
  rateLimit: { enabled: true, storage: 'memory' },
  advanced: {
    cookiePrefix: 'ariso-identity-experiment',
    disableOriginCheck: false,
    disableCSRFCheck: false,
  },
} satisfies BetterAuthOptions;
