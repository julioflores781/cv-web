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
};

export default nextConfig;
