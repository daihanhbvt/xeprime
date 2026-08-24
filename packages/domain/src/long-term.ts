import { PICKUP_PREFERENCE } from '@xeprime/types';

/** Phần nguyện vọng nhận xe của một yêu cầu thuê dài hạn (shape chung của DTO yêu cầu/chuyến). */
export interface PickupWish {
  pickupPreference?: string | null;
  /** `YYYY-MM-DD` */
  requestedPickupDate?: string | null;
  pickupWindowStartDate?: string | null;
  pickupWindowEndDate?: string | null;
}

/**
 * Ba dạng nguyện vọng nhận xe mà giao diện phải nói khác nhau:
 *   - `specificDate` — khách đã nêu một ngày mong muốn
 *   - `window` — khách chọn "trong 7 ngày tới", server đã tính sẵn khoảng
 *   - `shopDecides` — yêu cầu cũ hoặc thiếu dữ liệu ⇒ gian hàng chốt lúc duyệt
 */
export type PickupWishKind = 'specificDate' | 'window' | 'shopDecides';

export interface PickupWishParts {
  readonly kind: PickupWishKind;
  /** `YYYY-MM-DD` — chỉ có ở `specificDate`. */
  readonly date?: string;
  /** `YYYY-MM-DD` — chỉ có ở `window`. */
  readonly start?: string;
  readonly end?: string;
}

/**
 * Phân loại nguyện vọng nhận xe — dùng ở MỌI bề mặt hiển thị yêu cầu dài hạn chưa chốt lịch
 * (inbox gian hàng, hộp thoại duyệt, danh sách và chi tiết chuyến của khách).
 *
 * Một hàm duy nhất vì đây là chỗ dễ nói khác nhau nhất: yêu cầu dài hạn chưa duyệt KHÔNG có
 * lịch, nên mỗi màn tự phân loại một kiểu là mỗi màn ngụ ý một mức chắc chắn khác nhau
 * (ADR 0011). Câu chữ do `useAppFormat().pickupWish()` dựng.
 */
export function pickupWishParts(wish: PickupWish): PickupWishParts {
  if (wish.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && wish.requestedPickupDate) {
    return { kind: 'specificDate', date: wish.requestedPickupDate };
  }
  if (
    wish.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS &&
    wish.pickupWindowStartDate &&
    wish.pickupWindowEndDate
  ) {
    return {
      kind: 'window',
      start: wish.pickupWindowStartDate,
      end: wish.pickupWindowEndDate,
    };
  }
  return { kind: 'shopDecides' };
}
