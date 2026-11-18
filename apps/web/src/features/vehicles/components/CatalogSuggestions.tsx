'use client';

import { RENT_REFERENCE_BASIS, type VehicleDataRentField } from '@xeprime/types';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useVehicleDataSuggestion } from '@/features/vehicle-data/hooks';
import type { VehicleDataSuggestion, VehicleDataValue } from '@/features/vehicle-data/types';
import { useAppFormat } from '@/i18n/use-app-format';

import styles from './CatalogSuggestions.module.css';

/**
 * Gợi ý từ Dữ liệu xe khi đăng/sửa xe (ADR 0090): giá trị xe + giá thuê là GỢI Ý, không tự điền (thông
 * số thì tự điền + khoá ngay khi chọn mẫu xe - ADR 0102, xem `VehicleIdentityFields`). Mọi khối ở đây chỉ
 * hiện chữ + một nút để chủ xe chủ động dùng; lỗi mạng thì im lặng biến mất — gợi ý là phần thêm,
 * không được chặn việc đăng xe.
 */
export function useVehicleCatalogSuggestion(params: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
}): VehicleDataSuggestion | null {
  return useVehicleDataSuggestion(params);
}

/** Giá trị xe tham khảo cho bảo hiểm — giá xe mới của xe chuẩn × khấu hao theo tuổi xe. */
export function CatalogValueHint({
  value,
  onApply,
}: {
  value: VehicleDataValue;
  onApply: (amount: number) => void;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  const basis =
    value.age > 0
      ? t('valueBasis', { age: value.age, percent: value.residualPercent })
      : t('valueBasisNew');
  return (
    <span className={styles.inlineHint}>
      {t('valueHint', { amount: fmt.money(value.amount) })} {basis}{' '}
      <Button
        type="link"
        size="small"
        className={styles.link}
        onClick={() => onApply(Number(value.amount))}
      >
        {t('useValue')}
      </Button>
    </span>
  );
}

/**
 * Gợi ý cho MỘT ô giá: giá tham khảo của XePrime (kèm nút dùng) + giá các xe cùng dòng đang cho thuê
 * trên chợ khi đủ mẫu. Không có gì ⇒ `fallback` (gợi ý theo phân khúc + tỉnh của wizard đăng nhanh).
 */
export function CatalogRentHint({
  suggestion,
  field,
  onApply,
  fallback = null,
}: {
  suggestion: VehicleDataSuggestion | null;
  field: VehicleDataRentField;
  onApply?: (price: number) => void;
  fallback?: ReactNode;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  const rent = suggestion?.rent.find((r) => r.field === field);
  if (!rent || (!rent.reference && !rent.market)) return <>{fallback}</>;
  return (
    <div className={styles.rent}>
      {rent.reference ? (
        <p className={styles.rentRange}>
          {rent.referenceBasis === RENT_REFERENCE_BASIS.MODEL
            ? t('rentReferenceModel', { price: fmt.money(rent.reference) })
            : t('rentReference', { price: fmt.money(rent.reference) })}
          {onApply ? (
            <Button
              type="link"
              size="small"
              className={styles.link}
              onClick={() => onApply(Number(rent.reference))}
            >
              {t('useRent', { price: fmt.money(rent.reference) })}
            </Button>
          ) : null}
        </p>
      ) : null}
      {rent.market ? (
        <p className={styles.note}>
          {t('rentMarket', {
            low: fmt.money(rent.market.low),
            high: fmt.money(rent.market.high),
            count: rent.market.sampleSize,
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `CatalogRentHint` tự lấy gợi ý — dùng ở nơi không có sẵn dữ liệu gợi ý (màn sửa xe: form giá là
 * một form riêng, dòng/phiên bản/năm đọc từ bản ghi xe). Cùng query key với form nên không gọi thêm.
 */
export function CatalogRentHintFor({
  modelId,
  variantId,
  year,
  vehicleId,
  field,
  onApply,
  fallback = null,
}: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
  field: VehicleDataRentField;
  onApply?: (price: number) => void;
  fallback?: ReactNode;
}) {
  const suggestion = useVehicleCatalogSuggestion({ modelId, variantId, year, vehicleId });
  return (
    <CatalogRentHint suggestion={suggestion} field={field} onApply={onApply} fallback={fallback} />
  );
}
