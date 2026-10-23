/**
 * Điểm import Prisma Client duy nhất của monorepo.
 *
 * Mọi package khác import từ `@xeprime/prisma`, không import thẳng
 * `../../prisma/generated/client` — để đổi vị trí generate hoặc bọc thêm middleware
 * chỉ phải sửa một chỗ.
 *
 * Chạy `pnpm db:generate` trước khi build lần đầu, nếu không thư mục generated chưa tồn tại.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';

export * from '../generated/client';
export { PrismaClient, Prisma } from '../generated/client';

/**
 * Tạo PrismaClient với driver adapter — bắt buộc từ Prisma 7 (ADR 0001).
 *
 * Prisma 7 không còn tự đọc `datasource.url` từ schema; PrismaClient phải nhận adapter.
 * Gom vào một factory để PrismaService, seed và test dùng chung đúng một cách cấu hình.
 *
 * @param connectionString Postgres URL. Mặc định lấy từ `process.env.DATABASE_URL`.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL chưa được đặt — không tạo được PrismaClient.');
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export { newId } from './id';

export { isUniqueViolation } from './unique-violation';

/**
 * Huy hiệu người dùng (chuông + chat) — phép đếm và hàng đợi chiếu badge. Dùng chung cho API
 * (GET /me/badges) và worker (chiếu document user_badges/{uid} sang Firestore). Xem docblock
 * của `badges.ts` để biết vì sao nó ở đây chứ không ở `apps/api`.
 */
export {
  activeMemberIdsOf,
  activeTenantIdsOf,
  backfillBadgeSignals,
  chatInboxScope,
  chatUnreadOf,
  clearBadgeSignal,
  computeChatUnread,
  computeUserBadges,
  deferBadgeSignal,
  markBadgesDirty,
  oldestBadgeSignalAgeMs,
  takeBadgeSignals,
  type BadgeSignal,
} from './badges';

/**
 * Điểm xếp hạng "phù hợp" của xe trên chợ — dùng chung cho API (cập nhật khi xe/đánh giá đổi)
 * và worker (quét lại mỗi ngày để độ mới kịp phai). Xem docblock `listing-rank.ts`.
 */
export {
  RANK_SCORE_BAYES,
  RANK_SCORE_FRESHNESS_DAYS,
  RANK_SCORE_TRIPS_CAP,
  RANK_SCORE_WEIGHTS,
  refreshListingRankScore,
  type ListingRankScope,
} from './listing-rank';

/**
 * Bốn trường thẻ xe mirror vào snapshot chợ (số ảnh, hộp số, tự động nhận, xã/phường) — dùng
 * chung cho `ListingsService` và bản sao seed. Xem docblock `listing-card.ts`.
 */
export { readListingCardExtras, selfDriveDailyPrice, type ListingCardExtras } from './listing-card';

/**
 * Hàng đợi đẩy thông báo — dùng chung cho API và worker, hai tiến trình cùng phát thông báo.
 * Xem docblock của `push-outbox.ts` để biết vì sao nó ở đây chứ không ở `apps/api`.
 */
export {
  enqueuePushDeliveries,
  type EnqueuePushOptions,
  type PushRecipientNotification,
} from './push-outbox';

/**
 * Vòng đời LƯỢT DÙNG mã khuyến mãi (ADR 0046) — dùng chung cho API (giữ/chốt/nhả trên đường
 * nghiệp vụ) và worker (nhả khi yêu cầu quá hạn phản hồi, và khi khách không trả tiền giữ chỗ).
 * Xem docblock của `promo-redemption.ts` để biết vì sao nó ở đây chứ không ở `apps/api`.
 */
export {
  PromoQuotaExceededError,
  redeemPromoRedemption,
  releasePromoRedemption,
  reservePromoRedemption,
} from './promo-redemption';

/**
 * Lượt gán tài xế (ADR 0063 · ADR 0066) — xoá cột tài xế trên đơn + khép dòng sổ, và phép trả
 * lượt QUÁ HẠN trả lời về bên thuê. Dùng chung cho `DriversService` (API) và worker quét hạn.
 * Xem docblock `driver-assignment.ts`.
 */
export {
  CLEARED_DRIVER_ASSIGNMENT,
  closeOpenDriverAssignment,
  expirePendingDriverAssignment,
  expiredDriverAssignmentWhere,
  CLEARED_EXTERNAL_DRIVER,
  claimDriverMissingAlert,
  driverMissingAlertWhere,
  markDriverMissingAlertCovered,
} from './driver-assignment';

/**
 * Mở case hỗ trợ — hình dạng hàng ghi dùng chung cho API (`SupportService`) và worker (case
 * `handover_unconfirmed` do hệ thống mở, ADR 0066). Xem docblock `support-case.ts`.
 */
export {
  bookingIdsWithOpenSupportCase,
  createSupportCaseWithinTx,
  findOpenTripNotReceivedReport,
  hasOpenSupportCase,
  openSupportCaseWhere,
  openTripNotReceivedReports,
  supportCaseCode,
  type SupportCaseOpenInput,
} from './support-case';

/**
 * Email hướng dẫn gói (`email_outbox`) — cổng `isPlanPromotionEnabled` + khoá chống trùng dùng chung cho API và
 * worker. Xem docblock `plan-guide-outbox.ts`.
 */
export {
  enqueuePartnerWelcomeEmail,
  enqueuePlanGuideEmail,
  enqueuePlanGuideForSubscription,
  enqueuePlanGuideToOwnerAndContact,
  isPlanPromotionEnabled,
  type EnqueuePlanGuideEmailInput,
} from './plan-guide-outbox';

/**
 * Phát hành bảo hiểm chuyến (ADR 0032 điều 4 · ADR 0064) — chiếm, gọi đối tác, ghi kết quả. Dùng
 * chung cho worker (vòng quét mỗi phút) và API (`InsuranceService` là lớp vỏ tiêm được). Xem
 * docblock của `insurance-issue.ts` để biết vì sao nó ở đây chứ không ở `apps/api`.
 */
export {
  INSURANCE_PARTNER_MODE,
  MIC_CERTIFICATE_PREFIX,
  MIC_MOCK_CERTIFICATE_URL_TEMPLATE,
  MicMockInsurancePartner,
  NoopInsurancePartner,
  activeInsuranceProductSnapshots,
  applyInsuranceIssueResult,
  claimDueInsurancePolicies,
  createInsurancePartner,
  freezeInsuranceProducts,
  insuranceIssuingStaleBefore,
  issueInsurancePolicy,
  readInsuranceProductSnapshot,
  sweepDueInsurancePolicies,
  toInsuranceProductSnapshot,
  type InsuranceIssueOutcome,
  type InsuranceLogger,
  type InsurancePartner,
  type InsurancePartnerMode,
  type InsuranceProductRow,
  type InsuranceProductSnapshot,
  type InsuranceSweepResult,
  type IssuePolicyRequest,
  type IssuePolicyResult,
} from './insurance-issue';
