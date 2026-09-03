import { getApiClient } from '../../client';
import type { Paged } from '../../client';
import type { AbortSignalLike } from '../../http';
import type { QueryParams } from '../../url';
import { SERVICE_TYPE, type components } from '@xeprime/types';
import type {
  MarketplaceFilters,
  PublicBanner,
  PublicDestination,
  PublicListing,
  PublicListingDetail,
  PublicShop,
  PublicListingFacets,
  PublicShopSummary,
  ReviewPage,
} from '@xeprime/types';

/**
 * Filter → query param gửi API (`/public/listings` và `/public/listings/facets`).
 *
 * MỘT chỗ duy nhất cho cả web lẫn native: web lấy filter từ URL, native từ state màn hình,
 * nhưng câu hỏi gửi lên backend thì phải y hệt nhau.
 *
 * `routeType` KHÔNG có ở đây có chủ đích — nó là ngữ cảnh mang sang yêu cầu thuê, không phải
 * chiều lọc (xe không khai lộ trình phục vụ; lọc theo nó chỉ tạo kết quả rỗng giả).
 */
export function toListingQueryParams(filters: MarketplaceFilters): QueryParams {
  return {
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    // Tham số chuẩn là MÃ. `province` (tên) chỉ gửi kèm khi chưa có mã — backend quy nó về mã
    // qua bảng bí danh, và URL sinh ra từ đó luôn mang mã.
    provinceCode: filters.provinceCode ?? null,
    province: filters.provinceCode ? null : (filters.province ?? null),
    brand: filters.brand?.length ? filters.brand.join(',') : null,
    bodyType: filters.bodyType?.length ? filters.bodyType.join(',') : null,
    seats: filters.seats?.length ? filters.seats.join(',') : null,
    fuelType: filters.fuelType?.length ? filters.fuelType.join(',') : null,
    features: filters.features?.length ? filters.features.join(',') : null,
    hourly: filters.hourly ? '1' : null,
    delivery: filters.delivery ? '1' : null,
    noCollateral: filters.noCollateral ? '1' : null,
    discount: filters.discount ? '1' : null,
    minSeats: filters.minSeats ?? null,
    priceMin: filters.priceMin ?? null,
    priceMax: filters.priceMax ?? null,
    pickupAt: filters.pickupAt ?? null,
    returnAt: filters.returnAt ?? null,
  };
}

export const DEFAULT_LISTING_LIMIT = 12;

