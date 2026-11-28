import type { Dayjs } from 'dayjs';
import { PICKUP_PREFERENCE, longTermReturnAt } from '@xeprime/types';
import { appWallClockToInstant, toAppTz } from './datetime';

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

/**
 * Ngày trả của gói dài hạn tính từ một MẶT ĐỒNG HỒ nhận xe (giá trị ô chọn ngày, giờ Việt Nam) —
 * trả về `Dayjs` đã gắn múi giờ ứng dụng, sẵn để hiển thị hoặc đặt lại vào ô chọn.
 *
 * Gói là N THÁNG LỊCH (`longTermReturnAt`), không phải N × 30 ngày (ADR 0011). Bốn màn từng tự
 * ghép `toAppTz(longTermReturnAt(appWallClockToInstant(x).toDate(), n))` — một chỗ quên bước
 * `appWallClockToInstant` là ngày trả lệch một ngày trên máy không đặt ở giờ Việt Nam.
 */
export function longTermReturnFromWallClock(pickup: Dayjs, packageMonths: number): Dayjs {
  return toAppTz(longTermReturnAt(appWallClockToInstant(pickup).toDate(), packageMonths));
}

/**
 * Gói mang nhãn "ưu đãi tốt nhất" (đỏ) của bảng gói thuê dài hạn: % ưu đãi cam kết thời hạn cao
 * nhất; bằng nhau thì gói NHIỀU tháng nhất. Không gói nào giảm ⇒ `null` (gói 0% không có nhãn).
 * Chỉ là luật TRÌNH BÀY — % do server tính (ADR 0011), ở đây chỉ so sánh để tô màu.
 */
export function bestDiscountPackageMonths(
  packages: readonly { packageMonths: number; durationDiscountPercent?: number | null }[],
): number | null {
  let best: { months: number; percent: number } | null = null;
  for (const pkg of packages) {
    const percent = pkg.durationDiscountPercent ?? 0;
    if (percent <= 0) continue;
    if (
      !best ||
      percent > best.percent ||
      (percent === best.percent && pkg.packageMonths > best.months)
    ) {
      best = { months: pkg.packageMonths, percent };
    }
  }
  return best?.months ?? null;
}

/**
 * Gói của xe GẦN NHẤT với gói khách chọn lúc tìm (`ltMonths`) — xe không bán đủ sáu gói. Cách đều
 * hai phía thì lấy gói NGẮN hơn: cam kết ít hơn, khách tự kéo dài được. Xe không có gói ⇒ `null`.
 */
export function nearestPackageMonths(
  available: readonly number[],
  wanted: number | null | undefined,
): number | null {
  if (available.length === 0) return null;
  if (wanted == null) return available[0] ?? null;
  let best: number | null = null;
  for (const months of available) {
    if (
      best === null ||
      Math.abs(months - wanted) < Math.abs(best - wanted) ||
      (Math.abs(months - wanted) === Math.abs(best - wanted) && months < best)
    ) {
      best = months;
    }
  }
  return best;
}
