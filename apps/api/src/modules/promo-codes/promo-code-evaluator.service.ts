import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  PromoQuotaExceededError,
  redeemPromoRedemption,
  releasePromoRedemption,
  reservePromoRedemption,
} from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  computePromoDiscount,
  normalizePromoCode,
  PROMO_AUDIENCE,
  PROMO_INELIGIBLE_REASON,
  PROMO_REDEMPTION_STATUS,
  promoCodeState,
  isPromoStateUsable,
  promoScopeMismatch,
  PROMO_CODE_STATE,
  type PromoCodeSnapshot,
  type PromoCodeTerms,
  type PromoIneligibleReason,
  type PromoReleaseReason,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

/** Chiến dịch ở dạng đã đọc — chỉ những cột phép tính cần. */
const CODE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  discountType: true,
  discountAmount: true,
  discountPercent: true,
  maxDiscountAmount: true,
  minOrderAmount: true,
  audience: true,
  vehicleScope: true,
  serviceScope: true,
  provinceCodes: true,
  totalUsageLimit: true,
  perCustomerLimit: true,
  reservedCount: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  listed: true,
} as const;

type CodeRow = Prisma.PromoCodeGetPayload<{ select: typeof CODE_SELECT }>;

/** Bộ số của chuyến mà phép tính mã cần — caller đã dựng báo giá xong và truyền vào. */
export interface PromoTripMoney {
  /** `base − |discount|` của bảng kê giá thuê (`promoEligibleAmount`). */
  eligibleAmount: string;
  /** `D + S + IV + IP` TRƯỚC tài trợ — `CustomerFeeBreakdown.grossOnlineAmount`. */
  grossOnlineAmount: string | null;
  /** `D + S` — phần tài trợ được, KHÔNG gồm tiền giữ hộ bảo hiểm. */
  sponsorableAmount: string;
  /** `fee_policies.hold_min_amount` của chính sách đang áp cho báo giá này. */
  holdMinAmount: string;
}

/** Phạm vi của chuyến — dùng cho `promoScopeMismatch`. */
export interface PromoTripScope {
  vehicleType: VehicleType | null;
  serviceType: ServiceType;
  /** Mã tỉnh của XE (nơi giao nhận), không phải của khách. `null` = xe chưa gắn mã hành chính. */
  provinceCode: string | null;
}

export type PromoEvaluation =
  | { applicable: true; snapshot: PromoCodeSnapshot; clamped: boolean; code: CodeRow }
  | { applicable: false; reason: PromoIneligibleReason; code: CodeRow | null };

/**
 * ĐÁNH GIÁ và VÒNG ĐỜI LƯỢT DÙNG của mã khuyến mãi — ADR 0046.
 *
 * ## Vì sao service này KHÔNG biết dựng báo giá
 *
 * Nó nhận {@link PromoTripMoney} đã tính sẵn. Nếu nó tự gọi `PricingService` thì hai module phụ
 * thuộc vòng nhau (`PricingService` cần áp mã vào bảng phí), và cái vòng đó chỉ gỡ được bằng
 * `forwardRef` — thứ che mất đúng câu hỏi quan trọng: ai là nguồn của con số? Câu trả lời ở đây
 * là MỘT chiều: máy giá tính tiền, service này chỉ nói mã có áp được không và giảm bao nhiêu.
 *
 * ## Ba cửa kiểm, một phép tính
 *
 * Xem trước · gửi yêu cầu · chốt giá lúc duyệt — cả ba đi qua {@link evaluate} hoặc
 * {@link applyFrozenTerms}, và cả hai đều gọi `computePromoDiscount`. Không có đường nào tính
 * số giảm ở chỗ khác, kể cả client.
 */