export const marketplaceApi = {
  /** Danh sách xe công khai, luôn phân trang — trả cả `meta` để UI biết còn trang sau. */
  listings(filters: MarketplaceFilters, signal?: AbortSignalLike): Promise<Paged<PublicListing>> {
    const params = {
      ...toListingQueryParams(filters),
      sort: filters.sort ?? null,
      page: filters.page ?? 1,
      limit: filters.limit ?? DEFAULT_LISTING_LIMIT,
    };
    return getApiClient().fetchPage<PublicListing>(
      '/public/listings',
      params,
      DEFAULT_LISTING_LIMIT,
      signal ? { signal } : undefined,
    );
  },

  /**
   * Số đếm facet cho panel Bộ lọc.
   *
   * Backend đếm mỗi chiều với MỌI filter TRỪ chính nó, nên con số trả lời đúng câu "bấm thêm
   * cái này thì còn bao nhiêu xe" — không phải "hiện đang có bao nhiêu".
   */
  facets(filters: MarketplaceFilters): Promise<PublicListingFacets> {
    return getApiClient().get<PublicListingFacets>(
      '/public/listings/facets',
      toListingQueryParams(filters),
    );
  },

  listing(vehicleId: string): Promise<PublicListingDetail> {
    return getApiClient().get<PublicListingDetail>(
      `/public/listings/${encodeURIComponent(vehicleId)}`,
    );
  },

  /**
   * Endpoint trả sẵn phong bì `{ summary, data, meta }` nên KHÔNG dùng `get` (nó bóc mất
   * `summary`); `request` giữ nguyên cả phong bì.
   */
  async reviews(vehicleId: string, limit: number): Promise<ReviewPage> {
    const res = await getApiClient().request<ReviewPage['data']>(
      `/public/listings/${encodeURIComponent(vehicleId)}/reviews`,
      { query: { limit } },
    );
    return res as unknown as ReviewPage;
  },

  /**
   * Tỉnh/thành ĐANG THỰC SỰ CÓ XE, số xe đếm ở backend.
   *
   * Đây là NGUỒN DUY NHẤT cho mọi bộ chọn địa điểm ở marketplace — không client nào có danh
   * sách tỉnh riêng, nhờ vậy tỉnh bị admin ẩn biến mất khỏi mọi chỗ cùng lúc.
   */
  destinations(limit: number): Promise<PublicDestination[]> {
    return getApiClient()
      .request<PublicDestination[]>('/public/destinations', { query: { limit } })
      .then((res) => res.data);
  },

  /** Gian hàng đang hoạt động có xe công khai, sắp theo điểm đánh giá. */
  shops(limit: number): Promise<Paged<PublicShopSummary>> {
    return getApiClient().fetchPage<PublicShopSummary>(
      '/public/shops',
      { page: 1, limit },
      limit,
    );
  },

  shop(slug: string): Promise<PublicShop> {
    return getApiClient().get<PublicShop>(`/public/shops/${encodeURIComponent(slug)}`);
  },

  banners(): Promise<PublicBanner[]> {
    return getApiClient().get<PublicBanner[]>('/public/banners');
  },
};

/**
 * Hai hình thái tham số, đúng hai mô hình giá: dịch vụ theo NGÀY gửi khoảng nhận–trả; THUÊ DÀI
 * HẠN gửi `packageMonths` và KHÔNG gửi ngày nào — giá gói không phụ thuộc ngày nhận (ADR 0011).
 */
export type PublicQuoteParams =
  | { serviceType: typeof SERVICE_TYPE.LONG_TERM; packageMonths: number }
  | { pickupAt: string; returnAt: string; serviceType?: string; routeType?: string };

export type PublicQuote = components['schemas']['PublicQuoteDto'];

/**
 * Báo giá công khai — CÙNG nguồn tính giá với luồng duyệt của shop.
 *
 * Con số hiển thị cho khách phải đến từ đây, không phải từ một phép nhân ở client: giá có bậc
 * cuối tuần, ngày lễ và ưu đãi cam kết thời hạn, và mọi bản tính lại ở client đều lệch với con
 * số gian hàng nhìn thấy khi duyệt.
 */
export function publicQuote(vehicleId: string, params: PublicQuoteParams): Promise<PublicQuote> {
  return getApiClient().get<PublicQuote>(
    `/public/listings/${encodeURIComponent(vehicleId)}/quote`,
    params as QueryParams,
  );
}

export type DeliveryDistance = components['schemas']['DeliveryDistanceDto'];

/**
 * Khoảng cách giao xe tới một địa chỉ + phí DỰ KIẾN.
 *
 * **KHÔNG ném khi không tra được** — mọi ngả hỏng về dưới dạng `status`
 * (`@xeprime/types` → `DELIVERY_DISTANCE_STATUS`), nên nơi gọi đọc MÃ chứ không bắt lỗi. "Không
 * tra được không phải một lỗi" là chữ trong ADR 0018.
 *
 * Con số trả về là ƯỚC LƯỢNG, một chiều theo đường bộ; chủ xe vẫn chốt phí trên đơn (ADR 0014).
 * Đừng cộng nó vào tổng tiền hiển thị như một khoản đã chốt.
 */
export function deliveryDistance(vehicleId: string, address: string): Promise<DeliveryDistance> {
  return getApiClient().get<DeliveryDistance>(
    `/public/listings/${encodeURIComponent(vehicleId)}/delivery-distance`,
    { address },
  );
}
