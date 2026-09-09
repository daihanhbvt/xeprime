import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type Province = Schemas['ProvinceDto'];
export type ProvinceList = Schemas['ProvinceListDto'];

/**
 * Danh mục tỉnh/thành cho các FORM NHẬP LIỆU (đăng ký gian hàng, tạo/sửa chi nhánh, hồ sơ).
 *
 * Nguồn là database qua `GET /provinces` — client KHÔNG hardcode 34 tỉnh. Danh mục hành chính
 * đổi bằng quyết định của nhà nước; khi nó đổi thì chỉ migration và bảng `provinces` phải đổi.
 *
 * Khác `marketplaceApi.destinations`: ở đó là "tỉnh đang có xe để khách tìm", ở đây là "tỉnh
 * được phép chọn khi khai báo địa điểm" — hai câu hỏi khác nhau, hai endpoint khác nhau.
 */
export const locationsApi = {
  async provinces(): Promise<Province[]> {
    const res = await getApiClient().get<ProvinceList>('/provinces');
    return res.items;
  },
};
