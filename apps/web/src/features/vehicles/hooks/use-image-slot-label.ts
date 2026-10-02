'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { VEHICLE_IMAGE_TYPE_VALUES, type VehicleImageType } from '@xeprime/types';

/**
 * Nhãn NGẮN của vị trí ảnh — "Mặt trước", "Bên trái", "Nội thất"… (30/09/2026).
 *
 * Dùng ở chỗ chật: góc ảnh của slider thẻ đầu xe và dải ảnh nhỏ ở Hồ sơ 360. Nhãn đầy đủ ("Ảnh
 * mặt trước") vẫn là `Domain.vehicleImageType`, dùng ở màn tải ảnh và ở app native — không đổi.
 * Mã lạ (dữ liệu cũ) rơi về nhãn "Ảnh khác" thay vì in mã thô.
 */
export function useImageSlotLabel(): (type: string | null | undefined) => string {
  const t = useTranslations('Vehicles.imageSlot');
  return useCallback(
    (type) =>
      (VEHICLE_IMAGE_TYPE_VALUES as readonly string[]).includes(type ?? '')
        ? t(type as VehicleImageType)
        : t('other'),
    [t],
  );
}
