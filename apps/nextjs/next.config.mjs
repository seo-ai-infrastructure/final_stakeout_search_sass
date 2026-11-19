export default {
  transpilePackages: ['@stakeout/db', '@stakeout/core'],
  experimental: { cpus: 2, authInterrupts: true },
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis', 'zipcodes'],
  // The agency offer is a static page kept in public/agency/.
  async rewrites() {
    return [
      { source: '/agency', destination: '/agency/index.html' },
      // How an AI app finds the sign-in for the MCP server (RFC 9728 and RFC 8414). Each is served at
      // the root and with the MCP server's path after it, since apps look in both places.
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/resource' },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/api/oauth/resource' },
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/server' },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/api/oauth/server' },
      { source: '/.well-known/openid-configuration', destination: '/api/oauth/server' },
    ];
  },
};
