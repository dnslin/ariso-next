import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD
  ) {
    const { startServer } = await import('./server/startup/server-start.ts');
    startServer();
  }
}
