/**
 * Bảng màu NGỮ NGHĨA dùng chung cho mọi trạng thái nghiệp vụ.
 *
 * Các bảng `*_STATUS_META` chọn vai trò theo ý nghĩa, không tự gõ preset Ant Design. Nhờ vậy cùng một
 * trạng thái ở danh sách, chi tiết, dashboard và lịch luôn ra cùng màu; đổi hệ màu cũng chỉ sửa tại đây.
 */
export const STATUS_COLOR = {
  NEUTRAL: 'default',
  INFO: 'blue',
  PROCESSING: 'cyan',
  SUCCESS: 'green',
  WAITING: 'gold',
  WARNING: 'orange',
  DANGER: 'red',
  SPECIAL: 'purple',
  ACCENT: 'magenta',
} as const;

export type StatusColor = (typeof STATUS_COLOR)[keyof typeof STATUS_COLOR];

export interface StatusMeta {
  /** Nhãn tiếng Việt hiển thị cho người dùng. */
  readonly label: string;
  /** Ant Design Tag preset color. */
  readonly color: StatusColor;
}
