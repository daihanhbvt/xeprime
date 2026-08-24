import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Playfair_Display } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { getServerLocale } from '@/i18n/locale';
import { getServerNavPreferences } from '@/lib/ui-preferences.server';
import { Providers } from './providers';
import '@xeprime/ui/styles.css';
import '@/styles/globals.css';

/**
 * Be Vietnam Pro — font hình học thiết kế cho tiếng Việt, giống app cũ đang chạy.
 * next/font tự host (không gọi CDN), nên không vướng CSP và không nhấp nháy font.
 * Biến `--font-be-vietnam` được `tokens.css` dùng làm `--xp-font-family` (ADR 0003).
 *
 * Subset `vietnamese` giữ nguyên cho cả hai ngôn ngữ: font là một, chỉ nội dung đổi — tải hai
 * bộ font theo ngôn ngữ là đổi layout lấy vài KB.
 */
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

/** Playfair Display — chỉ dùng cho nhấn nghiêng ở hero marketplace (giống xeprime.vn). */
const playfair = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600'],
  style: ['italic', 'normal'],
  variable: '--font-playfair',
  display: 'swap',
});

/**
 * Tiêu đề/mô tả mặc định theo ngôn ngữ của request.
 *
 * Bot không mang cookie ⇒ luôn nhận bản tiếng Việt, nên phần được index không đổi (ADR 0012).
 * Người đang xem giao diện tiếng Anh thì tab trình duyệt cũng tiếng Anh — không còn tiêu đề
 * một đằng nội dung một nẻo.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Common.meta');

  return {
    title: {
      default: t('defaultTitle'),
      template: t('titleTemplate'),
    },
    description: t('defaultDescription'),
  };
}

/**
 * Mọi route render theo request. Đây là KHAI BÁO của một sự thật, không phải một tinh chỉnh:
 * HTML phụ thuộc cookie `XP_LOCALE` (ADR 0012), nên không có bản tĩnh nào phục vụ được cả hai
 * ngôn ngữ. Để Next dựng "vỏ tĩnh" cho những route này là tạo ra đúng thứ ADR 0012 cấm — một
 * khung HTML đóng băng ở một ngôn ngữ.
 *
 * Cache DỮ LIỆU không bị ảnh hưởng và vẫn dùng chung giữa hai ngôn ngữ: `fetchBannersServer`
 * và catalog khai `cache: 'force-cache'` + `next.revalidate` tường minh, nên chúng vẫn được
 * cache theo URL bất kể route là dynamic.
 *
 * Nếu sau này đặt CDN trước web: `XP_LOCALE` PHẢI nằm trong cache key của HTML.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Nền kem để thanh địa chỉ trình duyệt mobile hoà với brand.
  themeColor: '#fbf1dc',
};

/**
 * `lang` của `<html>` lấy từ cookie `XP_LOCALE` đọc PHÍA SERVER — HTML đầu tiên đã đúng ngôn
 * ngữ, không có pha "hiện tiếng Việt rồi nhảy sang tiếng Anh" sau hydrate.
 *
 * `NextIntlClientProvider` ở đây là Server Component: nó tự lấy locale/messages/timeZone/formats
 * từ `i18n/request.ts`, nên chỉ bó message của MỘT ngôn ngữ đi xuống client.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, navPreferences] = await Promise.all([
    getServerLocale(),
    getServerNavPreferences(),
  ]);

  return (
    <html lang={locale} className={`${beVietnam.variable} ${playfair.variable}`}>
      <body>
        <NextIntlClientProvider>
          <Providers navPreferences={navPreferences}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
