/**
 * Nhãn hiển thị của một trạng thái.
 *
 * CLAUDE.md mục 5 cấm hard code text nghiệp vụ trong component. `StatusTag` đọc từ các
 * bảng `*_STATUS_META`, nên đổi nhãn chỉ sửa một chỗ.
 *
 * `color` là preset color của Ant Design Tag, không phải mã hex — giữ nhất quán với
 * design token thay vì tự chế màu (ADR 0003).
 */
export type StatusColor =
  | 'default'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'gold'
  | 'orange'
  | 'red'
  | 'purple'
  | 'magenta';

export interface StatusMeta {
  /** Nhãn tiếng Việt hiển thị cho người dùng. */
  readonly label: string;
  /** Ant Design Tag preset color. */
  readonly color: StatusColor;
}
