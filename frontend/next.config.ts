import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        source: '/widget-test.html',
        destination: '/',
        permanent: false,
      },
      {
        source: '/widget-test',
        destination: '/',
        permanent: false,
      },
      {
        source: '/admin/audit-logs',
        destination: '/admin',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
