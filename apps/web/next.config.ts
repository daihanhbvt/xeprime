import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Package trong workspace export thẳng TS (`main: ./src/index.ts`), Next phải tự transpile.
  transpilePackages: ['@xeprime/types', '@xeprime/ui', '@xeprime/validators'],

  // Next 16 bỏ tích hợp ESLint khỏi `next build`; lint chạy riêng qua `pnpm lint` (turbo).
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