@Injectable()
export class PromoCodeEvaluatorService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Đánh giá (KHÔNG giữ lượt)
  // -------------------------------------------------------------------------

  /**
   * Mã này áp được cho chuyến này không, và giảm bao nhiêu.
   *
   * ĐỌC THUẦN — không giữ lượt, không ghi gì. Giữ lượt ở bước xem trước sẽ để một vòng lặp
   * `curl` dùng cạn một chiến dịch trong vài giây (ADR 0046 điều 6).
   *
   * `customerUserId = null` (khách chưa đăng nhập đang xem trước): mọi điều kiện KHÔNG phụ thuộc
   * danh tính vẫn được kiểm, còn điều kiện theo khách trả `REQUIRES_IDENTITY` thay vì bị bỏ qua
   * âm thầm — giao diện cần nói "xác thực số điện thoại để áp mã này", và server thì không được
   * tiết lộ "số này đã từng thuê xe chưa" cho một người chưa chứng minh mình là ai.
   */
  async evaluate(input: {
    code: string;
    customerUserId: string | null;
    scope: PromoTripScope;
    money: PromoTripMoney;
    now?: Date;
  }): Promise<PromoEvaluation> {
    const code = normalizePromoCode(input.code);
    if (!code) {
      return { applicable: false, reason: PROMO_INELIGIBLE_REASON.NOT_FOUND, code: null };
    }
    const row = await this.prisma.promoCode.findFirst({
      where: { code, deletedAt: null },
      select: CODE_SELECT,
    });
    if (!row) {
      return { applicable: false, reason: PROMO_INELIGIBLE_REASON.NOT_FOUND, code: null };
    }
    return this.evaluateRow(row, input.customerUserId, input.scope, input.money, input.now);
  }

  /**
   * Cùng phép kiểm nhưng trên một hàng ĐÃ ĐỌC — dùng cho danh sách mã khả dụng, nơi một lượt
   * `findFirst` cho mỗi mã là N+1 không có lý do gì để tồn tại.
   */
  async evaluateRow(
    row: CodeRow,
    customerUserId: string | null,
    scope: PromoTripScope,
    money: PromoTripMoney,
    now: Date = new Date(),
  ): Promise<PromoEvaluation> {
    const state = promoCodeState(
      {
        isActive: row.isActive,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        totalUsageLimit: row.totalUsageLimit,
        reservedCount: row.reservedCount,
      },
      now,
    );
    if (!isPromoStateUsable(state)) {
      return { applicable: false, reason: reasonForState(state), code: row };
    }

    const terms = toTerms(row);

    const mismatch = promoScopeMismatch(terms, scope);
    if (mismatch) return { applicable: false, reason: mismatch, code: row };

    /*
     * Điều kiện theo KHÁCH. Cả hai cần một danh tính đã xác thực, nên chúng đi cùng nhau: không
     * có danh tính thì trả `REQUIRES_IDENTITY` và để bước gửi yêu cầu (đã qua OTP) kiểm thật.
     */
    const identityNeeded = row.audience !== PROMO_AUDIENCE.ALL || row.perCustomerLimit != null;
    if (identityNeeded) {
      if (!customerUserId) {
        return { applicable: false, reason: PROMO_INELIGIBLE_REASON.REQUIRES_IDENTITY, code: row };
      }
      const identity = await this.checkCustomerConditions(row, customerUserId);
      if (identity) return { applicable: false, reason: identity, code: row };
    }

    const discount = computePromoDiscount({
      terms,
      eligibleAmount: money.eligibleAmount,
      grossOnlineAmount: money.grossOnlineAmount,
      sponsorableAmount: money.sponsorableAmount,
      holdMinAmount: money.holdMinAmount,
    });
    if (!discount.ok) return { applicable: false, reason: discount.reason, code: row };

    return {
      applicable: true,
      clamped: discount.clamped,
      code: row,
      snapshot: {
        ...terms,
        promoCodeId: row.id,
        code: row.code,
        name: row.name,
        discountApplied: discount.discountAmount,
        appliedAt: now.toISOString(),
      },
    };
  }

  /**
   * Số giảm tính lại từ ĐIỀU KIỆN ĐÃ ĐÓNG BĂNG trên yêu cầu — đường của lúc CHỐT GIÁ
   * (ADR 0046 điều 7).
   *
   * Cố ý KHÔNG đọc lại `promo_codes`: admin sửa mức giảm, tắt hoặc xoá mềm chiến dịch giữa lúc
   * khách chờ duyệt là việc bình thường, còn lời hứa đã hiện trên màn hình của khách thì không
   * được viết lại. Những gì VẪN kiểm ở đây là các điều kiện phụ thuộc SỐ TIỀN (đơn tối thiểu,
   * trần tài trợ) — vì giá có thể đã đổi khi gian hàng sửa giá xe hoặc chốt lịch dài hạn.
   *
   * Trả `null` = mã không còn áp được; caller nhả lượt với `NO_LONGER_ELIGIBLE` và báo khách.
   */
  applyFrozenTerms(input: {
    snapshot: PromoCodeSnapshot;
    money: PromoTripMoney;
  }): { snapshot: PromoCodeSnapshot; reason: null } | { snapshot: null; reason: PromoIneligibleReason } {
    const discount = computePromoDiscount({
      terms: input.snapshot,
      eligibleAmount: input.money.eligibleAmount,
      grossOnlineAmount: input.money.grossOnlineAmount,
      sponsorableAmount: input.money.sponsorableAmount,
      holdMinAmount: input.money.holdMinAmount,
    });
    if (!discount.ok) return { snapshot: null, reason: discount.reason };
    return {
      snapshot: { ...input.snapshot, discountApplied: discount.discountAmount },
      reason: null,
    };
  }

  /**
   * Hai điều kiện theo khách — "khách hàng mới" và trần lượt mỗi khách.
   *
   * "Mới" = CHƯA có yêu cầu nào của chính tài khoản này từng thành ĐƠN (ADR 0046 điều 5). Đếm
   * theo đơn đã hình thành chứ không theo số lượt gửi: một người gửi mười yêu cầu rồi không trả
   * tiền lần nào vẫn chưa từng thuê xe của XePrime.
   */
  private async checkCustomerConditions(
    row: CodeRow,
    customerUserId: string,
  ): Promise<PromoIneligibleReason | null> {
    if (row.audience === PROMO_AUDIENCE.NEW_CUSTOMER) {
      const previous = await this.prisma.bookingRequest.count({
        where: {
          customerUserId,
          status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        },
      });
      if (previous > 0) {
        return PROMO_INELIGIBLE_REASON.AUDIENCE_MISMATCH;
      }
    }
    if (row.perCustomerLimit != null) {
      const used = await this.prisma.promoRedemption.count({
        where: {
          promoCodeId: row.id,
          customerUserId,
          status: {
            in: [PROMO_REDEMPTION_STATUS.RESERVED, PROMO_REDEMPTION_STATUS.REDEEMED],
          },
        },
      });
      if (used >= row.perCustomerLimit) {
        return PROMO_INELIGIBLE_REASON.CUSTOMER_LIMIT_REACHED;
      }
    }
    return null;
  }

  /** Mã khả dụng (đã `listed`) cho một chuyến, kèm lý do với từng mã không áp được. */
  async listAvailable(input: {
    customerUserId: string | null;
    scope: PromoTripScope;
    money: PromoTripMoney;
    limit?: number;
  }): Promise<PromoEvaluation[]> {
    const now = new Date();
    const rows = await this.prisma.promoCode.findMany({
      where: {
        deletedAt: null,
        listed: true,
        isActive: true,
        /*
         * Chỉ mã CÒN trong khoảng hiệu lực. Mã đã hết hạn hoặc chưa tới ngày không hiện ra —
         * một danh sách đầy mã xám không dùng được là rác, không phải thông tin. Mã HẾT LƯỢT thì
         * vẫn lọt vào đây và `evaluateRow` gắn lý do cho nó: nó vừa còn hiệu lực hôm qua, nên
         * nói rõ "hết lượt" tốt hơn là để nó biến mất không giải thích.
         */
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: CODE_SELECT,
      orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
      take: input.limit ?? 20,
    });
    return Promise.all(
      rows.map((row) =>
        this.evaluateRow(row, input.customerUserId, input.scope, input.money, now),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Vòng đời lượt dùng
  // -------------------------------------------------------------------------

  /**
   * GIỮ một lượt — chạy TRONG transaction ghi yêu cầu, nên "yêu cầu có mã" và "lượt đã giữ" là
   * một việc hoặc không việc nào.
   *
   * ## Chống dùng vượt hạn mức khi nhiều yêu cầu tới đồng thời
   *
   * Hai trần, hai cơ chế DB — không có câu `if` nào ở tầng app gác chúng:
   *
   *  1. **Trần TỔNG** — `UPDATE … SET reserved_count = reserved_count + 1 WHERE id = ? AND
   *     (total_usage_limit IS NULL OR reserved_count < total_usage_limit)`. Một câu lệnh vừa đọc
   *     vừa ghi, nên hai transaction song song không thể cùng lấy slot cuối: Postgres tuần tự
   *     hoá chúng trên chính hàng đó, và bên đến sau đọc lại con số đã tăng rồi trượt mệnh đề
   *     `WHERE`. `count = 0` là "hết lượt", và `CHECK promo_codes_counters_check` là chốt chặn
   *     cuối nếu một ngày nào đó có đường ghi bỏ quên mệnh đề này.
   *
   *  2. **Trần MỖI KHÁCH** — `pg_advisory_xact_lock` trên `(promoCodeId, customerUserId)` rồi
   *     mới đếm. `READ COMMITTED` (mặc định của Postgres) cho hai transaction cùng đọc "đang có
   *     0" rồi cùng ghi, và không ràng buộc DB nào diễn đạt được "≤ N dòng thoả một vị từ" —
   *     nên thứ duy nhất còn lại là tuần tự hoá theo KHÁCH. Khoá tự nhả khi transaction kết
   *     thúc, và hai khách khác nhau vẫn giữ lượt song song được. Cùng khuôn với
   *     `BookingHoldsService.assertHoldQuotaWithinTx`.
   *
   * `booking_request_id` UNIQUE lo phần còn lại: một yêu cầu chỉ mang đúng một mã, kể cả khi
   * client bấm gửi hai lần.
   */
  async reserveWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      snapshot: PromoCodeSnapshot;
      customerUserId: string;
      bookingRequestId: string;
      /** Trần lượt mỗi khách của chiến dịch — đọc lại TRONG khoá, không tin giá trị đã đọc. */
      perCustomerLimit: number | null;
    },
  ): Promise<void> {
    try {
      await reservePromoRedemption(tx, input);
    } catch (err) {
      if (!(err instanceof PromoQuotaExceededError)) throw err;
      if (err.kind === 'per_customer') {
        throw new ConflictException({
          code: API_ERROR_CODE.PROMO_CODE_NOT_APPLICABLE,
          message: 'Bạn đã dùng hết lượt của mã khuyến mãi này',
          details: {
            code: input.snapshot.code,
            reason: PROMO_INELIGIBLE_REASON.CUSTOMER_LIMIT_REACHED,
          },
        });
      }
      /*
       * Mã vừa hết lượt (hoặc vừa bị tắt/hết hạn) GIỮA lúc khách xem trước và lúc bấm gửi.
       *
       * Ném lỗi chứ không âm thầm bỏ mã rồi ghi yêu cầu: bỏ mã làm số tiền khách phải trả TĂNG
       * so với con số họ vừa đồng ý, và họ chỉ phát hiện ra lúc nhìn mã QR.
       */
      throw new ConflictException({
        code: API_ERROR_CODE.PROMO_CODE_EXHAUSTED,
        message: 'Mã khuyến mãi vừa hết lượt sử dụng — vui lòng xem lại giá',
        details: { code: input.snapshot.code },
      });
    }
  }

  /**
   * CHỐT lượt — chạy trong CHÍNH transaction tạo đơn, ở cả hai đường tạo đơn (duyệt chuyến không
   * thu tiền giữ chỗ, và lúc đối soát xác nhận đủ tiền).
   *
   * `discountAmount` ghi lại bằng con số ĐÃ ĐÓNG BĂNG vào snapshot giá, có thể khác số tạm lúc
   * giữ lượt (gian hàng đổi giá, hoặc dài hạn vừa chốt lịch). Đây là lần cập nhật DUY NHẤT của
   * cột đó.
   *
   * Idempotent theo trạng thái: `updateMany` có điều kiện `status = 'reserved'` nên chạy lại
   * không cộng thêm một lượt nào.
   */
  async redeemWithinTx(
    tx: Prisma.TransactionClient,
    input: { bookingRequestId: string; bookingId: string; discountAmount: string },
  ): Promise<void> {
    await redeemPromoRedemption(tx, input);
  }

  /**
   * NHẢ lượt — yêu cầu chết trước khi thành đơn (từ chối, hết hạn phản hồi, khách huỷ, mất khung
   * giờ, không chuyển tiền giữ chỗ, hoặc mã hết đủ điều kiện lúc chốt giá).
   *
   * **KHÔNG nhả khi một ĐƠN đã hình thành rồi bị huỷ** (`PROMO_REDEEMED_IS_FINAL`): điều kiện
   * `status = 'reserved'` ở đây là thứ thi hành quy tắc đó — lượt đã `redeemed` không khớp, nên
   * mọi đường huỷ đơn đi qua hàm này đều không làm gì cả. Không cần ai nhớ kiểm.
   */
  async releaseWithinTx(
    tx: Prisma.TransactionClient,
    input: { bookingRequestId: string; reason: PromoReleaseReason },
  ): Promise<void> {
    await releasePromoRedemption(tx, input);
  }

  /** Điều kiện đã đóng băng trên một yêu cầu — `null` khi yêu cầu không dùng mã. */
  frozenTermsOf(request: { promoSnapshot: Prisma.JsonValue | null }): PromoCodeSnapshot | null {
    if (!request.promoSnapshot) return null;
    return request.promoSnapshot as unknown as PromoCodeSnapshot;
  }

  /** Trần lượt mỗi khách của một chiến dịch — đọc riêng vì `reserveWithinTx` cần nó trong khoá. */
  async perCustomerLimitOf(promoCodeId: string): Promise<number | null> {
    const row = await this.prisma.promoCode.findUnique({
      where: { id: promoCodeId },
      select: { perCustomerLimit: true },
    });
    return row?.perCustomerLimit ?? null;
  }
}

/** `PromoCodeTerms` từ một hàng DB — tiền về string (ADR 0007), mảng giữ nguyên. */
function toTerms(row: CodeRow): PromoCodeTerms {
  return {
    discountType: row.discountType as PromoCodeTerms['discountType'],
    discountAmount: row.discountAmount?.toFixed(0) ?? null,
    discountPercent: row.discountPercent,
    maxDiscountAmount: row.maxDiscountAmount?.toFixed(0) ?? null,
    minOrderAmount: row.minOrderAmount.toFixed(0),
    audience: row.audience as PromoCodeTerms['audience'],
    vehicleScope: row.vehicleScope as PromoCodeTerms['vehicleScope'],
    serviceScope: row.serviceScope as ServiceType[],
    provinceCodes: row.provinceCodes,
    perCustomerLimit: row.perCustomerLimit,
  };
}

/** Trạng thái không dùng được ⇒ lý do tương ứng. Bảng tra, không phải một chuỗi `if`. */
function reasonForState(state: ReturnType<typeof promoCodeState>): PromoIneligibleReason {
  switch (state) {
    case PROMO_CODE_STATE.DISABLED:
      return PROMO_INELIGIBLE_REASON.DISABLED;
    case PROMO_CODE_STATE.UPCOMING:
      return PROMO_INELIGIBLE_REASON.NOT_STARTED;
    case PROMO_CODE_STATE.EXPIRED:
      return PROMO_INELIGIBLE_REASON.EXPIRED;
    case PROMO_CODE_STATE.EXHAUSTED:
      return PROMO_INELIGIBLE_REASON.EXHAUSTED;
    default:
      /*
       * `active`/`ending_soon` không bao giờ tới đây (`isPromoStateUsable` đã lọc). Trả
       * `NOT_FOUND` thay vì ném: một trạng thái mới thêm vào sau này không được phép làm sập
       * đường báo giá của khách.
       */
      return PROMO_INELIGIBLE_REASON.NOT_FOUND;
  }
}
