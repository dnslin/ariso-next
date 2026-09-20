import { betterAuth } from 'better-auth';
import { options } from './options.ts';

export const auth = betterAuth({
  ...options,
  baseURL: 'http://localhost:3000',
  secret: 'schema-generation-only-not-a-runtime-secret',
});
