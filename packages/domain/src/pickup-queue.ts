/**
 * Mức KHẨN của một chuyến chưa giao xe — luật dùng chung cho mọi bề mặt bày danh sách
 * "Chờ giao xe" (ADR 0044: đơn ra đời trước, xe rời bãi sau).
 *
 * Vì sao là luật chứ không phải một phép so sánh viết tại chỗ: "hôm nay" là một câu hỏi về MÚI
 * GIỜ, không phải về số mili-giây. Một chuyến hẹn 08:00 ngày mai giờ Việt Nam vẫn nằm trong
 * "hôm nay" nếu ai đó so bằng UTC lúc 18:00 — và người trực sẽ thấy một việc chưa tới hạn nằm
 * lẫn giữa những việc phải làm ngay. Mỗi client tự viết lại là mỗi client một cách sai riêng.
 *
 * Cố ý KHÔNG có mốc "sắp tới hạn trong N giờ": vạch đó là chính sách vận hành của từng gian
 * hàng, chưa ai quyết, và bịa ra một con số ở tầng luật là ép cả sàn theo một nhịp không có
 * thật. Ba mức dưới đây chỉ dùng tới những gì lịch đã biết chắc.
 *
 * ⚠️ Quá giờ hẹn KHÔNG phải là "khách không đến". `no_show` là một kết thúc tiêu cực đi vào
 * lịch sử của khách, có ân hạn riêng và phải do người bấm (`BOOKING_NO_SHOW_GRACE_MINUTES`).
 * Ở đây chỉ là một nhãn để xếp việc.
 */

import type { IsoDateTimeString } from '@xeprime/types';

import { nowInAppTz, toAppTz } from './datetime';

export const PICKUP_URGENCY = {
  /** Đã qua giờ hẹn mà xe vẫn chưa giao — việc cần xử lý trước hết. */
  OVERDUE: 'overdue',
  /** Hẹn trong hôm nay (theo ngày lịch Việt Nam), chưa tới giờ. */
  TODAY: 'today',
  /** Từ ngày mai trở đi. */
  UPCOMING: 'upcoming',
} as const;

export type PickupUrgency = (typeof PICKUP_URGENCY)[keyof typeof PICKUP_URGENCY];

type Instant = IsoDateTimeString | number | Date;

/**
 * Xếp một chuyến vào một trong ba mức trên.
 *
 * `now` là tham số để test cố định được thời điểm — bỏ trống thì dùng đồng hồ thật. Không có
 * nhánh nào chỉ chạy lúc test.
 */
export function pickupUrgency(pickupAt: Instant, now?: Instant): PickupUrgency {
  const at = toAppTz(pickupAt);
  const current = now === undefined ? nowInAppTz() : toAppTz(now);
  if (at.valueOf() < current.valueOf()) return PICKUP_URGENCY.OVERDUE;
  return at.isSame(current, 'day') ? PICKUP_URGENCY.TODAY : PICKUP_URGENCY.UPCOMING;
}
