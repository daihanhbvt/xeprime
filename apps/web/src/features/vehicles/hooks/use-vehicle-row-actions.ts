'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { RowAction } from '@/components/data-display/RowActions';
import type { VehicleListItem } from '../types';

interface VehicleRowActionsInput {
  row: VehicleListItem;
  canEdit: boolean;
  /**
   * `true` = nhãn rút gọn ("Xem" thay vì "Xem chi tiết") cho hàng mobile — các nút đầy đủ chữ
   * không vừa 232px nội dung của hàng 390px. Thẻ desktop dùng nhãn đầy đủ (Figma `236:1820`).
   */
  compact?: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onSchedule: (row: VehicleListItem) => void;
}

/**
 * MỘT định nghĩa hành động cho cả **thẻ desktop** lẫn **hàng mobile**.
 *
 * Hai hình thái vẽ khác hẳn nhau nhưng phải có đúng bộ hành động, đúng quyền, đúng câu chữ.
 * Để hai bản là mở đường cho quyền và nhãn lệch nhau giữa hai bề mặt.
 *
 * KHÔNG có "Xoá" ở danh sách (bản chỉnh Figma 11/08/2026): xoá là hành động phá huỷ, chỉ nằm
 * trong menu ⋮ của Hồ sơ 360 (`Vehicle360Overview`) — nơi có đủ ngữ cảnh và câu xác nhận đầy đủ.
 *
 * KHÔNG đọc quyền ở đây: trang truyền `canEdit` xuống, và guard backend mới là lớp chặn thật
 * (CLAUDE.md §3).
 *
 * Là HOOK vì nhãn nút phải theo ngôn ngữ người xem; phần quyết định hành động/quyền vẫn thuần.
 */
export function useVehicleRowActions(): (input: VehicleRowActionsInput) => RowAction[] {
  const t = useTranslations('Vehicles.list.actions');

  return useCallback(
    ({ row, canEdit, compact = false, onView, onEdit, onSchedule }: VehicleRowActionsInput) => {
      /*
       * Nút CÓ CHỮ và KHÔNG icon — Figma `236:1819`: mỗi `act-*` chỉ chứa một text node.
       * Thêm icon làm hàng nút tràn bề rộng thẻ và cắt cụt nút cuối (đo được ở Wave 3B-R1).
       */
      return [
        {
          key: 'view',
          label: compact ? t('viewShort') : t('view'),
          showLabel: true,
          primary: true,
          onClick: () => onView(row.id),
        },
        {
          key: 'edit',
          label: t('edit'),
          showLabel: true,
          hidden: !canEdit,
          onClick: () => onEdit(row.id),
        },
        {
          key: 'schedule',
          label: t('schedule'),
          showLabel: true,
          onClick: () => onSchedule(row),
        },
      ];
    },
    [t],
  );
}
