import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { Providers } from './providers';
import '@/styles/tokens.css';
import '@/styles/globals.css';

/**
 * Be Vietnam Pro — font hình học thiết kế cho tiếng Việt, giống app cũ đang chạy.
 * next/font tự host (không gọi CDN), nên không vướng CSP và không nhấp nháy font.
 * Biến `--font-be-vietnam` được `tokens.css` dùng làm `--xp-font-family` (ADR 0003).
 */
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'XePrime — Thuê xe tự lái & có tài xế',
    template: '%s · XePrime',
  },
  description: 'Nền tảng cho thuê xe: tìm xe, đặt xe và quản lý gian hàng cho thuê.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Nền kem để thanh địa chỉ trình duyệt mobile hoà với brand.
  themeColor: '#fbf1dc',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
