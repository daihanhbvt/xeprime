'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { RowAction } from '@/components/data-display/RowActions';
import type { VehicleListItem } from '../types';

interface VehicleRowActionsInput {
  row: VehicleListItem;
  canEdit: boolean;
  /**
   * `true` = nhãn rút gọn ("Xem" thay vì "Chi tiết") cho hàng mobile — các nút đầy đủ chữ không
   * vừa 232px nội dung của hàng 390px.
   */
  compact?: boolean;
  /**
   * Nhãn của nút sửa. Gian hàng: "Chỉnh sửa" (trang sửa xe). Chủ xe tuyến hoa hồng: "Quản lý xe" —
   * không gian riêng của xe có menu trái theo dịch vụ, cũng là chỗ họ sửa xe.
   */
  editKind?: 'edit' | 'manage';
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onSchedule: (row: VehicleListItem) => void;
}

/**
 * MỘT định nghĩa hành động cho mọi hình thái thẻ xe (lưới, ít xe, danh sách, hàng mobile) ở cả hai
 * tuyến. Hình thái vẽ khác nhau nhưng phải có đúng bộ hành động, đúng quyền, đúng câu chữ.
 *
 * Thứ tự theo design 03/11/2026: **Lịch · Chỉnh sửa · Chi tiết** — nút chính (vàng) đứng CUỐI.
 *
 * KHÔNG có "Xoá" ở danh sách: xoá là hành động phá huỷ, chỉ nằm trong menu ⋮ của Hồ sơ xe — nơi
 * có đủ ngữ cảnh và câu xác nhận đầy đủ. KHÔNG đọc quyền ở đây: trang truyền `canEdit` xuống, và
 * guard backend mới là lớp chặn thật (CLAUDE.md §3).
 */
export function useVehicleRowActions(): (input: VehicleRowActionsInput) => RowAction[] {
  const t = useTranslations('Vehicles.list.actions');

  return useCallback(
    ({
      row,
      canEdit,
      compact = false,
      editKind = 'edit',
      onView,
      onEdit,
      onSchedule,
    }: VehicleRowActionsInput) => [
      {
        key: 'schedule',
        label: t('schedule'),
        showLabel: true,
        onClick: () => onSchedule(row),
      },
      {
        key: 'edit',
        label: editKind === 'manage' ? t('manage') : t('editFull'),
        showLabel: true,
        hidden: !canEdit,
        onClick: () => onEdit(row.id),
      },
      {
        key: 'view',
        label: compact ? t('viewShort') : t('detail'),
        showLabel: true,
        primary: true,
        onClick: () => onView(row.id),
      },
    ],
    [t],
  );
}
