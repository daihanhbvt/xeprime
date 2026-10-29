import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import {
  TRANSMISSION_TYPE_EXT,
  VEHICLE_TYPE,
  type TransmissionTypeExt,
  type VehicleType,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Mốc lọc nhanh của trang tìm kiếm — bản native của các hằng tương ứng trong
 * `apps/web/src/features/marketplace/constants.ts` (+ `search/use-price-band-label.ts`).
 * Hai bản không tự đồng bộ: đổi mốc ở web thì đổi ở đây trong cùng thay đổi.
 *
 * Theo LOẠI XE vì hai mặt bằng giá cách nhau một bậc: "dưới 800k" là lựa chọn rẻ của ô tô nhưng
 * gồm gần như mọi xe máy. `min` thiếu = không chặn dưới, `max` thiếu = không chặn trên.
 */
export interface PriceBand {
  readonly min?: number;
  readonly max?: number;
}

export const PRICE_BANDS: Readonly<Record<VehicleType, readonly PriceBand[]>> = {
  [VEHICLE_TYPE.CAR]: [
    { max: 800_000 },
    { min: 800_000, max: 1_500_000 },
    { min: 1_500_000, max: 2_500_000 },
    { min: 2_500_000 },
  ],
  [VEHICLE_TYPE.MOTORBIKE]: [
    { max: 150_000 },
    { min: 150_000, max: 250_000 },
    { min: 250_000, max: 400_000 },
    { min: 400_000 },
  ],
};

/** Chưa chọn loại xe ⇒ mốc của ô tô — cùng mặc định với thẻ tìm kiếm. */
export function priceBandsFor(vehicleType: string | null | undefined): readonly PriceBand[] {
  return vehicleType === VEHICLE_TYPE.MOTORBIKE
    ? PRICE_BANDS[VEHICLE_TYPE.MOTORBIKE]
    : PRICE_BANDS[VEHICLE_TYPE.CAR];
}

/** Mốc đang được chọn khi khoảng giá hiện tại TRÙNG KHÍT nó (cả hai đầu). */
export function isPriceBandSelected(
  band: PriceBand,
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): boolean {
  return (band.min ?? null) === (priceMin ?? null) && (band.max ?? null) === (priceMax ?? null);
}

/** Hộp số trong lối tắt "Hộp số" — tập con khách hay lọc nhất, theo loại xe. */
export const QUICK_TRANSMISSIONS: Readonly<Record<VehicleType, readonly TransmissionTypeExt[]>> = {
  [VEHICLE_TYPE.CAR]: [TRANSMISSION_TYPE_EXT.AUTOMATIC, TRANSMISSION_TYPE_EXT.MANUAL],
  [VEHICLE_TYPE.MOTORBIKE]: [
    TRANSMISSION_TYPE_EXT.AUTOMATIC_CVT,
    TRANSMISSION_TYPE_EXT.SEMI_AUTOMATIC,
    TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH,
  ],
};

export function quickTransmissionsFor(
  vehicleType: string | null | undefined,
): readonly TransmissionTypeExt[] {
  return vehicleType === VEHICLE_TYPE.MOTORBIKE
    ? QUICK_TRANSMISSIONS[VEHICLE_TYPE.MOTORBIKE]
    : QUICK_TRANSMISSIONS[VEHICLE_TYPE.CAR];
}

/**
 * Nhãn một mốc giá: "Dưới 150k" · "800k – 1,5tr" · "Trên 2,5tr" — số qua `moneyCompact({ price })`,
 * câu ghép bằng ICU (khoá dùng chung với web `Marketplace.filterPanel`).
 */
export function usePriceBandLabel(): (band: PriceBand) => string {
  const t = useTranslations('Marketplace.filterPanel');
  const format = useAppFormat();

  return useCallback(
    (band: PriceBand) => {
      const money = (value: number) => format.moneyCompact(String(value), { price: true });
      if (band.min != null && band.max != null) {
        return t('priceRangeValue', { from: money(band.min), to: money(band.max) });
      }
      if (band.max != null) return t('priceUnder', { max: money(band.max) });
      if (band.min != null) return t('priceOver', { min: money(band.min) });
      return t('any');
    },
    [format, t],
  );
}

/**
 * Trang gian hàng: đội xe từ chừng này chiếc trở xuống thì KHÔNG có bộ lọc và mỗi thẻ mang ba chỉ
 * số chủ xe; nhiều hơn thì có tab tỉnh và chip lọc. Đếm trên TỔNG số xe công khai của gian hàng,
 * không trên kết quả đã lọc — bố cục không lật qua lại mỗi lần khách bấm chip. Cùng hằng web
 * `SHOP_LIST_LAYOUT_MAX_VEHICLES` (#222).
 */
export const SHOP_LIST_LAYOUT_MAX_VEHICLES = 3;

/**
 * Thanh trượt giá của tấm Bộ lọc — cùng hằng web `PRICE_SLIDER` (#222): đầu phải là "không giới
 * hạn" — kéo chạm `max` thì BỎ `priceMax` thay vì chặn trên đúng con số đó, nên xe đắt hơn mốc cuối
 * vẫn không bị giấu đi.
 */
export const PRICE_SLIDER: Readonly<Record<VehicleType, { max: number; step: number }>> = {
  [VEHICLE_TYPE.CAR]: { max: 3_000_000, step: 50_000 },
  [VEHICLE_TYPE.MOTORBIKE]: { max: 500_000, step: 10_000 },
};

export function priceSliderFor(vehicleType: string | null | undefined): {
  max: number;
  step: number;
} {
  return vehicleType === VEHICLE_TYPE.MOTORBIKE
    ? PRICE_SLIDER[VEHICLE_TYPE.MOTORBIKE]
    : PRICE_SLIDER[VEHICLE_TYPE.CAR];
}
