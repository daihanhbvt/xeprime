import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CATALOG_TYPE } from '@xeprime/types';
import { catalogApi, catalogLabel, EMPTY_CATALOG, type CatalogMap } from '@xeprime/api-client';
import { queryKeys } from '@/queries/query-keys';
// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

/**
 * Danh mục lọc dùng chung (hãng xe, kiểu dáng, nhiên liệu, tiện ích).
 *
 * Cùng query key với web nên là MỘT request cho cả phiên, và nhãn trên thẻ xe của app khớp
 * từng chữ với web — cả hai đọc chính bảng admin cấu hình, không ai có bảng dịch riêng.
 *
 * `staleTime` 5 phút: đây là dữ liệu cấu hình, không phải dữ liệu giao dịch.
 */
export function useCatalog(): { catalog: CatalogMap; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.catalog.list(),
    // Lỗi danh mục KHÔNG được làm hỏng thẻ xe: map rỗng ⇒ nhãn rơi về key thô.
    queryFn: () => catalogApi.list().catch(() => EMPTY_CATALOG),
    staleTime: 5 * 60_000,
  });
  return { catalog: data ?? EMPTY_CATALOG, isLoading };
}

export interface CatalogLabels {
  brandLabel: (key: string | null | undefined) => string | null;
  bodyTypeLabel: (key: string | null | undefined) => string | null;
  fuelTypeLabel: (key: string | null | undefined) => string | null;
  featureLabel: (key: string) => string;
}

/** Trả về hàm ổn định theo `catalog` để không phá memo của component con. */
export function useCatalogLabels(): CatalogLabels {
  const { catalog } = useCatalog();
  return useMemo(
    () => ({
      brandLabel: (key) => catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], key),
      bodyTypeLabel: (key) => catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], key),
      fuelTypeLabel: (key) => catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], key),
      featureLabel: (key) => catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) ?? key,
    }),
    [catalog],
  );
}
