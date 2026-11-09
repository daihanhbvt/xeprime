import { cx } from '@/lib/cx';
import styles from './LineIcon.module.css';

/**
 * Bộ icon nét của design v2 (Figma "Icon / …", file `KEA8jXwtuLOY35KTdIqwD2`; menu site partner từ
 * file Partner-XePrime `3ky32n5AZKViYsCfoVrEiZ`) - SVG gốc tải về `public/icons/menu/`, mỗi file
 * đặt sẵn trên đúng khung của nó trong thiết kế (20px; menu partner 24px; dấu +/− 12px; caret 16px),
 * nên chỉ cần đặt `font-size` bằng cỡ khung là ra đúng nét.
 *
 * Vẽ bằng `mask-image` chứ không phải `<img>`: file SVG xuất từ Figma mang màu cứng (`#717680`),
 * còn icon phải theo màu chữ của chỗ đặt nó - xám ở dòng thường, vàng ở mục đang chọn, sáng lên ở
 * giao diện tối. Mask lấy HÌNH từ file, màu từ `currentColor`.
 */
export const LINE_ICON = [
  'add-category',
  'arrow-right',
  'arrow-sm',
  'award',
  'bag',
  'bell',
  'calendar',
  'calendar-2',
  'calendar-sm',
  'calling',
  'car',
  'caret-up',
  'category',
  'chart',
  'chevron-down',
  'chevron-right',
  'chevron-sm',
  'close',
  'discovery',
  'doc-left',
  'doc-right',
  'dollar-circle',
  'dollar-square',
  'faq',
  'filter',
  'filter-4',
  'folder',
  'globe',
  'graph',
  'heart',
  'like',
  'location',
  'logout',
  'menu-list',
  'message',
  'message-sm',
  'minus',
  'moon',
  'notification',
  'palette',
  'password',
  'plus',
  'profile',
  'rotate-right',
  'search',
  'setting',
  'shield-star',
  'sun',
  'tick',
  'time-circle',
  'users',
  'users-2',
  'wallet',
  'work',
] as const;

export type LineIconName = (typeof LINE_ICON)[number];

export function LineIcon({ name, className }: { name: LineIconName; className?: string }) {
  return <span className={cx(styles.icon, styles[name], className)} aria-hidden="true" />;
}
