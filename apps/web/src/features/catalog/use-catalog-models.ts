'use client';

import { useQuery } from '@tanstack/react-query';
import { catalogModelApi, type CatalogModel } from '@xeprime/api-client';
import { CATALOG_MARKET_STATUS } from '@xeprime/types';
import { useMemo } from 'react';
import { queryKeys } from '@/services/query-keys';

/**
 * Mẫu xe của MỘT hãng trong MỘT loại phương tiện.
 *
 * Chỉ gọi khi đã có cả hai (`enabled`): ô "Mẫu xe" khoá cho tới lúc chủ xe chọn hãng, nên nạp
 * trước là tải một danh sách chưa ai nhìn. Đổi hãng hay đổi loại xe là một query key khác, nên
 * cache cũ không bao giờ hiện nhầm mẫu của hãng trước.
 */
export function useCatalogModels(params: {
  vehicleType: string;
  brandKey: string | null | undefined;
  /** Mẫu xe đang gắn — luôn có mặt trong kết quả kể cả khi admin đã tắt nó. */
  includeId?: string | null;
}): { models: readonly CatalogModel[]; isLoading: boolean } {
  const { vehicleType, brandKey, includeId } = params;
  const enabled = Boolean(vehicleType && brandKey);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.catalog.models(vehicleType, brandKey ?? '', includeId ?? ''),
    queryFn: () =>
      catalogModelApi.list({
        vehicleType,
        brandKey: brandKey ?? undefined,
        includeId: includeId ?? undefined,
      }),
    enabled,
    staleTime: 5 * 60_000,
  });

  return { models: data ?? [], isLoading: enabled && isLoading };
}

export interface CatalogModelOptionGroup {
  /** `current` | `legacy` — nơi gọi tự dịch nhãn nhóm (ADR 0012: mã là dữ liệu, nhãn mới dịch). */
  marketStatus: string;
  options: { value: string; label: string }[];
}

/**
 * Chia mẫu xe thành hai nhóm hiển thị: đang phân phối, rồi mẫu đời trước.
 *
 * Vì sao phải chia: phần lớn xe cho thuê ở Việt Nam là xe đời trước, nên gộp chung một danh sách
 * phẳng thì mẫu đang bán bị chìm giữa mẫu đã ngừng. Còn bỏ hẳn mẫu cũ đi thì chủ chiếc Innova
 * 2018 phải chọn "Khác" — và toàn bộ lợi ích của danh mục chuẩn hoá biến mất đúng ở nhóm đông
 * nhất.
 */
export function useCatalogModelGroups(
  models: readonly CatalogModel[],
): CatalogModelOptionGroup[] {
  return useMemo(() => {
    const groups: CatalogModelOptionGroup[] = [];
    for (const status of [CATALOG_MARKET_STATUS.CURRENT, CATALOG_MARKET_STATUS.LEGACY]) {
      const options = models
        .filter((m) => m.marketStatus === status)
        .map((m) => ({ value: m.id, label: m.label }));
      if (options.length > 0) groups.push({ marketStatus: status, options });
    }
    return groups;
  }, [models]);
}
