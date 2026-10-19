import { LIST_SEPARATOR } from '@xeprime/domain';
import type { PublicListingDetail } from '@/features/marketplace/types';

type PickupPoint = NonNullable<PublicListingDetail['pickupPoint']>;

/**
 * Điểm nhận xe viết thành MỘT dòng — "Chi nhánh Quận 5 · 123 Nguyễn Văn Cừ, Q.5". Cùng một cách viết
 * cho cột hồ sơ xe (bước Chuyến đi) và thẻ chuyến (màn Xem lại): khách đối chiếu hai chỗ đó với nhau.
 */
export function pickupPointText(point: Pick<PickupPoint, 'branchName' | 'address'>): string {
  return [point.branchName, point.address].filter(Boolean).join(LIST_SEPARATOR);
}
