import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  trailingSlash: true,
  // The PDF fonts are read from node_modules at runtime; make sure the standalone trace ships them.
  outputFileTracingIncludes: {
    '/cv-julio-flores-*.pdf': ['./node_modules/@fontsource/**/*.woff'],
    '/[[...slug]]': ['./node_modules/@fontsource/**/*.woff'],
  },
  // The panel is private: no indexing, no caching, no framing. These also cover the route handlers and the 404 of /admin.
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
