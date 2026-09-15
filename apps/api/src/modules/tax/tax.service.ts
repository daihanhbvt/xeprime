import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  FEE_LINE,
  TAX_WITHHOLDING_STATUS,
  canTransitionTax,
  isTaxPeriodKey,
  taxPeriodKeyVn,
  type BookingPriceSnapshot,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Thuế đã đóng băng trên snapshot của đơn — hàm thuần, dùng chung với `HoldSettlementService`. */
export interface TaxSnapshot {
  amount: Prisma.Decimal;
  taxableBase: Prisma.Decimal;
  percent: Prisma.Decimal;
  label: string;
  feePolicyId: string;
}

/**
 * Writer DUY NHẤT của `tax_withholdings` — Phase 8 (ADR 0032 điều 3, ADR 0028 điều 3–4).
 *
 * ## Một mốc duy nhất: chuyến BẮT ĐẦU
 *
 * Nghĩa vụ thuế phát sinh khi xe ra khỏi bãi, không phải khi khách đặt. Huỷ trước chuyến ⇒ không
 * dòng nào. Đó là lý do `accrueForBookingWithinTx` chỉ được gọi từ nhánh `to = ACTIVE` của
 * `BookingsService.transitionWithinTx`, trong CÙNG transaction — một chuyến đã chạy mà sổ thuế
 * chưa có dòng là một khoản nền tảng đã khấu trừ của chủ xe nhưng không biết phải nộp cho ai.
 *
 * ## Sổ CHỈ-GHI-THÊM
 *
 * Không có `update amount`. Sửa sai = một dòng ÂM trỏ về dòng gốc + lật dòng gốc sang `reversed`,
 * cả hai trong một transaction. Một con số đã kê khai với cơ quan thuế mà bị ghi lại là mất bằng
 * chứng của chính lần kê khai đó.
 *
 * ## Idempotent bằng CONSTRAINT, không bằng check
 *
 * `tax_withholdings_live_booking_key` (partial unique) cho phép đúng MỘT nghĩa vụ còn hiệu lực
 * mỗi đơn. Worker chạy lại, hai chuyển trạng thái nối tiếp, admin bấm hai lần — DB từ chối bản
 * thứ hai và service dịch `P2002` thành "đã có, không làm gì".
 */
