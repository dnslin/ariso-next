import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  // Query validation must see the original URL before Next's object conversion.
  skipProxyUrlNormalize: true,
};

export default nextConfig;
