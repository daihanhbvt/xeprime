import { PLATFORM_TRIP_QUEUE, type PlatformTripQueue } from '@xeprime/types';

/**
 * Hai nhóm hàng đợi của màn "Vận hành chuyến" — thứ tự là thứ tự một chuyến đi qua nền tảng
 * (ADR 0044): khách hỏi → chủ xe nhận → khách giữ chỗ → giao xe → trả xe.
 *
 *  - **Trước chuyến**: chưa có đơn; việc của người trực là nhắc đúng người (chủ xe, rồi khách).
 *  - **Trong chuyến**: đã có đơn; việc là theo dõi giờ giao/trả, hỏi gian hàng khi quá giờ.
 *
 * Mã hàng đợi là giá trị URL (`?queue=`), cùng một bộ với `counts` server trả; nhãn ở
 * `AdminTrips.queues`.
 */
export const TRIP_QUEUE_GROUPS = [
  {
    key: 'before',
    queues: [PLATFORM_TRIP_QUEUE.PENDING_APPROVAL, PLATFORM_TRIP_QUEUE.AWAITING_HOLD],
  },
  { key: 'during', queues: [PLATFORM_TRIP_QUEUE.PICKUP_SOON, PLATFORM_TRIP_QUEUE.ACTIVE] },
] as const satisfies readonly { key: string; queues: readonly PlatformTripQueue[] }[];

export type TripQueueGroupKey = (typeof TRIP_QUEUE_GROUPS)[number]['key'];

/** Hàng đợi mặc định khi URL chưa chọn — chặng đầu tiên, nơi khách đang chờ lâu nhất. */
export const DEFAULT_TRIP_QUEUE: PlatformTripQueue = PLATFORM_TRIP_QUEUE.PENDING_APPROVAL;

/**
 * Dữ liệu vận hành ĐỔI theo đồng hồ (hạn trả lời, hạn giữ chỗ, giờ giao) chứ không chỉ theo
 * thao tác người dùng — màn mở cả ca trực phải tự làm mới, không chờ ai bấm F5.
 */
export const TRIP_REFRESH_INTERVAL_MS = 60_000;
