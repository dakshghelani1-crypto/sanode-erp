import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: 'https://sanode-erp.onrender.com/v1/:path*'
      }
    ];
  }
};

export default nextConfig;
