import { createRequire } from 'node:module';

// Next 16.3.5 has no public application shutdown hook. Its production signal
// handler drains HTTP before close(), and close() drains after() callbacks.
// Install on the actual CommonJS constructor before standalone/server.js loads.
const require = createRequire(import.meta.url);
const NextNodeServer = require('next/dist/server/next-server.js')
  .default as typeof import('next/dist/server/next-server.js').default;
const close = NextNodeServer.prototype.close;
NextNodeServer.prototype.close = async function (...args) {
  try {
    await close.apply(this, args);
  } catch (err) {
    // Preserve the framework failure even if application cleanup also rejects.
    console.error('Next shutdown cleanup failed', err);
    throw err;
  } finally {
    const state = globalThis as typeof globalThis & {
      arisoServerRuntime?: { stop(): Promise<void> };
    };
    await state.arisoServerRuntime?.stop();
  }
};
