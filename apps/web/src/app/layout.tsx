import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import '@/styles/tokens.css';
import '@/styles/globals.css';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
