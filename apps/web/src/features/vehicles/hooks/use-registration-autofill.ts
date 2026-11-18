'use client';

import { normalizePlateNumber, type VehicleRegistrationReading } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useEffect, useState } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

/** Ô của form xe nhận giá trị máy đọc từ cà vẹt (ADR 0102). */
export type RegistrationFilledField = 'plateNumber' | 'color';

/**
 * Lượt đọc cà vẹt MỚI ⇒ điền (đè) biển số + màu sơn vào form: cà vẹt là giấy tờ gốc của chính chiếc
 * xe, đúng hơn thứ chủ xe gõ trước đó. Ô máy không đọc được thì giữ nguyên.
 *
 * Đặt ở thành phần SỐNG SUỐT wizard (form gốc), không ở bước — bước unmount/mount lại khi chuyển
 * bước, chạy lại ở đó là đè mất chữ chủ xe vừa sửa sau khi mở khoá.
 */
export function useApplyRegistrationReading(
  reading: VehicleRegistrationReading | null | undefined,
  setValue: UseFormSetValue<VehicleFormValues>,
) {
  useEffect(() => {
    if (!reading) return;
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (reading.plateNumber) setValue('plateNumber', reading.plateNumber, opts);
    if (reading.color) setValue('color', reading.color, opts);
  }, [reading, setValue]);
}

/**
 * Ô biển số / màu đang KHOÁ theo cà vẹt: khoá khi ô đang mang đúng giá trị máy đọc (biển số so bỏ
 * dấu, hoa thường). Bút trong ô mở riêng ô đó; ảnh cà vẹt mới = lượt đọc mới ⇒ khoá lại.
 */
export function useRegistrationFieldLock(
  control: Control<VehicleFormValues>,
  field: RegistrationFilledField,
  reading: VehicleRegistrationReading | null | undefined,
) {
  const value = useWatch({ control, name: field });
  const [unlockedFor, setUnlockedFor] = useState<VehicleRegistrationReading | null>(null);
  const read = reading?.[field] ?? null;
  const same =
    read != null &&
    (field === 'plateNumber'
      ? normalizePlateNumber(value) === normalizePlateNumber(read)
      : (value ?? '').trim() === read);
  return {
    locked: same && unlockedFor !== reading,
    value: value ?? '',
    unlock: () => setUnlockedFor(reading ?? null),
  };
}
