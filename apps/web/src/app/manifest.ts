import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';
import { APP_NAME } from '@/constants/app-name';

/**
 * Web app manifest — thứ Android/Chrome đọc khi người dùng "Thêm vào màn hình chính".
 *
 * Icon trỏ vào `public/brand/` chứ không phải `src/app/icon.png`: file convention của Next gắn
 * hash vào URL mỗi lần build, còn manifest cần đường dẫn ổn định để icon đã cài trên máy người
 * dùng không chết sau lần deploy sau.
 *
 * Màu nền/thanh công cụ phải khớp `viewport.themeColor` ở `layout.tsx` — lệch nhau là một
 * đường viền lạ xuất hiện lúc mở app.
 */
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations('Common.meta');

  return {
    name: t('defaultTitle'),
    short_name: APP_NAME,
    description: t('defaultDescription'),
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf1dc',
    theme_color: '#fbf1dc',
    icons: [
      { src: '/brand/xeprime-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/xeprime-mark.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
