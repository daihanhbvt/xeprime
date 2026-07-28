import { SERVICE_TYPE, VEHICLE_TYPE, type VehicleType } from '@xeprime/types';
import type { ListingSort } from './types';

/** Tab loại xe ở hero (Ô tô / Xe máy). */
export const VEHICLE_TABS: ReadonlyArray<{ key: VehicleType; label: string; icon: string }> = [
  { key: VEHICLE_TYPE.CAR, label: 'Ô tô tự lái', icon: 'car' },
  { key: VEHICLE_TYPE.MOTORBIKE, label: 'Xe máy', icon: 'bike' },
];

/** Loại dịch vụ (tự lái / có tài xế / dài hạn) — dưới tab xe. */
export const SERVICE_TABS: ReadonlyArray<{ key: string; label: string }> = [
  { key: SERVICE_TYPE.SELF_DRIVE, label: 'Tự lái' },
  { key: SERVICE_TYPE.WITH_DRIVER, label: 'Có tài xế' },
  { key: SERVICE_TYPE.LONG_TERM, label: 'Thuê dài hạn' },
];

/** Sắp xếp nhanh — chip đầu tiên là mặc định. */
export const SORT_CHIPS: ReadonlyArray<{ key: ListingSort; label: string }> = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'price_asc', label: 'Giá thấp' },
  { key: 'price_desc', label: 'Giá cao' },
];

/** Khoảng giá thuê/ngày (VND) cho bộ lọc nhanh. `all` = không lọc; min/max để trống = không chặn đầu đó. */
export const PRICE_RANGES: ReadonlyArray<{
  key: string;
  label: string;
  min?: number;
  max?: number;
}> = [
  { key: 'all', label: 'Mọi mức giá' },
  { key: 'lt500', label: 'Dưới 500k', max: 500000 },
  { key: '500_800', label: '500k – 800k', min: 500000, max: 800000 },
  { key: '800_1200', label: '800k – 1.2tr', min: 800000, max: 1200000 },
  { key: 'gt1200', label: 'Trên 1.2tr', min: 1200000 },
];

/**
 * Địa điểm nổi bật — bám xeprime.vn. Số xe là gợi ý biên tập (curated), sẽ thay bằng đếm
 * thật khi `public_listings` có `province` (Phase 3). Ảnh dùng gradient placeholder cho tới
 * khi có asset.
 */
export const FEATURED_LOCATIONS: ReadonlyArray<{
  province: string;
  name: string;
  count: number;
}> = [
  { province: 'DN', name: 'Đà Nẵng', count: 240 },
  { province: 'HCM', name: 'TP. Hồ Chí Minh', count: 580 },
  { province: 'HN', name: 'Hà Nội', count: 420 },
  { province: 'HUE', name: 'Huế', count: 120 },
  { province: 'DL', name: 'Đà Lạt', count: 160 },
  { province: 'NT', name: 'Nha Trang', count: 95 },
];
