import { Tag } from 'antd';
import { STATUS_COLOR, type StatusMeta } from '@xeprime/types';

/**
 * Hiển thị một trạng thái nghiệp vụ.
 *
 * Component KHÔNG biết bất kỳ status cụ thể nào — nó nhận bảng meta từ @xeprime/types.
 * Nhờ vậy thêm status mới chỉ phải sửa một chỗ (ADR 0005), và CLAUDE.md mục 5 (cấm hard
 * code status trong component) được giữ về mặt cấu trúc chứ không chỉ bằng kỷ luật.
 *
 *   <StatusTag value={booking.status} meta={BOOKING_STATUS_META} />
 */
export function StatusTag<TStatus extends string>({
  value,
  meta,
  fallbackLabel,
}: {
  value: TStatus | null | undefined;
  meta: Readonly<Record<TStatus, StatusMeta>>;
  fallbackLabel?: string;
}) {
  if (!value) return <Tag color={STATUS_COLOR.NEUTRAL}>{fallbackLabel ?? '—'}</Tag>;

  const entry = meta[value];

  // Status có trong DB nhưng chưa khai báo meta: hiện giá trị thô thay vì rỗng, để lỗi
  // nhìn thấy được ngay thay vì biến thành ô trống khó truy.
  if (!entry) return <Tag color={STATUS_COLOR.NEUTRAL}>{value}</Tag>;

  return <Tag color={entry.color}>{entry.label}</Tag>;
}
