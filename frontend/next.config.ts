import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/worker-api/:path*',
        destination: 'http://127.0.0.1:9060/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
