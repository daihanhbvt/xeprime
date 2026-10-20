import type { Metadata, Viewport } from 'next';
import { Google_Sans_Flex } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { getServerLocale } from '@/i18n/locale';
import { getServerNavPreferences } from '@/lib/ui-preferences.server';
import { XP_TOKENS } from '@/styles/theme';
import { ZONE, zoneForHost } from '@/zones';
import { getServerTheme } from '@/lib/theme.server';
import { Providers } from './providers';
import '@xeprime/ui/styles.css';
import '@/styles/globals.css';

/**
 * Google Sans Flex — họ chữ DUY NHẤT của design v2 (biến Figma `font-googlesan`, ADR 0062).
 * next/font tự host (không gọi CDN), nên không vướng CSP và không nhấp nháy font.
 * Biến `--font-google-sans` được `tokens.css` dùng làm `--xp-font-family` (ADR 0003).
 *
 * Không khai `weight` ⇒ tải bản VARIABLE: một file phủ cả 400/500/600/700 mà thang chữ v2 dùng.
 * Chỉ trục `wght` — các trục khác (opsz, wdth…) làm file nặng thêm mà design không đổi tới.
 *
 * Subset `vietnamese` giữ nguyên cho cả hai ngôn ngữ: font là một, chỉ nội dung đổi — tải hai
 * bộ font theo ngôn ngữ là đổi layout lấy vài KB.
 */
const googleSans = Google_Sans_Flex({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-google-sans',
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
 * **Đừng chuyển cờ này xuống từng route group để "cứu vài trang tĩnh" — không có trang nào được
 * cứu.** Chính layout gốc gọi `getServerLocale()`, tức `cookies()`, nên Next bỏ prerender ngay
 * tại đây cho MỌI route bên dưới; cờ ở gốc chỉ nói thành lời điều vốn đã đúng. (Và cũng không có
 * trang nào thật sự tĩnh để cứu: mọi trang công khai hoặc đọc dữ liệu, hoặc là màn cá nhân.)
 *
 * Vậy đòn bẩy hiệu năng duy nhất còn lại là cache DỮ LIỆU — và nó KHÔNG bị `force-dynamic` ảnh
 * hưởng: mỗi lời gọi `fetch` phía server khai `cache: 'force-cache'` + `next.revalidate` tường
 * minh nên vẫn cache theo URL, dùng chung cho cả hai ngôn ngữ. Các mốc thời gian gom ở
 * `@/constants/cache`; phía API có `Cache-Control` khớp cặp (`common/http-cache.ts`).
 *
 * Nếu sau này đặt CDN trước web: `XP_LOCALE` PHẢI nằm trong cache key của HTML.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Nền gold nhạt nhất để thanh địa chỉ trình duyệt mobile hoà với brand — đi theo token, không
  // gõ mã màu (bản gõ tay `#fbf1dc` cũ đã lệch khỏi bảng màu v2).
  themeColor: XP_TOKENS['color-primary-subtle'],
};

/**
 * `lang` của `<html>` lấy từ cookie `XP_LOCALE` đọc PHÍA SERVER — HTML đầu tiên đã đúng ngôn
 * ngữ, không có pha "hiện tiếng Việt rồi nhảy sang tiếng Anh" sau hydrate.
 *
 * `NextIntlClientProvider` ở đây là Server Component: nó tự lấy locale/messages/timeZone/formats
 * từ `i18n/request.ts`, nên chỉ bó message của MỘT ngôn ngữ đi xuống client.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, navPreferences, requestHeaders, theme] = await Promise.all([
    getServerLocale(),
    getServerNavPreferences(),
    headers(),
    getServerTheme(),
  ]);
  // Khu theo HOST (chế độ `host`): mỗi site một cache dữ liệu riêng — xem `useZoneQueryClient`.
  const hostZone = zoneForHost(requestHeaders.get('host')) ?? ZONE.MARKET;

  return (
    <html lang={locale} className={googleSans.variable} data-theme={theme}>
      <body>
        <NextIntlClientProvider>
          <Providers navPreferences={navPreferences} hostZone={hostZone} initialTheme={theme}>
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
