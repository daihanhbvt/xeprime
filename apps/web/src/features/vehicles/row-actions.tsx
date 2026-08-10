import type { RowAction } from '@/components/data-display/RowActions';
import type { VehicleListItem } from './types';

interface VehicleRowActionsInput {
  row: VehicleListItem;
  canEdit: boolean;
  canDelete: boolean;
  /** Id đang bị xoá — để nút "Xoá" của đúng xe đó báo loading. */
  deletingId: string | null;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onSchedule: (row: VehicleListItem) => void;
  onDelete: (id: string) => void;
}

/**
 * MỘT định nghĩa hành động cho cả **thẻ desktop** lẫn **hàng mobile**.
 *
 * Hai hình thái vẽ khác hẳn nhau nhưng phải có đúng bộ hành động, đúng quyền, đúng câu chữ xác
 * nhận. Để hai bản là mở đường cho quyền và câu chữ lệch nhau — thứ không ai phát hiện cho tới
 * khi một bên xoá được xe mà bên kia không.
 *
 * KHÔNG đọc quyền ở đây: trang truyền `canEdit`/`canDelete` xuống, và guard backend mới là lớp
 * chặn thật (CLAUDE.md §3).
 */
export function vehicleRowActions({
  row,
  canEdit,
  canDelete,
  deletingId,
  onView,
  onEdit,
  onSchedule,
  onDelete,
}: VehicleRowActionsInput): RowAction[] {
  /*
   * Bốn nút CÓ CHỮ và KHÔNG icon — Figma `186:1713`: mỗi `act-*` chỉ chứa một text node, rộng
   * 41–45px. Thêm icon làm hàng nút rộng ~250px trong thân thẻ 186px và cắt cụt nút cuối.
   */
  return [
    {
      key: 'view',
      label: 'Xem',
      showLabel: true,
      primary: true,
      onClick: () => onView(row.id),
    },
    {
      key: 'edit',
      label: 'Sửa',
      showLabel: true,
      hidden: !canEdit,
      onClick: () => onEdit(row.id),
    },
    {
      key: 'schedule',
      label: 'Lịch',
      showLabel: true,
      onClick: () => onSchedule(row),
    },
    {
      key: 'delete',
      label: 'Xoá',
      showLabel: true,
      danger: true,
      hidden: !canDelete,
      loading: deletingId === row.id,
      confirm: {
        title: `Xoá xe "${row.name}"?`,
        description: `${row.code}${row.plateNumber ? ` · ${row.plateNumber}` : ''} — xe sẽ bị ẩn khỏi danh sách. Không xoá được nếu còn lịch thuê.`,
        okText: 'Xoá',
        cancelText: 'Huỷ',
      },
      onClick: () => onDelete(row.id),
    },
  ];
}
