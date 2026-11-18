'use client';

import type { VehicleDataSpecField } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';

import { useBrandVehicleDataOptions } from '@/features/vehicle-data/hooks';
import type { VehicleDataOption } from '@/features/vehicle-data/types';

/**
 * Xe chuẩn đang chọn ở ô "Mẫu xe" gộp (ADR 0102) — đọc lại ĐÚNG query của ô chọn (cùng loại xe,
 * hãng, xe chuẩn đang gắn ⇒ cùng cache), nên mọi ô thông số cùng nhìn một bản dữ liệu.
 */
export function useSelectedVehicleData(
  control: Control<VehicleFormValues>,
  vehicleType: string,
): VehicleDataOption | null {
  const brand = useWatch({ control, name: 'brand' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const { options } = useBrandVehicleDataOptions({
    vehicleType,
    brandKey: brand,
    includeId: variantId,
  });
  return (variantId && options.find((o) => o.id === variantId)) || null;
}

/** Giá trị của xe chuẩn cho một ô thông số — `null` khi xe chuẩn chưa khai ô đó. */
export function vehicleDataSpecValue(
  record: VehicleDataOption,
  field: VehicleDataSpecField,
): string | number | null {
  const value = record[field] as string | number | null | undefined;
  return value == null || value === '' ? null : value;
}

/** Ô form còn mang ĐÚNG giá trị xe chuẩn này khai (tự điền, chủ xe chưa sửa) hay không. */
export function matchesVehicleDataSpec(
  formValue: unknown,
  record: VehicleDataOption,
  field: VehicleDataSpecField,
): boolean {
  return sameSpec(formValue, vehicleDataSpecValue(record, field));
}

/** So giá trị form với xe chuẩn — số thập phân của API là chuỗi ("5.70"), form giữ số. */
function sameSpec(formValue: unknown, recordValue: string | number | null): boolean {
  if (recordValue == null || formValue == null || formValue === '') return false;
  if (typeof recordValue === 'number' || typeof formValue === 'number') {
    return Number(formValue) === Number(recordValue);
  }
  return String(formValue) === String(recordValue);
}

export interface SpecLock {
  /** Ô đang khoá — form hiện giá trị theo dữ liệu mẫu xe, chủ xe bấm bút để sửa. */
  locked: boolean;
  /** Khoá vì khớp xe chuẩn đang chọn (không phải chỉ vì dòng xe một cấu hình) — chọn câu gợi ý. */
  fromData: boolean;
  unlock: () => void;
}

/**
 * Khoá MỘT ô thông số theo dữ liệu mẫu xe (ADR 0102): khoá khi xe chuẩn đang chọn có giá trị cho ô
 * VÀ ô đang mang đúng giá trị đó — hoặc khi nơi gọi báo khoá theo dòng xe (`modelLocked`: dòng chỉ
 * có một cấu hình, `catalogSpecRule`). Chỉ khoá khi KHỚP: xe cũ lưu lệch dữ liệu không bị khoá
 * vào một giá trị nó không mang.
 *
 * Bấm bút ⇒ mở riêng ô đó cho tới khi đổi mẫu xe; khoá là trạng thái giao diện, không phải luật
 * server — chủ xe vẫn là người khai chiếc xe của mình.
 */
export function useCatalogSpecLock(
  control: Control<VehicleFormValues>,
  vehicleType: string,
  field: VehicleDataSpecField,
  options: { modelLocked?: boolean } = {},
): SpecLock {
  const record = useSelectedVehicleData(control, vehicleType);
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const value = useWatch({ control, name: field });
  const scope = `${modelId ?? ''}|${record?.id ?? ''}`;
  const [unlockedScope, setUnlockedScope] = useState<string | null>(null);

  const fromData = record != null && sameSpec(value, vehicleDataSpecValue(record, field));
  const locked = unlockedScope !== scope && (fromData || Boolean(options.modelLocked));
  return {
    locked,
    fromData: locked && fromData,
    unlock: () => setUnlockedScope(scope),
  };
}
