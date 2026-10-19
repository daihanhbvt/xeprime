'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { VEHICLE_TYPE, transmissionFamily } from '@xeprime/types';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Dòng thông số GỌN dưới tên xe — "4 chỗ · Số tự động · Điện" (Figma `19727:56178`).
 *
 * Một nguồn cho cả thẻ xe ở bước Chuyến đi (`VehicleSummaryPanel`) và thẻ chuyến ở màn Xem lại
 * (`BookingReviewStep`), và cùng CHỮ với thẻ xe ngoài chợ (`VehicleCard`: `Listings.card`, họ
 * hộp số `transmissionFamily`) — khách vừa bấm vào một chiếc "Số tự động" thì hộp đặt xe không
 * được gọi nó là "CVT".
 *
 * Chỉ ba thứ khách dùng để nhận ra "đúng chiếc mình chọn": số chỗ (ô tô) hoặc dòng xe (xe máy),
 * hộp số, năng lượng. Thiếu mục nào thì bỏ mục đó — không in "—" giữa một dòng mô tả.
 */
export function useListingSpecSummary(listing: PublicListingDetail | null): string[] {
  const t = useTranslations('Listings.card');
  const dl = useDomainLabel();
  const { fuelTypeLabel } = useCatalogLabels();

  return useMemo(() => {
    if (!listing) return [];
    const parts: Array<string | null> = [
      listing.vehicleType === VEHICLE_TYPE.MOTORBIKE
        ? listing.motorbikeCategory
          ? dl('motorbikeCategory', listing.motorbikeCategory)
          : null
        : listing.seatCount
          ? t('seats', { count: listing.seatCount })
          : null,
      listing.transmission
        ? t(`transmissionFamily.${transmissionFamily(listing.transmission)}`)
        : null,
      fuelTypeLabel(listing.fuelType),
    ];
    return parts.filter((part): part is string => Boolean(part));
  }, [listing, t, dl, fuelTypeLabel]);
}
