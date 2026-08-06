import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Cho phép máy khác trong LAN mở dev server qua IP (Next 16 chặn origin ngoài localhost,
  // làm hỏng HMR websocket). Chỉ ảnh hưởng dev, không ảnh hưởng production build.
  allowedDevOrigins: ['192.168.1.210'],

  // Package trong workspace export thẳng TS (`main: ./src/index.ts`), Next phải tự transpile.
  transpilePackages: ['@xeprime/types', '@xeprime/ui', '@xeprime/validators'],

  // Next 16 bỏ tích hợp ESLint khỏi `next build`; lint chạy riêng qua `pnpm lint` (turbo).
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