@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ghi nghĩa vụ thuế của một chuyến VỪA BẮT ĐẦU — chạy trong transaction của lượt chuyển.
   *
   * Trả `null` khi không có gì để ghi: cổng thuế tắt (thuế 0), hoặc đơn không mang snapshot phí
   * (đơn gian hàng tự lập, ngoài luồng chợ — ADR 0028 điều 9). Cả hai là đường chạy bình thường,
   * không phải lỗi.
   */
  async accrueForBookingWithinTx(
    tx: Prisma.TransactionClient,
    input: { bookingId: string; tenantId: string; actorUserId: string | null; now?: Date },
  ): Promise<string | null> {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: { id: true, taxAmount: true, priceSnapshot: true, feePolicyId: true },
    });
    if (!booking) return null;

    const snapshot = taxFromSnapshot(booking.priceSnapshot, booking.feePolicyId);
    if (!snapshot || snapshot.amount.lte(0)) return null;

    const now = input.now ?? new Date();
    /*
     * Hồ sơ người bán chụp TẠI ĐÂY, không join lúc kê khai: tỷ lệ thuế phụ thuộc loại chủ thể
     * (cá nhân · hộ kinh doanh · doanh nghiệp), và gian hàng có thể đổi loại sau khi chuyến đã
     * chạy. Tờ khai của một kỳ phải đọc lại đúng loại chủ thể đã áp cho từng chuyến.
     */
    const seller = await tx.sellerProfile.findUnique({
      where: { tenantId: input.tenantId },
      select: { id: true },
    });

    try {
      const id = newId();
      await tx.taxWithholding.create({
        data: {
          id,
          bookingId: input.bookingId,
          tenantId: input.tenantId,
          sellerProfileId: seller?.id ?? null,
          taxableBase: snapshot.taxableBase,
          percent: snapshot.percent,
          label: snapshot.label,
          amount: snapshot.amount,
          feePolicyId: snapshot.feePolicyId,
          status: TAX_WITHHOLDING_STATUS.ACCRUED,
          accruedAt: now,
          // Kỳ theo GIỜ VIỆT NAM — hàm thuần dùng chung, không suy ở SQL (xem docblock của cột).
          periodKey: taxPeriodKeyVn(now),
          createdBy: input.actorUserId,
        },
      });
      return id;
    } catch (err) {
      /*
       * `P2002` = đã có một nghĩa vụ còn hiệu lực cho đơn này. Đó là kết quả ĐÚNG của một lượt
       * chạy lại, không phải lỗi: chuyển trạng thái vẫn phải thành công, và sổ thuế vẫn đúng một
       * dòng. Bắt ở đây thay vì `findFirst` trước khi ghi — hai request song song đều qua được
       * phép đọc đó.
       */
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Đơn ${input.bookingId} đã có dòng thuế còn hiệu lực — bỏ qua`);
        return null;
      }
      throw err;
    }
  }

  /**
   * ĐẢO một dòng thuế — cách DUY NHẤT để sửa sai trên sổ chỉ-ghi-thêm.
   *
   * Ghi một dòng ÂM trỏ về dòng gốc VÀ lật dòng gốc sang `reversed`, trong một transaction. Sau
   * bước này `tax_withholdings_live_booking_key` lại trống chỗ, nên nếu cần con số đúng thì
   * `accrueForBookingWithinTx` (hoặc một lượt ghi tay) chèn được dòng mới.
   *
   * `remitted` KHÔNG đảo được: tiền đã nộp cho cơ quan thuế, và sửa nó là việc của tờ khai điều
   * chỉnh chứ không phải của một nút trên màn admin.
   */
  async reverse(id: string, actorUserId: string, reason: string): Promise<string> {
    const row = await this.prisma.taxWithholding.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        bookingId: true,
        status: true,
        amount: true,
        taxableBase: true,
        percent: true,
        label: true,
        feePolicyId: true,
        sellerProfileId: true,
        periodKey: true,
        reversalOfId: true,
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy dòng thuế',
      });
    }
    if (row.reversalOfId !== null) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Đây đã là một dòng đảo — không đảo một bút toán đảo',
      });
    }
    if (!canTransitionTax(row.status as TaxWithholdingStatus, TAX_WITHHOLDING_STATUS.REVERSED)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Dòng thuế này không đảo được — tiền đã nộp thì sửa bằng tờ khai điều chỉnh',
        details: { status: row.status },
      });
    }

    const reversalId = newId();
    await this.prisma.$transaction(async (tx) => {
      /*
       * Lật dòng gốc TRƯỚC, có điều kiện `status` trong WHERE: hai admin bấm cùng lúc thì đúng
       * một người thấy `count = 1`. Bên thua không ghi dòng âm thứ hai — và `unique` trên
       * `reversal_of_id` là dây an toàn thứ hai nếu họ vẫn tới được bước sau.
       */
      const claimed = await tx.taxWithholding.updateMany({
        where: { id, status: row.status, reversalOfId: null },
        data: { status: TAX_WITHHOLDING_STATUS.REVERSED },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Dòng thuế vừa được người khác xử lý — tải lại rồi thử lại',
        });
      }

      await tx.taxWithholding.create({
        data: {
          id: reversalId,
          bookingId: row.bookingId,
          tenantId: row.tenantId,
          sellerProfileId: row.sellerProfileId,
          taxableBase: row.taxableBase,
          percent: row.percent,
          label: row.label,
          // ÂM — phép cộng một kỳ chỉ là `SUM(amount)`, không phải một cây if theo trạng thái.
          amount: row.amount.negated(),
          feePolicyId: row.feePolicyId,
          status: TAX_WITHHOLDING_STATUS.REVERSED,
          // Dòng đảo thuộc CÙNG kỳ với dòng gốc: đảo một nghĩa vụ của tháng 3 vào tháng 5 vẫn
          // là sửa tờ khai tháng 3, và xếp nó vào tháng 5 sẽ làm cả hai kỳ sai.
          periodKey: row.periodKey,
          reversalOfId: row.id,
          reversalReason: reason,
          createdBy: actorUserId,
        },
      });

      await this.audit.record(
        {
          tenantId: row.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'tax_withholding.reverse',
          targetType: 'tax_withholding',
          targetId: row.id,
          before: { status: row.status, amount: row.amount.toFixed(0) },
          after: { status: TAX_WITHHOLDING_STATUS.REVERSED, reversalId, reason },
        },
        tx,
      );
    });

    return reversalId;
  }

  /**
   * Chuyển trạng thái CẢ MỘT KỲ — `accrued → declared` hoặc `declared → remitted`.
   *
   * Theo kỳ chứ không theo từng dòng vì đó là cách cơ quan thuế làm việc: một tờ khai cho một
   * tháng. Cho phép bấm từng dòng sẽ sinh ra những kỳ nửa-khai mà không tờ khai nào khớp.
   *
   * `updateMany` có điều kiện `status` nên chạy lại chỉ đụng những dòng còn ở trạng thái nguồn —
   * bấm hai lần không đẩy `declared` thành `remitted`.
   */
  async advancePeriod(
    periodKey: string,
    to: typeof TAX_WITHHOLDING_STATUS.DECLARED | typeof TAX_WITHHOLDING_STATUS.REMITTED,
    actorUserId: string,
  ): Promise<{ updated: number }> {
    if (!isTaxPeriodKey(periodKey)) {
      throw new ConflictException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Kỳ thuế phải có dạng YYYY-MM',
      });
    }
    const from =
      to === TAX_WITHHOLDING_STATUS.DECLARED
        ? TAX_WITHHOLDING_STATUS.ACCRUED
        : TAX_WITHHOLDING_STATUS.DECLARED;

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.taxWithholding.updateMany({
        where: { periodKey, status: from },
        data: {
          status: to,
          ...(to === TAX_WITHHOLDING_STATUS.DECLARED
            ? { declaredAt: now }
            : { remittedAt: now }),
        },
      });
      /*
       * Audit KHÔNG gắn `tenantId`: đây là hành động của nền tảng trên một KỲ, không trên một
       * gian hàng. Gắn tenant nào đó sẽ làm sổ audit của họ có một dòng họ không gây ra.
       */
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: `tax_period.${to}`,
          targetType: 'tax_period',
          targetId: periodKey,
          after: { periodKey, from, to, updated: count },
        },
        tx,
      );
      return count;
    });

    return { updated: result };
  }
}

// ── Hàm thuần ───────────────────────────────────────────────────────────────

/**
 * Thuế đã đóng băng trên snapshot giá của đơn.
 *
 * `null` khi đơn không có `fees` (đơn gian hàng tự lập) hoặc không có dòng `TAX` (cổng thuế tắt).
 * Đọc từ snapshot chứ KHÔNG tính lại theo chính sách hiện hành: chính sách có thể đã sang phiên
 * bản khác giữa lúc tạo đơn và lúc xe ra khỏi bãi, và khấu trừ bằng tỷ lệ của hôm nay cho một
 * đơn đã báo giá hôm qua là hai con số khác nhau (ADR 0024).
 */
export function taxFromSnapshot(
  snapshot: unknown,
  fallbackFeePolicyId: string | null,
): TaxSnapshot | null {
  const fees = (snapshot as BookingPriceSnapshot | null)?.fees;
  if (!fees) return null;

  const line = fees.lines.find((l) => l.key === FEE_LINE.TAX);
  if (!line) return null;

  const amount = new Prisma.Decimal(line.amount);
  if (amount.lte(0)) return null;

  const feePolicyId = fees.policy.policyId || fallbackFeePolicyId;
  if (!feePolicyId) return null;

  return {
    amount,
    // Mẫu số `B` — giá trị thuê chịu thuế, KHÔNG gồm bảo hiểm (ADR 0032 điều 3).
    taxableBase: new Prisma.Decimal(fees.baseAmount),
    percent: new Prisma.Decimal(line.percent ?? fees.policy.taxPercent ?? 0),
    label: (fees.policy.taxLabel ?? 'Thuế khấu trừ').slice(0, 100),
    feePolicyId,
  };
}
