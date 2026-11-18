import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  TAX_WITHHOLDING_STATUS,
  canTransitionTax,
  feeTaxDetailOf,
  isTaxPeriodEnded,
  isTaxPeriodKey,
  taxPeriodFilingEarliestDateKey,
  taxPeriodKeyVn,
  vnDateKey,
  taxRateLabel,
  type AuditActorScope,
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
/** Cột của một dòng thuế cần để ghi dòng ĐẢO của nó - một bản cho mọi lượt đảo. */
const TAX_REVERSAL_SELECT = {
  id: true,
  tenantId: true,
  bookingId: true,
  bookingExtensionId: true,
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
} satisfies Prisma.TaxWithholdingSelect;

type TaxReversalRow = Prisma.TaxWithholdingGetPayload<{ select: typeof TAX_REVERSAL_SELECT }>;

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
    return this.accrueWithinTx(tx, {
      bookingId: input.bookingId,
      bookingExtensionId: null,
      tenantId: input.tenantId,
      priceSnapshot: booking.priceSnapshot,
      feePolicyId: booking.feePolicyId,
      actorUserId: input.actorUserId,
      now: input.now,
    });
  }

  /**
   * Ghi nghĩa vụ thuế của một PHỤ LỤC GIA HẠN vừa hiệu lực (ADR 0077) — chuyến đã chạy nên thuế
   * phát sinh ngay lúc phụ lục có hiệu lực, trong transaction của lượt đối soát. Mỗi phụ lục MỘT
   * nghĩa vụ còn sống (`tax_withholdings_live_extension_key`); chạy lại ⇒ `null`, không ghi đôi.
   */
  async accrueForExtensionWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      bookingExtensionId: string;
      bookingId: string;
      tenantId: string;
      priceSnapshot: unknown;
      feePolicyId: string | null;
      actorUserId: string | null;
      now?: Date;
    },
  ): Promise<string | null> {
    return this.accrueWithinTx(tx, input);
  }

  /** Thân chung của hai đường ghi — một nơi chụp hồ sơ người bán và gác ghi đôi. */
  private async accrueWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      bookingId: string;
      /** `null` = nghĩa vụ của chính đơn. */
      bookingExtensionId: string | null;
      tenantId: string;
      priceSnapshot: unknown;
      feePolicyId: string | null;
      actorUserId: string | null;
      now?: Date;
    },
  ): Promise<string | null> {
    const snapshot = taxFromSnapshot(input.priceSnapshot, input.feePolicyId);
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
          bookingExtensionId: input.bookingExtensionId,
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
        this.logger.warn(
          input.bookingExtensionId
            ? `Phụ lục ${input.bookingExtensionId} đã có dòng thuế còn hiệu lực - bỏ qua`
            : `Đơn ${input.bookingId} đã có dòng thuế còn hiệu lực - bỏ qua`,
        );
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
      select: TAX_REVERSAL_SELECT,
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
        message: 'Đây đã là một dòng đảo - không đảo một bút toán đảo',
      });
    }
    if (!canTransitionTax(row.status as TaxWithholdingStatus, TAX_WITHHOLDING_STATUS.REVERSED)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Dòng thuế này không đảo được - tiền đã nộp thì sửa bằng tờ khai điều chỉnh',
        details: { status: row.status },
      });
    }

    return this.prisma.$transaction((tx) =>
      this.writeReversalWithinTx(tx, row, actorUserId, reason, AUDIT_ACTOR_SCOPE.PLATFORM),
    );
  }

  /**
   * ĐẢO mọi nghĩa vụ thuế CÒN SỐNG của một chuyến KHÔNG DIỄN RA - ADR 0104 điều 3: nền tảng gỡ một
   * lượt giao xe mà khách chưa từng nhận. Thuế phát sinh ở mốc giao xe (ADR 0032 điều 3); lượt giao
   * đó không có thật thì nghĩa vụ cũng không có, khác hẳn một chuyến đã chạy rồi kết thúc sớm (nghĩa
   * vụ GIỮ NGUYÊN - xem `BookingsService.transitionWithinTx`).
   *
   * Chạy TRONG transaction của người gọi. Một dòng đã `remitted` (tiền đã nộp) thì TỪ CHỐI cả lượt:
   * đó là việc của tờ khai điều chỉnh, không phải hệ quả của một nút kết luận.
   */
  async reverseLiveForBookingWithinTx(
    tx: Prisma.TransactionClient,
    input: { bookingId: string; actorUserId: string; reason: string },
  ): Promise<number> {
    const rows = await tx.taxWithholding.findMany({
      where: {
        bookingId: input.bookingId,
        reversalOfId: null,
        status: { not: TAX_WITHHOLDING_STATUS.REVERSED },
      },
      select: TAX_REVERSAL_SELECT,
    });
    for (const row of rows) {
      if (!canTransitionTax(row.status as TaxWithholdingStatus, TAX_WITHHOLDING_STATUS.REVERSED)) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message:
            'Thuế của chuyến này đã nộp - không gỡ lượt giao xe được, xử lý bằng tờ khai điều chỉnh',
          details: { status: row.status },
        });
      }
      await this.writeReversalWithinTx(
        tx,
        row,
        input.actorUserId,
        input.reason,
        AUDIT_ACTOR_SCOPE.PLATFORM,
      );
    }
    return rows.length;
  }

  /**
   * Ghi MỘT lượt đảo: lật dòng gốc sang `reversed` (có điều kiện `status` trong WHERE - hai lượt cùng
   * lúc thì đúng một bên thắng) rồi ghi dòng ÂM trỏ về nó, kèm audit. Dùng chung cho nút đảo tay của
   * admin và lượt gỡ giao xe - một cách đảo, không hai.
   */
  private async writeReversalWithinTx(
    tx: Prisma.TransactionClient,
    row: TaxReversalRow,
    actorUserId: string,
    reason: string,
    actorScope: AuditActorScope,
  ): Promise<string> {
    const id = row.id;
    const reversalId = newId();
    const claimed = await tx.taxWithholding.updateMany({
      where: { id, status: row.status, reversalOfId: null },
      data: { status: TAX_WITHHOLDING_STATUS.REVERSED },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Dòng thuế vừa được người khác xử lý - tải lại rồi thử lại',
      });
    }

    await tx.taxWithholding.create({
      data: {
        id: reversalId,
        bookingId: row.bookingId,
        bookingExtensionId: row.bookingExtensionId,
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
        actorScope,
        action: 'tax_withholding.reverse',
        targetType: 'tax_withholding',
        targetId: row.id,
        before: { status: row.status, amount: row.amount.toFixed(0) },
        after: { status: TAX_WITHHOLDING_STATUS.REVERSED, reversalId, reason },
      },
      tx,
    );

    return reversalId;
  }

  /**
   * KÊ KHAI cả một kỳ — `accrued → declared`, kèm chứng cứ (số tờ khai + ngày nộp tờ khai).
   *
   * Theo kỳ chứ không theo từng dòng vì đó là cách cơ quan thuế làm việc: một tờ khai cho một
   * tháng. Chỉ kỳ ĐÃ KẾT THÚC: kê khai giữa tháng là cắt đôi kỳ. Mỗi kỳ kê khai một lần — chứng cứ
   * nằm ở `tax_period_filings` (writer duy nhất là service này), ghi trong CÙNG transaction với
   * lượt lật trạng thái + audit.
   *
   * Kỳ không còn dòng `accrued` nào (đã kê khai trước khi có chứng cứ, hoặc tờ khai không phát sinh)
   * vẫn ghi được chứng cứ — lượt lật trạng thái khi đó là 0 dòng.
   */
  async declarePeriod(
    periodKey: string,
    actorUserId: string,
    evidence: { declarationRef: string; declaredOn: string },
    now: Date = new Date(),
  ): Promise<{ updated: number }> {
    assertPeriodFileable(periodKey, now);
    assertFilingDate(periodKey, evidence.declaredOn, now, 'declaredOn');
    const declarationRef = evidence.declarationRef.trim();

    return this.prisma.$transaction(async (tx) => {
      await ensureFilingRowWithinTx(tx, periodKey);
      // Có điều kiện `declaration_ref IS NULL`: hai người cùng bấm thì đúng một người ghi được.
      const claimed = await tx.taxPeriodFiling.updateMany({
        where: { periodKey, declarationRef: null },
        data: {
          declarationRef,
          declaredOn: dateKeyToDbDate(evidence.declaredOn),
          declaredBy: actorUserId,
          declaredAt: now,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.TAX_PERIOD_ALREADY_DECLARED,
          message: 'Kỳ thuế này đã được ghi kê khai',
          details: { periodKey },
        });
      }

      const { count } = await tx.taxWithholding.updateMany({
        where: { periodKey, status: TAX_WITHHOLDING_STATUS.ACCRUED },
        data: { status: TAX_WITHHOLDING_STATUS.DECLARED, declaredAt: now },
      });
      /*
       * Audit KHÔNG gắn `tenantId`: đây là hành động của nền tảng trên một KỲ, không trên một
       * gian hàng. Gắn tenant nào đó sẽ làm sổ audit của họ có một dòng họ không gây ra.
       */
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: `tax_period.${TAX_WITHHOLDING_STATUS.DECLARED}`,
          targetType: 'tax_period',
          targetId: periodKey,
          after: {
            periodKey,
            from: TAX_WITHHOLDING_STATUS.ACCRUED,
            to: TAX_WITHHOLDING_STATUS.DECLARED,
            updated: count,
            declarationRef,
            declaredOn: evidence.declaredOn,
          },
        },
        tx,
      );
      return { updated: count };
    });
  }

  /**
   * NỘP thuế cả một kỳ — `declared → remitted`, kèm chứng cứ (mã chứng từ, ngày nộp, số đã nộp).
   *
   * Không có đường "nộp mà chưa khai": kỳ còn dòng `accrued` thì từ chối. Số đã nộp được phép lệch
   * tổng trên sổ (người dùng chốt 16/11/2026) nhưng khi đó ghi chú là BẮT BUỘC; tổng trên sổ được
   * chụp lại (`ledger_amount`) để phần lệch luôn đọc được về sau.
   *
   * Tổng trên sổ = mọi dòng `remitted` của kỳ SAU lượt lật — gồm cả dòng đã nộp trước khi có chứng
   * cứ (kỳ cũ), để lượt ghi chứng cứ cho kỳ cũ không đo nhầm thành 0.
   */
  async remitPeriod(
    periodKey: string,
    actorUserId: string,
    evidence: {
      remittanceRef: string;
      remittedOn: string;
      remittedAmount: string;
      note?: string | null;
    },
    now: Date = new Date(),
  ): Promise<{ updated: number }> {
    assertPeriodFileable(periodKey, now);
    assertFilingDate(periodKey, evidence.remittedOn, now, 'remittedOn');
    const remittanceRef = evidence.remittanceRef.trim();
    const note = evidence.note?.trim() || null;
    const remittedAmount = new Prisma.Decimal(evidence.remittedAmount);
    if (!remittedAmount.isInteger() || remittedAmount.lte(0)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Số tiền đã nộp phải là số nguyên dương',
        details: { field: 'remittedAmount' },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Đọc trước để trả đúng lý do; chốt chặn thật là câu ghi có điều kiện ở cuối.
      const existing = await tx.taxPeriodFiling.findUnique({
        where: { periodKey },
        select: { remittanceRef: true },
      });
      if (existing?.remittanceRef) {
        throw new ConflictException({
          code: API_ERROR_CODE.TAX_PERIOD_ALREADY_REMITTED,
          message: 'Kỳ thuế này đã được ghi nộp',
          details: { periodKey },
        });
      }
      const accruedRows = await tx.taxWithholding.count({
        where: { periodKey, status: TAX_WITHHOLDING_STATUS.ACCRUED },
      });
      if (accruedRows > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.TAX_PERIOD_NOT_DECLARED,
          message: 'Kỳ thuế này còn dòng chưa kê khai',
          details: { accruedRows },
        });
      }
      await ensureFilingRowWithinTx(tx, periodKey);

      /*
       * Lật dòng TRƯỚC rồi mới ghi chứng cứ có điều kiện: hai người cùng bấm thì người sau chờ khoá
       * dòng của người trước, thấy 0 dòng còn `declared`, và thua ở câu ghi chứng cứ bên dưới —
       * cả transaction của họ cuộn lại.
       */
      const { count } = await tx.taxWithholding.updateMany({
        where: { periodKey, status: TAX_WITHHOLDING_STATUS.DECLARED },
        data: { status: TAX_WITHHOLDING_STATUS.REMITTED, remittedAt: now },
      });
      const ledger = await tx.taxWithholding.aggregate({
        where: { periodKey, status: TAX_WITHHOLDING_STATUS.REMITTED },
        _sum: { amount: true },
      });
      const ledgerAmount = ledger._sum.amount ?? new Prisma.Decimal(0);
      if (ledgerAmount.lte(0)) {
        throw new ConflictException({
          code: API_ERROR_CODE.TAX_PERIOD_NOT_DECLARED,
          message: 'Kỳ thuế này không có khoản đã kê khai nào để nộp',
          details: { accruedRows: 0 },
        });
      }
      if (!remittedAmount.eq(ledgerAmount) && !note) {
        throw new BadRequestException({
          code: API_ERROR_CODE.TAX_REMITTANCE_NOTE_REQUIRED,
          message: 'Số đã nộp khác tổng thuế trên sổ của kỳ - cần ghi chú giải thích',
          details: {
            ledgerAmount: ledgerAmount.toFixed(0),
            remittedAmount: remittedAmount.toFixed(0),
          },
        });
      }

      const claimed = await tx.taxPeriodFiling.updateMany({
        where: { periodKey, remittanceRef: null },
        data: {
          remittanceRef,
          remittedOn: dateKeyToDbDate(evidence.remittedOn),
          remittedAmount,
          ledgerAmount,
          remittanceNote: note,
          remittedBy: actorUserId,
          remittedAt: now,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.TAX_PERIOD_ALREADY_REMITTED,
          message: 'Kỳ thuế này đã được ghi nộp',
          details: { periodKey },
        });
      }

      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: `tax_period.${TAX_WITHHOLDING_STATUS.REMITTED}`,
          targetType: 'tax_period',
          targetId: periodKey,
          after: {
            periodKey,
            from: TAX_WITHHOLDING_STATUS.DECLARED,
            to: TAX_WITHHOLDING_STATUS.REMITTED,
            updated: count,
            remittanceRef,
            remittedOn: evidence.remittedOn,
            remittedAmount: remittedAmount.toFixed(0),
            ledgerAmount: ledgerAmount.toFixed(0),
            note,
          },
        },
        tx,
      );
      return { updated: count };
    });
  }
}

