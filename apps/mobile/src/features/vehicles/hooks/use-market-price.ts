import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { marketPriceParams, vehiclesApi, type MarketPriceParams } from '@/api/vehicles/api';

/**
 * Khoảng giá tham khảo cho ô "Giá thuê mỗi ngày" — bản native của `use-market-price.ts` bên web.
 *
 * `staleTime` dài (10 phút) vì đây là mặt bằng của cả một phân khúc, không phải số liệu của chiếc
 * xe đang khai: người dùng gõ đi gõ lại số chỗ trong lúc điền form không được kéo theo một chuỗi
 * request. Backend cũng đã cache 5 phút — hai tầng phục vụ hai việc khác nhau (tầng này tiết kiệm
 * lượt đi mạng, tầng kia tiết kiệm lượt đi DB).
 *
 * Hỏng thì hook im lặng (`retry: false`, nơi gọi bỏ qua lỗi): gợi ý giá là trợ giúp, mất nó không
 * được chặn người dùng đăng xe.
 */
export function useMarketPriceSuggestion(params: MarketPriceParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.marketplace.priceSuggestion(marketPriceParams(params)),
    queryFn: () => vehiclesApi.marketPriceSuggestion(params),
    enabled: enabled && Boolean(params.vehicleType),
    staleTime: 10 * 60_000,
    retry: false,
  });
}
