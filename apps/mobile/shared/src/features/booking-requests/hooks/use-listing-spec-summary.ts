import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { VEHICLE_TYPE, transmissionFamily } from '@xeprime/types';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useDomainLabel } from '@/i18n/domain';

/**
 * Những trường làm nên dòng thông số — tin đăng công khai có đủ; xe của một chuyến
 * (`CustomerTripVehicleDto`) không có loại xe ⇒ đọc như ô tô (số chỗ).
 */
export interface ListingSpecSource {
  vehicleType?: string | null;
  motorbikeCategory?: string | null;
  seatCount?: number | null;
  transmission?: string | null;
  fuelType?: string | null;
}

/**
 * Dòng thông số GỌN dưới tên xe — "5 chỗ · Số tự động · Xăng". Bản native của
 * `useListingSpecSummary` bên web (develop): cùng CHỮ với thẻ xe ngoài chợ (`Listings.card`, họ hộp
 * số `transmissionFamily`, nhãn năng lượng từ danh mục) — không bao giờ in mã thô ("cvt").
 * Thiếu mục nào thì bỏ mục đó.
 */
export function useListingSpecSummary(source: ListingSpecSource | null): string[] {
  const t = useTranslations('Listings.card');
  const dl = useDomainLabel();
  const { fuelTypeLabel } = useCatalogLabels();

  return useMemo(() => {
    if (!source) return [];
    const parts: Array<string | null> = [
      source.vehicleType === VEHICLE_TYPE.MOTORBIKE
        ? source.motorbikeCategory
          ? dl('motorbikeCategory', source.motorbikeCategory)
          : null
        : source.seatCount
          ? t('seats', { count: source.seatCount })
          : null,
      source.transmission
        ? t(`transmissionFamily.${transmissionFamily(source.transmission)}`)
        : null,
      fuelTypeLabel(source.fuelType),
    ];
    return parts.filter((part): part is string => Boolean(part));
  }, [source, t, dl, fuelTypeLabel]);
}
