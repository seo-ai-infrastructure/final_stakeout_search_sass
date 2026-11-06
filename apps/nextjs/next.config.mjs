export default {
  transpilePackages: ['@stakeout/db', '@stakeout/core'],
  experimental: { cpus: 2, authInterrupts: true },
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis', 'zipcodes'],
  // The agency offer is a static page kept in public/agency/.
  async rewrites() {
    return [{ source: '/agency', destination: '/agency/index.html' }];
  },
};
