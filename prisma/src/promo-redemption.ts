import {
  PROMO_REDEMPTION_STATUS,
  type PromoCodeSnapshot,
  type PromoReleaseReason,
} from '@xeprime/types';
import { Prisma } from '../generated/client';
import { newId } from './id';

/**
 * VÒNG ĐỜI một LƯỢT DÙNG mã khuyến mãi — GIỮ → CHỐT → NHẢ (ADR 0046 điều 6).
 *
 * ## Vì sao nằm ở `@xeprime/prisma` chứ không ở `apps/api`
 *
 * Cùng lý do với `badges.ts` và `push-outbox.ts`: có HAI tiến trình phải thực hiện đúng ba
 * chuyển trạng thái này.
 *
 *   - **API** giữ lượt lúc khách gửi yêu cầu, chốt lúc đơn hình thành, nhả khi gian hàng từ chối
 *     hoặc khách huỷ.
 *   - **Worker** nhả lượt khi yêu cầu quá hạn phản hồi (`booking-request-deadlines`) và khi khách
 *     không chuyển tiền giữ chỗ đúng hạn (`booking-hold-expiry`). Worker cố ý không kéo runtime
 *     Nest vào, nên nó không dùng lại được service của API.
 *
 * Một bản sao thứ hai của phép cộng/trừ bộ đếm sẽ trôi khỏi bản gốc đúng vào lúc đắt nhất: trần
 * lượt nói còn chỗ trong khi thực tế đã hết, hoặc một chiến dịch "hết lượt" vĩnh viễn vì những
 * yêu cầu đã chết không bao giờ trả lượt về.
 *
 * ## Một writer cho hai bảng
 *
 * `promo_redemptions` và hai bộ đếm trên `promo_codes` có ĐÚNG MỘT chủ sở hữu là file này. Mọi
 * đường ghi khác đi qua ba hàm dưới đây; `PromoCodeEvaluatorService` ở `apps/api` chỉ là lớp vỏ
 * tiêm được của chính chúng.
 */

type Client = Prisma.TransactionClient;

/** Lượt ĐANG TÍNH vào trần — giữ và đã chốt. `released` không tính. */
const COUNTED = [PROMO_REDEMPTION_STATUS.RESERVED, PROMO_REDEMPTION_STATUS.REDEEMED];

export class PromoQuotaExceededError extends Error {
  constructor(
    readonly kind: 'total' | 'per_customer',
    readonly code: string,
  ) {
    super(`Mã ${code} đã hết lượt (${kind})`);
    this.name = 'PromoQuotaExceededError';
  }
}

/**
 * GIỮ một lượt. Chạy TRONG transaction ghi yêu cầu, nên "yêu cầu có mã" và "lượt đã giữ" là một
 * việc hoặc không việc nào.
 *
 * ## Chống dùng vượt hạn mức khi nhiều yêu cầu tới đồng thời
 *
 * Hai trần, hai cơ chế DB — không có câu `if` nào ở tầng app gác chúng:
 *
 *  1. **Trần TỔNG** — `UPDATE … SET reserved_count = reserved_count + 1 WHERE … reserved_count <
 *     total_usage_limit`. Một câu lệnh vừa đọc vừa ghi, nên hai transaction song song không thể
 *     cùng lấy slot cuối: Postgres tuần tự hoá chúng trên chính hàng đó, và bên đến sau đọc lại
 *     con số đã tăng rồi trượt mệnh đề `WHERE`. `count = 0` nghĩa là hết lượt, và
 *     `CHECK promo_codes_counters_check` là chốt chặn cuối nếu một ngày có đường ghi bỏ quên
 *     mệnh đề đó.
 *
 *  2. **Trần MỖI KHÁCH** — `pg_advisory_xact_lock` trên `(promoCodeId, customerUserId)` rồi mới
 *     đếm. `READ COMMITTED` (mặc định của Postgres) cho hai transaction cùng đọc "đang có 0" rồi
 *     cùng ghi, và không ràng buộc DB nào diễn đạt được "≤ N dòng thoả một vị từ" — nên thứ duy
 *     nhất còn lại là tuần tự hoá theo KHÁCH. Khoá tự nhả khi transaction kết thúc, và hai khách
 *     khác nhau vẫn giữ lượt song song được. Cùng khuôn với `assertHoldQuotaWithinTx`.
 *
 * `booking_request_id` UNIQUE lo phần còn lại: một yêu cầu chỉ mang đúng một mã, kể cả khi client
 * bấm gửi hai lần.
 *
 * Ném {@link PromoQuotaExceededError} — caller ở tầng HTTP dịch nó thành mã lỗi API tương ứng.
 * Lớp này không biết gì về HTTP, và đó là điều khiến worker dùng lại được nó.
 */
