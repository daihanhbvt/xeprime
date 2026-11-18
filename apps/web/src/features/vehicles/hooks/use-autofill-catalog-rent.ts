'use client';

import { useEffect, useRef } from 'react';
import { useWatch, type Control, type UseFormGetValues, type UseFormSetValue } from 'react-hook-form';
import type { VehicleFormValues } from '@xeprime/validators';

import { useVehicleCatalogSuggestion } from '../components/CatalogSuggestions';

/** Ô giá nhận giá tham khảo của Dữ liệu xe - tự lái, có tài xế và dài hạn. */
const RENT_FIELDS = [
  'weekdayPrice',
  'weekendPrice',
  'hourlyPrice',
  'withDriverDailyPrice',
  'monthlyPrice',
] as const;
type RentField = (typeof RENT_FIELDS)[number];

/**
 * Wizard THÊM xe: chọn mẫu xe ⇒ TỰ ĐIỀN giá tham khảo XePrime vào các ô giá thuê + giá trị xe (người dùng chốt
 * 18/11/2026 - ghi đè cách "chỉ gợi ý, bấm mới điền" của ADR 0090 cho riêng giá thuê ở màn thêm xe).
 *
 * Chỉ điền ô còn TRỐNG, hoặc ô vẫn đang mang đúng số máy vừa điền lần trước (đổi mẫu xe ⇒ giá theo
 * mẫu mới). Ô chủ xe đã tự gõ thì không bao giờ bị đè. Đặt ở form gốc (sống suốt wizard) để chạy cả
 * khi bước giá chưa mở. Giá trị xe (bảo hiểm) cũng tự điền theo cùng luật.
 */
export function useAutofillCatalogRent(
  control: Control<VehicleFormValues>,
  getValues: UseFormGetValues<VehicleFormValues>,
  setValue: UseFormSetValue<VehicleFormValues>,
) {
  const suggestion = useVehicleCatalogSuggestion({
    modelId: useWatch({ control, name: 'vehicleCatalogModelId' }),
    variantId: useWatch({ control, name: 'vehicleCatalogVariantId' }),
    year: useWatch({ control, name: 'manufactureYear' }),
  });
  /** Số máy đã điền ở mỗi ô - để nhận ra ô chủ xe chưa đụng tới. */
  const filled = useRef<Partial<Record<RentField | 'insuredValue', number>>>({});

  useEffect(() => {
    if (!suggestion) return;
    // Giá trị xe tham khảo (giá xe mới × khấu hao theo tuổi) - cùng luật "chỉ điền ô chưa đụng".
    const amount = suggestion.value ? Number(suggestion.value.amount) : NaN;
    if (Number.isFinite(amount) && amount > 0) {
      const current = getValues('insuredValue');
      const untouched = current == null || current === filled.current.insuredValue;
      if (untouched && current !== amount) {
        setValue('insuredValue', amount, { shouldDirty: true });
        filled.current.insuredValue = amount;
      }
    }
    for (const field of RENT_FIELDS) {
      const reference = suggestion.rent.find((rent) => rent.field === field)?.reference;
      if (!reference) continue;
      const price = Number(reference);
      if (!Number.isFinite(price) || price <= 0) continue;
      const current = getValues(field);
      const untouched = current == null || current === filled.current[field];
      if (!untouched || current === price) continue;
      // Không `shouldValidate`: ô ở bước chưa mở không được báo lỗi trước khi người dùng tới đó.
      setValue(field, price, { shouldDirty: true });
      filled.current[field] = price;
    }
  }, [suggestion, getValues, setValue]);
}
