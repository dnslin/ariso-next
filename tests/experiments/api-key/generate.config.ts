import { betterAuth } from 'better-auth';
import { options } from '../identity/options.ts';
import { uploadKeyPlugin } from './options.ts';

export const auth = betterAuth({
  ...options,
  baseURL: 'http://localhost:3000',
  secret: 'schema-generation-only-not-a-runtime-secret',
  plugins: [uploadKeyPlugin()],
});