export async function reservePromoRedemption(
  tx: Client,
  input: {
    snapshot: PromoCodeSnapshot;
    customerUserId: string;
    bookingRequestId: string;
    /** Trần lượt mỗi khách. `null` = không giới hạn ⇒ bỏ hẳn khoá tư vấn. */
    perCustomerLimit: number | null;
  },
): Promise<void> {
  const { promoCodeId, code } = input.snapshot;

  if (input.perCustomerLimit != null) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promo:${promoCodeId}:${input.customerUserId}`}))`;
    const used = await tx.promoRedemption.count({
      where: { promoCodeId, customerUserId: input.customerUserId, status: { in: COUNTED } },
    });
    if (used >= input.perCustomerLimit) {
      throw new PromoQuotaExceededError('per_customer', code);
    }
  }

  const claimed = await tx.$executeRaw`
    UPDATE "promo_codes"
       SET "reserved_count" = "reserved_count" + 1,
           "updated_at" = NOW()
     WHERE "id" = ${promoCodeId}
       AND "deleted_at" IS NULL
       AND "is_active" = true
       AND "starts_at" <= NOW()
       AND "ends_at" >= NOW()
       AND ("total_usage_limit" IS NULL OR "reserved_count" < "total_usage_limit")
  `;
  if (claimed === 0) throw new PromoQuotaExceededError('total', code);

  await tx.promoRedemption.create({
    data: {
      id: newId(),
      promoCodeId,
      code,
      customerUserId: input.customerUserId,
      bookingRequestId: input.bookingRequestId,
      status: PROMO_REDEMPTION_STATUS.RESERVED,
      discountAmount: new Prisma.Decimal(input.snapshot.discountApplied),
      snapshot: input.snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * CHỐT lượt — chạy trong CHÍNH transaction tạo đơn, ở cả hai đường tạo đơn (duyệt chuyến không
 * thu tiền giữ chỗ, và lúc đối soát xác nhận đủ tiền).
 *
 * `discountAmount` ghi lại bằng con số ĐÃ ĐÓNG BĂNG vào snapshot giá, có thể khác số tạm lúc giữ
 * lượt (gian hàng đổi giá, hoặc dài hạn vừa chốt lịch). Đây là lần cập nhật DUY NHẤT của cột đó.
 *
 * Idempotent: điều kiện `status = 'reserved'` nằm trong chính câu `UPDATE`, nên chạy lại không
 * cộng thêm một lượt nào vào `redeemed_count`.
 */
export async function redeemPromoRedemption(
  tx: Client,
  input: { bookingRequestId: string; bookingId: string; discountAmount: string },
): Promise<boolean> {
  const redemption = await tx.promoRedemption.findUnique({
    where: { bookingRequestId: input.bookingRequestId },
    select: { id: true, promoCodeId: true },
  });
  if (!redemption) return false;

  const claimed = await tx.promoRedemption.updateMany({
    where: { id: redemption.id, status: PROMO_REDEMPTION_STATUS.RESERVED },
    data: {
      status: PROMO_REDEMPTION_STATUS.REDEEMED,
      bookingId: input.bookingId,
      discountAmount: new Prisma.Decimal(input.discountAmount),
      redeemedAt: new Date(),
    },
  });
  if (claimed.count === 0) return false;

  await tx.promoCode.update({
    where: { id: redemption.promoCodeId },
    data: { redeemedCount: { increment: 1 } },
  });
  return true;
}

/**
 * NHẢ lượt — yêu cầu chết TRƯỚC khi thành đơn (từ chối, hết hạn phản hồi, khách huỷ, mất khung
 * giờ, không chuyển tiền giữ chỗ, hoặc mã hết đủ điều kiện lúc chốt giá).
 *
 * **KHÔNG nhả khi một ĐƠN đã hình thành rồi bị huỷ** (`PROMO_REDEEMED_IS_FINAL`). Điều kiện
 * `status = 'reserved'` trong câu `UPDATE` là thứ THI HÀNH quy tắc đó: lượt đã `redeemed` không
 * khớp, nên mọi đường huỷ đơn gọi vào đây đều không làm gì cả — không cần ai nhớ kiểm. Lý do
 * nghiệp vụ: huỷ trong cửa sổ miễn phí không mất đồng nào, nên nếu huỷ mà hoàn lượt thì vòng
 * "đặt rồi huỷ" biến một mã dùng-một-lần thành mã dùng vô hạn.
 */
export async function releasePromoRedemption(
  tx: Client,
  input: { bookingRequestId: string; reason: PromoReleaseReason },
): Promise<boolean> {
  const redemption = await tx.promoRedemption.findUnique({
    where: { bookingRequestId: input.bookingRequestId },
    select: { id: true, promoCodeId: true },
  });
  if (!redemption) return false;

  const claimed = await tx.promoRedemption.updateMany({
    where: { id: redemption.id, status: PROMO_REDEMPTION_STATUS.RESERVED },
    data: {
      status: PROMO_REDEMPTION_STATUS.RELEASED,
      releaseReason: input.reason,
      releasedAt: new Date(),
    },
  });
  if (claimed.count === 0) return false;

  /*
   * Trả lượt về kho. Sàn là `redeemed_count`, KHÔNG phải 0: `redeemed_count <= reserved_count` là
   * một CHECK ở DB, nên hạ `reserved_count` xuống dưới số lượt đã chốt sẽ làm nổ cả transaction
   * đang huỷ một yêu cầu — và một yêu cầu phải huỷ được kể cả khi bộ đếm của chiến dịch có vấn đề.
   */
  await tx.$executeRaw`
    UPDATE "promo_codes"
       SET "reserved_count" = GREATEST("reserved_count" - 1, "redeemed_count"),
           "updated_at" = NOW()
     WHERE "id" = ${redemption.promoCodeId}
  `;
  return true;
}
