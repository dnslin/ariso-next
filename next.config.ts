import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  // Query validation must see the original URL before Next's object conversion.
  skipProxyUrlNormalize: true,
  async headers() {
    return ['/forgot-password', '/reset-password'].map((source) => ({
      source,
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }));
  },
};

export default nextConfig;
