import {
  sweepDueInsurancePolicies,
  type InsurancePartner,
  type InsuranceSweepResult,
  type PrismaClient,
} from '@xeprime/prisma';
import { insuranceRetryDelayMinutes } from '@xeprime/types';

const BATCH = 50;

/**
 * PHÁT HÀNH bảo hiểm chuyến — ADR 0032 điều 4 · ADR 0064.
 *
 * ## Vì sao việc này ở worker chứ không ở transaction chuyển trạng thái
 *
 * Phát hành là một lời gọi HTTP ra ngoài. Đặt nó vào transaction của `to = ACTIVE` nghĩa là một
 * đối tác treo 30 giây sẽ giữ khoá trên `bookings` và `vehicle_occupancies` suốt 30 giây đó — sự
 * cố của họ thành sự cố của cả sàn. `BookingsService` chỉ đặt `next_attempt_at`; ở đây mới đi ra.
 *
 * ## Một bản code cho cả worker và API
 *
 * Chiếm → gọi đối tác → ghi kết quả là `sweepDueInsurancePolicies` ở `@xeprime/prisma`, cùng
 * đoạn code `InsuranceService` của API bọc lại (spec của API khoá luật trên đúng bản này). Worker
 * chỉ chọn ADAPTER, một lần lúc boot, bằng `createInsurancePartner(INSURANCE_PARTNER, APP_ENV)`:
 *
 *   - `none` (mặc định, production): hợp đồng dừng ở `failed/partner_not_configured`, phí nằm ở
 *     vế GIỮ HỘ. Báo giá cũng không chào bảo hiểm nữa, nên dòng ở đây chỉ còn từ đơn cũ.
 *   - `mic_mock` (dev/staging): GCN `TEST-MIC-…` có cờ `is_test`, chạy trọn luồng bàn giao →
 *     phát hành → khách bấm xem GCN. Ở `APP_ENV=production` worker CHẾT lúc boot.
 *
 * ## Chống gọi đôi
 *
 * `updateMany` có điều kiện `status` trong WHERE là bước CHIẾM: hai worker (rolling deploy) thì
 * đúng một bên thấy `count = 1`.
 */
export type InsuranceIssueResult = InsuranceSweepResult;

export function sweepInsuranceIssue(
  prisma: PrismaClient,
  partner: InsurancePartner,
  now: Date = new Date(),
): Promise<InsuranceIssueResult> {
  return sweepDueInsurancePolicies(prisma, partner, { batch: BATCH, now });
}

/**
 * Mốc thử lại kế tiếp — export để test khoá luật backoff mà không phải dựng cả một lượt quét.
 *
 * Dùng chung hàm thuần ở `@xeprime/types` để worker và `InsuranceService` không trôi khỏi nhau.
 */
export function nextAttemptAfter(attempts: number, now: Date): Date {
  return new Date(now.getTime() + insuranceRetryDelayMinutes(attempts) * 60_000);
}