// ── Chứng cứ theo kỳ ────────────────────────────────────────────────────────

/** Kỳ đúng dạng VÀ đã kết thúc (giờ VN) — chỉ khi đó mới kê khai / nộp được. */
function assertPeriodFileable(periodKey: string, now: Date): void {
  if (!isTaxPeriodKey(periodKey)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Kỳ thuế phải có dạng YYYY-MM',
      details: { field: 'period' },
    });
  }
  if (!isTaxPeriodEnded(periodKey, now)) {
    throw new ConflictException({
      code: API_ERROR_CODE.TAX_PERIOD_NOT_ENDED,
      message: 'Kỳ thuế này chưa kết thúc - chỉ kê khai và nộp được sau khi hết tháng',
      details: { periodKey },
    });
  }
}

/**
 * Ngày trên chứng từ phải là một ngày THẬT, không trước ngày đầu tháng sau kỳ, không sau hôm nay
 * (giờ VN). Ngày ngoài khoảng đó là nhập nhầm kỳ hoặc nhầm năm.
 */
function assertFilingDate(periodKey: string, dateKey: string, now: Date, field: string): void {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  const real = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
  if (!real || dateKey < taxPeriodFilingEarliestDateKey(periodKey) || dateKey > vnDateKey(now)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Ngày trên chứng từ phải từ ngày đầu tháng sau kỳ tới hôm nay',
      details: { field },
    });
  }
}

/** Cột `DATE` của Prisma nhận nửa đêm UTC của ngày lịch (như `platform_bank_balances.date`). */
function dateKeyToDbDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Bảo đảm kỳ có dòng chứng cứ (rỗng) để lượt ghi có điều kiện bên dưới có hàng mà khoá. */
async function ensureFilingRowWithinTx(
  tx: Prisma.TransactionClient,
  periodKey: string,
): Promise<void> {
  // `ON CONFLICT DO NOTHING` — một lỗi unique giữa transaction Postgres sẽ làm hỏng cả transaction.
  await tx.taxPeriodFiling.createMany({ data: [{ periodKey }], skipDuplicates: true });
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
