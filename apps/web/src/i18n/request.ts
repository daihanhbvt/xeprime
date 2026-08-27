import { getRequestConfig } from 'next-intl/server';
import { APP_TIME_ZONE } from '@/lib/datetime';
import { formats } from './formats';
import { getServerLocale } from './locale';
import { loadMessages } from './messages';

/**
 * Cấu hình next-intl cho MỖI request — không có locale routing.
 *
 * Không dùng tham số `requestLocale` của next-intl vì tham số đó lấy locale từ ĐƯỜNG DẪN;
 * ở đây URL cố ý không mang ngôn ngữ (ADR 0012), nguồn duy nhất là cookie `XP_LOCALE`.
 *
 * Múi giờ luôn là `Asia/Ho_Chi_Minh` cho cả hai ngôn ngữ: đổi ngôn ngữ giao diện không được
 * làm một mốc giao xe nhảy sang giờ khác.
 */
export default getRequestConfig(async () => {
  const locale = await getServerLocale();

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: APP_TIME_ZONE,
    formats,
  };
});
