import { cx } from '@/lib/cx';
import styles from './LineIcon.module.css';

/**
 * Bộ icon nét của design v2 (Figma "Icon / …", file `KEA8jXwtuLOY35KTdIqwD2`) — SVG gốc tải về
 * `public/icons/menu/`, mỗi file đặt sẵn trên đúng khung 20px (caret 16px) như trong thiết kế.
 *
 * Vẽ bằng `mask-image` chứ không phải `<img>`: file SVG xuất từ Figma mang màu cứng (`#717680`),
 * còn icon phải theo màu chữ của chỗ đặt nó — xám ở dòng thường, vàng ở mục đang chọn, sáng lên ở
 * giao diện tối. Mask lấy HÌNH từ file, màu từ `currentColor`.
 */
export const LINE_ICON = [
  'arrow-right',
  'bell',
  'calendar',
  'caret-up',
  'chevron-right',
  'globe',
  'heart',
  'logout',
  'message',
  'moon',
  'palette',
  'sun',
  'work',
] as const;

export type LineIconName = (typeof LINE_ICON)[number];

export function LineIcon({ name, className }: { name: LineIconName; className?: string }) {
  return <span className={cx(styles.icon, styles[name], className)} aria-hidden="true" />;
}
