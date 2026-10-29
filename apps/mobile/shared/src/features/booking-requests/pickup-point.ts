import { LIST_SEPARATOR } from '@xeprime/domain';
import type { PublicListingDetail } from '@xeprime/types';

type PickupPoint = NonNullable<PublicListingDetail['pickupPoint']>;

/**
 * Điểm nhận xe viết thành MỘT dòng — "Chi nhánh Quận 5 · 123 Nguyễn Văn Cừ, Q.5". Bản native của web
 * `booking-requests/pickup-point.ts`: cùng một cách viết cho hồ sơ xe (bước Chuyến đi), thẻ chuyến
 * (màn Xem lại / hộp kết quả) và thẻ chuyến của khách — người đọc đối chiếu các chỗ đó với nhau.
 */
export function pickupPointText(point: Pick<PickupPoint, 'branchName' | 'address'>): string {
  return [point.branchName, point.address].filter(Boolean).join(LIST_SEPARATOR);
}
