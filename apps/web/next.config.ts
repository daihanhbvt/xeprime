import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Cho phép máy khác trong LAN mở dev server qua IP (Next 16 chặn origin ngoài localhost,
  // làm hỏng HMR websocket). Chỉ ảnh hưởng dev, không ảnh hưởng production build.
  allowedDevOrigins: ['192.168.1.210'],

  // KHÔNG cần `transpilePackages`: cả sáu package `@xeprime/*` đều emit CommonJS ra `dist/`
  // (`packages/config/tsconfig/lib.json`) nên Next tiêu thụ thẳng. Khoá này từng có vì
  // `types`/`ui`/`validators` export TS thô qua `main: ./src/index.ts`; `ui` là chỗ cuối cùng
  // còn như vậy và đã chuyển sang `dist` ngày 24/08/2026.

  // Next 16 bỏ tích hợp ESLint khỏi `next build`; lint chạy riêng qua `pnpm lint` (turbo).
  typescript: { ignoreBuildErrors: false },
};

/**
 * next-intl không dùng locale routing ở đây: URL cố ý KHÔNG mang ngôn ngữ (ADR 0012).
 * Plugin chỉ có một việc — trỏ next-intl vào file cấu hình request để `getTranslations`
 * trong Server Component tìm thấy locale/messages của request hiện tại.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
