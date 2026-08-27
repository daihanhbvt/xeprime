'use client';

import { useQuery } from '@tanstack/react-query';
import { CATALOG_TYPE, type CatalogType } from '@xeprime/types';
import { useMemo } from 'react';
import { queryKeys } from '@/services/query-keys';
import { fetchCatalog } from './api';
import { catalogLabel, EMPTY_CATALOG, type CatalogItem, type CatalogMap } from './types';

/**
 * Danh mục lọc dùng chung — form tạo/sửa xe, bộ lọc marketplace và trang chi tiết cùng đọc
 * một query key nên chỉ tốn MỘT request cho cả phiên, và ba màn không bao giờ lệch nhau.
 *
 * `staleTime` 5 phút: đây là dữ liệu cấu hình, không phải dữ liệu giao dịch.
 */
export function useCatalog(): { catalog: CatalogMap; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.catalog.list(),
    queryFn: fetchCatalog,
    staleTime: 5 * 60_000,
  });
  return { catalog: data ?? EMPTY_CATALOG, isLoading };
}

/** Một chiều danh mục. */
export function useCatalogItems(type: CatalogType): {
  items: readonly CatalogItem[];
  isLoading: boolean;
} {
  const { catalog, isLoading } = useCatalog();
  return { items: catalog[type], isLoading };
}

/**
 * Bộ tra nhãn cho cả bốn chiều — dùng ở bảng/chi tiết xe nơi chỉ có key trong tay.
 * Trả về hàm ổn định theo `catalog` để không phá memo của component con.
 */
export interface CatalogLabels {
  brandLabel: (key: string | null | undefined) => string | null;
  bodyTypeLabel: (key: string | null | undefined) => string | null;
  fuelTypeLabel: (key: string | null | undefined) => string | null;
  featureLabel: (key: string) => string;
}

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

/**
 * Option cho `SelectField`. `current` là giá trị xe đang lưu: nếu admin đã TẮT mục đó, nó không
 * còn trong danh sách và ô select sẽ hiện trống — người sửa xe tưởng mình bị mất dữ liệu. Chèn
 * lại nó vào cuối, có ghi chú, để hiện đúng cái đang lưu mà vẫn thấy là mục đã ngừng dùng.
 */
export function useCatalogOptions(
  type: CatalogType,
  current?: string | null,
): { value: string; label: string }[] {
  const { items } = useCatalogItems(type);
  return useMemo(() => {
    const options = items.map((item) => ({ value: item.key, label: item.label }));
    if (current && !options.some((option) => option.value === current)) {
      options.push({ value: current, label: `${current} (đã ngừng dùng)` });
    }
    return options;
  }, [items, current]);
}
