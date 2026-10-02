import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type Province = Schemas['ProvinceDto'];
export type ProvinceList = Schemas['ProvinceListDto'];
export type Ward = Schemas['WardDto'];
export type WardList = Schemas['WardListDto'];
export type AddressView = Schemas['AddressViewDto'];
export type PlaceSuggestion = Schemas['PlaceSuggestionDto'];
export type PlaceDetail = Schemas['PlaceDetailDto'];
export type PlaceSearchResult = Schemas['PlaceSearchResultDto'];
export type PlaceDetailResult = Schemas['PlaceDetailResultDto'];

/**
 * Danh mục hành chính HAI CẤP (tỉnh/thành → xã/phường/đặc khu, hiệu lực 01/07/2025) cho các FORM
 * NHẬP LIỆU: đăng ký gian hàng, tạo/sửa chi nhánh, hồ sơ, địa chỉ giao/đón xe.
 *
 * Nguồn là database — client KHÔNG hardcode 34 tỉnh và càng không hardcode 3.321 đơn vị cấp xã.
 * Danh mục đổi bằng quyết định của nhà nước; khi nó đổi thì chỉ migration và hai bảng phải đổi.
 *
 * KHÔNG có cấp quận/huyện và sẽ không có: mô hình hành chính đã bỏ cấp đó.
 *
 * Khác `marketplaceApi.destinations`: ở đó là "tỉnh đang có xe để khách tìm", ở đây là "tỉnh
 * được phép chọn khi khai báo địa điểm" — hai câu hỏi khác nhau, hai endpoint khác nhau.
 */
export const locationsApi = {
  async provinces(): Promise<Province[]> {
    const res = await getApiClient().get<ProvinceList>('/provinces');
    return res.items;
  },

  /**
   * Xã/phường/đặc khu của MỘT tỉnh.
   *
   * Tìm kiếm chạy ở SERVER vì nó tìm trên khoá đã bỏ dấu và bỏ tiền tố loại đơn vị: gõ
   * `"ba dinh"` phải ra `"Phường Ba Đình"`, mà phép chuẩn hoá đó nằm ở DB. Lọc chuỗi con phía
   * client sẽ trượt đúng những lần gõ mà người dùng cần nó nhất.
   */
  async wards(provinceCode: string, q?: string): Promise<WardList> {
    const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return getApiClient().get<WardList>(
      `/provinces/${encodeURIComponent(provinceCode)}/wards${query}`,
    );
  },

  /** Tra NHÃN của các mã đã lưu — màn hiển thị dùng, không phải bộ chọn. */
  async wardLookup(codes: readonly string[]): Promise<Ward[]> {
    const unique = [...new Set(codes.filter(Boolean))];
    if (unique.length === 0) return [];
    const res = await getApiClient().get<WardList>(
      `/wards/lookup?codes=${encodeURIComponent(unique.join(','))}`,
    );
    return res.items;
  },
};

/**
 * Gợi ý địa điểm / tra địa chỉ ngược — proxy qua backend.
 *
 * KHÔNG gọi thẳng Google từ app: khoá bản đồ có tính tiền theo request, và một khoá nằm trong
 * bundle của app là một khoá ai giải nén APK cũng đọc được (ADR 0018). Đi vòng qua backend còn
 * cho rate limit thật và cache dùng chung giữa mọi người dùng.
 *
 * Không endpoint nào ném vì bản đồ: chưa cấu hình khoá hay nhà cung cấp lỗi đều thành
 * `available: false`, và ô nhập rơi về nhập tay.
 */
export const placesApi = {
  async search(q: string, bias?: { lat: number; lng: number } | null): Promise<PlaceSearchResult> {
    const params = new URLSearchParams({ q });
    if (bias) {
      params.set('lat', String(bias.lat));
      params.set('lng', String(bias.lng));
    }
    return getApiClient().get<PlaceSearchResult>(`/places/search?${params.toString()}`);
  },

  async detail(placeId: string): Promise<PlaceDetailResult> {
    return getApiClient().get<PlaceDetailResult>(
      `/places/detail?placeId=${encodeURIComponent(placeId)}`,
    );
  },

  async reverse(point: { lat: number; lng: number }): Promise<PlaceDetailResult> {
    return getApiClient().get<PlaceDetailResult>(
      `/places/reverse?lat=${point.lat}&lng=${point.lng}`,
    );
  },
};
