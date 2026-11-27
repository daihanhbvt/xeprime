import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { DATE_TIME_SEPARATOR, nowInAppTz, toAppTz } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Nhãn giờ TƯƠNG ĐỐI của một dòng danh sách (người dùng chốt 20/11/2026, chuông thông báo):
 * hôm nay "Vừa xong" / "3 phút trước" / "2 giờ"; hôm qua "Hôm qua 08h30"; cũ hơn "18/11 08h30".
 *
 * Tính lúc VẼ, theo múi giờ ứng dụng - mở lại màn là số mới. Dùng chung cho chuông thông báo và thẻ
 * yêu cầu hỗ trợ (Figma `24232:118279` "15 phút trước"), nên chữ nằm ở namespace `Notifications`.
 */
export function useRelativeTimeLabel(): (iso: string) => string {
  const t = useTranslations('Notifications');
  const fmt = useAppFormat();
  return useCallback(
    (iso: string) => {
      const at = toAppTz(iso);
      const now = nowInAppTz();
      if (at.isSame(now, 'day')) {
        const minutes = Math.max(0, now.diff(at, 'minute'));
        if (minutes < 1) return t('justNow');
        if (minutes < 60) return t('minutesAgo', { count: minutes });
        return t('hoursAgo', { count: now.diff(at, 'hour') });
      }
      const clock = t('clock', { hour: at.format('HH'), minute: at.format('mm') });
      if (at.isSame(now.subtract(1, 'day'), 'day')) return t('yesterdayAt', { time: clock });
      return `${fmt.dayMonth(iso)}${DATE_TIME_SEPARATOR}${clock}`;
    },
    [fmt, t],
  );
}
