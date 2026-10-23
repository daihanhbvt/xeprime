import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  TAX_WITHHOLDING_STATUS,
  canTransitionTax,
  feeTaxDetailOf,
  isTaxPeriodKey,
  taxPeriodKeyVn,
  taxRateLabel,
  type BookingPriceSnapshot,
  type SellerEntityType,
  type TaxCategory,
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
  /**
   * GTGT/TNCN tách riêng (ADR 0068). `null` cả bốn khi snapshot là mô hình một-mức (trước
   * 22/10/2026) — sổ không bịa ra một phép tách mà lúc đó không ai tính.
   */
  vatAmount: Prisma.Decimal | null;
  pitAmount: Prisma.Decimal | null;
  vatPercent: Prisma.Decimal | null;
  pitPercent: Prisma.Decimal | null;
  taxCategory: TaxCategory | null;
  /**
   * Chủ thể ÁP THUẾ đã đóng băng lúc nhận chuyến (`taxSellerEntityOf`). `null` ở snapshot cũ.
   * KHÁC loại chủ thể người bán KHAI — cái đó chụp từ hồ sơ lúc ghi sổ (`seller_entity_type`).
   */
  taxSubjectType: SellerEntityType | null;
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
     * Hồ sơ người bán chụp TẠI ĐÂY, không join lúc kê khai: tờ khai chia theo loại chủ thể người
     * bán KHAI (cá nhân · hộ kinh doanh · doanh nghiệp) kèm MST/CCCD, và gian hàng có thể đổi hồ
     * sơ sau khi chuyến đã chạy. Tờ khai của một kỳ phải đọc lại đúng hồ sơ lúc ghi sổ.
     */
    const seller = await tx.sellerProfile.findUnique({
      where: { tenantId: input.tenantId },
      select: { id: true, entityType: true, taxId: true, idNumber: true, legalName: true },
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
          vatAmount: snapshot.vatAmount,
          pitAmount: snapshot.pitAmount,
          vatPercent: snapshot.vatPercent,
          pitPercent: snapshot.pitPercent,
          taxCategory: snapshot.taxCategory,
          /*
           * HAI sự kiện khác nhau, hai cột:
           *  - `sellerEntityType` = loại chủ thể người bán KHAI trong hồ sơ, chụp TẠI ĐÂY cùng định
           *    danh (MST, CCCD, tên pháp lý — NĐ 117 đòi tờ khai ghi người bán bằng chúng, và hồ sơ
           *    sửa được sau khi chuyến đã chạy). Không có hồ sơ ⇒ NULL: tờ khai phải THẤY khoảng
           *    trống đó (nhóm `unknown`), không được ghi đè bằng "cá nhân".
           *  - `taxSubjectType` = chủ thể ÁP THUẾ đọc từ SNAPSHOT của đơn (đóng băng lúc nhận chuyến
           *    — ADR 0024): không hồ sơ / doanh nghiệp chưa xác minh ⇒ khấu trừ như cá nhân.
           */
          sellerEntityType: seller?.entityType ?? null,
          taxSubjectType: snapshot.taxSubjectType,
          sellerTaxId: seller?.taxId ?? null,
          sellerIdNumber: seller?.idNumber ?? null,
          sellerLegalName: seller?.legalName ?? null,
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
        vatAmount: true,
        pitAmount: true,
        vatPercent: true,
        pitPercent: true,
        taxCategory: true,
        sellerEntityType: true,
        taxSubjectType: true,
        sellerTaxId: true,
        sellerIdNumber: true,
        sellerLegalName: true,
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
          // Hai sắc thuế đảo CÙNG dấu với tổng — CHECK `vat + pit = amount` giữ ở cả dòng đảo.
          vatAmount: row.vatAmount?.negated() ?? null,
          pitAmount: row.pitAmount?.negated() ?? null,
          vatPercent: row.vatPercent,
          pitPercent: row.pitPercent,
          taxCategory: row.taxCategory,
          sellerEntityType: row.sellerEntityType,
          taxSubjectType: row.taxSubjectType,
          sellerTaxId: row.sellerTaxId,
          sellerIdNumber: row.sellerIdNumber,
          sellerLegalName: row.sellerLegalName,
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

  /*
   * MỘT chỗ đọc thuế của snapshot (`feeTaxDetailOf`) cho cả mô hình một-mức cũ lẫn GTGT/TNCN tách
   * riêng (ADR 0068) — sổ thuế, bảng cộng ví và màn đối tác đọc cùng một con số.
   */
  const detail = feeTaxDetailOf(fees);
  const amount = new Prisma.Decimal(detail.taxAmount);
  if (amount.lte(0)) return null;

  const feePolicyId = fees.policy.policyId || fallbackFeePolicyId;
  if (!feePolicyId) return null;

  const split = detail.vatAmount != null && detail.pitAmount != null;
  const decimalOrNull = (value: number | null) =>
    value == null ? null : new Prisma.Decimal(value);
  return {
    amount,
    /*
     * Mẫu số — đúng con số `computeCustomerFees` đã nhân %: tiền thuê `R = B − G`, KHÔNG gồm phí
     * giao, bảo hiểm hay phí sàn (ADR 0064 điều 4). Đọc từ snapshot, không suy lại ở đây.
     */
    taxableBase: new Prisma.Decimal(detail.rentAmount),
    percent: new Prisma.Decimal(detail.totalPercent ?? 0),
    /*
     * Nhãn theo ĐÚNG cặp tỷ lệ đã áp ("GTGT 5% + TNCN 2%"); snapshot một-mức giữ nhãn chính sách
     * của nó.
     */
    label: (split && detail.vatPercent != null && detail.pitPercent != null
      ? taxRateLabel(detail.vatPercent, detail.pitPercent)
      : (fees.policy.taxLabel ?? 'Thuế khấu trừ')
    ).slice(0, 100),
    feePolicyId,
    vatAmount: split ? new Prisma.Decimal(detail.vatAmount!) : null,
    pitAmount: split ? new Prisma.Decimal(detail.pitAmount!) : null,
    vatPercent: split ? decimalOrNull(detail.vatPercent) : null,
    pitPercent: split ? decimalOrNull(detail.pitPercent) : null,
    taxCategory: split ? detail.taxCategory : null,
    taxSubjectType: detail.sellerEntityType,
  };
}
