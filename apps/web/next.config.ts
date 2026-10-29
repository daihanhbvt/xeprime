import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Không quảng cáo framework/phiên bản qua `X-Powered-By: Next.js` — chỉ giúp người dò lỗ hổng.
  poweredByHeader: false,

  // Cho phép máy khác trong LAN mở dev server qua IP (Next 16 chặn origin ngoài localhost,
  // làm hỏng HMR websocket). Chỉ ảnh hưởng dev, không ảnh hưởng production build.
  allowedDevOrigins: ['192.168.1.210'],

  // KHÔNG cần `transpilePackages`: cả sáu package `@xeprime/*` đều emit CommonJS ra `dist/`
  // (`packages/config/tsconfig/lib.json`) nên Next tiêu thụ thẳng. Khoá này từng có vì
  // `types`/`ui`/`validators` export TS thô qua `main: ./src/index.ts`; `ui` là chỗ cuối cùng
  // còn như vậy và đã chuyển sang `dist` ngày 24/08/2026.

  // Next 16 bỏ tích hợp ESLint khỏi `next build`; lint chạy riêng qua `pnpm lint` (turbo).
  typescript: { ignoreBuildErrors: false },

  /*
   * Chống CLICKJACKING — không site lạ nào được nhúng trang XePrime vào iframe để lừa người dùng
   * bấm "Duyệt", "Rút tiền", "Xoá" qua một lớp phủ trong suốt (rà soát trước production 29/10/2026).
   *
   * `frame-ancestors` là chuẩn hiện hành; `X-Frame-Options` cho trình duyệt cũ. Cả hai cho phép
   * CÙNG ORIGIN chứ không `none`: ba site là ba origin khác nhau nên site khách vẫn không nhúng được
   * site quản trị, còn iframe `srcDoc` xem trước mẫu thông báo (`TemplatePreviewPane`) không bị chặn.
   * CSP ở đây CHỈ có `frame-ancestors` — không giới hạn script/style, nên không đụng tới AntD
   * CSS-in-JS. Đặt ở Next (không ở Caddy) để máy dev và mọi môi trường cùng một luật.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

/**
 * next-intl không dùng locale routing ở đây: URL cố ý KHÔNG mang ngôn ngữ (ADR 0012).
 * Plugin chỉ có một việc — trỏ next-intl vào file cấu hình request để `getTranslations`
 * trong Server Component tìm thấy locale/messages của request hiện tại.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
