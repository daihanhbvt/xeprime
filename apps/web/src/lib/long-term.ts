import dayjs from 'dayjs';
import { longTermPackageLabel, PICKUP_PREFERENCE, PICKUP_PREFERENCE_LABEL } from '@xeprime/types';

/** Phần nguyện vọng nhận xe của một yêu cầu thuê dài hạn (shape chung của DTO yêu cầu/chuyến). */
export interface PickupWish {
  pickupPreference?: string | null;
  /** `YYYY-MM-DD` */
  requestedPickupDate?: string | null;
  pickupWindowStartDate?: string | null;
  pickupWindowEndDate?: string | null;
}

/**
 * Câu mô tả nguyện vọng nhận xe của khách — dùng ở MỌI bề mặt hiển thị yêu cầu dài hạn chưa
 * chốt lịch (inbox gian hàng, hộp thoại duyệt, danh sách và chi tiết chuyến của khách).
 *
 * Một hàm duy nhất vì đây là chỗ dễ nói khác nhau nhất: yêu cầu dài hạn chưa duyệt KHÔNG có
 * lịch, nên mỗi màn tự chế một câu là mỗi màn ngụ ý một mức chắc chắn khác nhau (ADR 0011).
 */
export function pickupWishText(wish: PickupWish): string {
  if (wish.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && wish.requestedPickupDate) {
    return `${PICKUP_PREFERENCE_LABEL[PICKUP_PREFERENCE.SPECIFIC_DATE]}: ${dayjs(wish.requestedPickupDate).format('DD/MM/YYYY')}`;
  }
  if (
    wish.pickupPreference === PICKUP_PREFERENCE.WITHIN_7_DAYS &&
    wish.pickupWindowStartDate &&
    wish.pickupWindowEndDate
  ) {
    return `${PICKUP_PREFERENCE_LABEL[PICKUP_PREFERENCE.WITHIN_7_DAYS]}: ${dayjs(wish.pickupWindowStartDate).format('DD/MM')} – ${dayjs(wish.pickupWindowEndDate).format('DD/MM/YYYY')}`;
  }
  return 'Gian hàng chốt ngày giờ nhận khi duyệt';
}

/** Nhãn gói của một bản ghi — `null` khi bản ghi không phải thuê dài hạn hoặc là dữ liệu cũ. */
export function packageLabelOf(packageMonths: number | null | undefined): string | null {
  return packageMonths == null ? null : longTermPackageLabel(packageMonths);
}
