import { DATE_TIME_SEPARATOR, toAppTz } from '@xeprime/domain';

/**
 * Mốc nhận/trả của thẻ đơn Chi tiết khách: NGÀY trước, GIỜ sau (Figma "29/10 · 13:00"), nối bằng
 * `DATE_TIME_SEPARATOR` theo luật `ui-text-style` (không gõ tay dấu `·`). Múi giờ luôn của app.
 */
export function formatDayTime(iso: string): string {
  const at = toAppTz(iso);
  return `${at.format('DD/MM')}${DATE_TIME_SEPARATOR}${at.format('HH:mm')}`;
}
