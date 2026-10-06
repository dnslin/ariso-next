const config = {
  distDir: process.env.IDENTITY_NEXT_DIST_DIR,
  typescript: { tsconfigPath: process.env.IDENTITY_NEXT_TSCONFIG },
  serverExternalPackages: ['better-sqlite3'],
  experimental: { externalDir: true },
};

export default config;
