import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  DEPOSIT_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PAYMENT_KIND,
  PAYMENT_STATUS,
  RECEIPT_SOURCE,
  RECEIPT_TYPE,
  SURCHARGE_CATEGORY,
  SYSTEM_FINANCE_CATEGORY,
  type BookingStatus,
  type DepositStatus,
  type PaymentMethod,
} from '@xeprime/types';
import { formatVnd } from '../../../common/money';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ReceiptsService } from '../../finance/receipts.service';
import { NotificationService } from '../../notification/notification.service';
import { PricingService } from '../../pricing/pricing.service';
import {
  BookingSettlementDto,
  BookingSurchargeDto,
  CorrectDepositRefundDto,
  OvertimeSuggestionDto,
  RecordDepositRefundDto,
  SaveSurchargeDto,
  VoidSurchargeDto,
} from './dto/settlement.dto';

const ZERO = new Prisma.Decimal(0);
const MINUTES_PER_HOUR = 60;

const SURCHARGE_SELECT = {
  id: true,
  category: true,
  amount: true,
  reason: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BookingSurchargeSelect;

type SurchargeRow = Prisma.BookingSurchargeGetPayload<{ select: typeof SURCHARGE_SELECT }>;

/**
 * Quyết toán cuối chuyến (Wave 10) — phát sinh + hoàn cọc thủ công.
 *
 * Ba ranh giới đóng đinh ở đây:
 *
 *  - **`depositRequired` ≠ `depositReceived`.** Cái đầu là số cấu hình trên đơn, cái sau là tiền
 *    THẬT đã thu (`payments.kind = 'deposit'`). Chỉ cái sau mới đẻ ra việc hoàn cọc — tạo việc
 *    "hoàn 5 triệu" cho khoản chưa ai thu là cách nhanh nhất để chủ xe mất tiền thật.
 *  - **Ghi phát sinh KHÔNG phải một giao dịch.** Không sinh phiếu, không đụng `paid_amount`,
 *    không chuyển khoản. Nó chỉ nuôi phép tính đề xuất hoàn cọc. Phụ phí là một KHOẢN ĐÒI, tiền
 *    chỉ thật sự chuyển động khi khách trả thêm (phiếu thu) hoặc khi bị trừ vào cọc — mà phiếu
 *    chi hoàn cọc đã là số RÒNG. Sinh thêm phiếu cho phụ phí là đếm một đồng hai lần.
 *  - **Hoàn cọc là GHI NHẬN, nhưng CÓ lên sổ.** Tiền đi bằng chuyển khoản/tiền mặt ngoài hệ
 *    thống — XePrime không có cổng thanh toán và không được nói như thể có. Nhưng đó vẫn là tiền
 *    rời tay chủ xe, nên nó thành một phiếu CHI trong cùng transaction (epic nối tiền).
 *
 * Mọi phép tính tiền dùng `Prisma.Decimal` — không bao giờ số thực JS (ADR 0007).
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationService,
    private readonly receipts: ReceiptsService,
  ) {}

  async get(tenantId: string, bookingId: string): Promise<BookingSettlementDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    return this.build(tenantId, booking);
  }

  // ── Phát sinh ─────────────────────────────────────────────────────────────

  async addSurcharge(
    tenantId: string,
    bookingId: string,
    userId: string,
    dto: SaveSurchargeDto,
  ): Promise<BookingSettlementDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const id = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSurcharge.create({
        data: {
          id,
          tenantId,
          bookingId,
          category: dto.category,
          amount: new Prisma.Decimal(dto.amount),
          reason: dto.reason.trim(),
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.surcharge.create',
          targetType: 'booking_surcharge',
          targetId: id,
          after: { bookingId, category: dto.category, amount: dto.amount, reason: dto.reason },
        },
        tx,
      );

      /*
       * KHÔNG báo cho khách (Wave 11.1). Ghi phát sinh là việc chủ xe làm nhiều lần trong lúc
       * quyết toán — thêm, sửa số, gỡ đi rồi ghi lại — và mỗi bước bắn một tin biến hộp thư của
       * khách thành nhật ký thao tác của người khác. Khách không duyệt phát sinh, nên tin nhắn
       * đó cũng không mở ra hành động nào.
       *
       * Minh bạch vẫn giữ nguyên: `GET /trips/:id` luôn tính lại từ dữ liệu mới nhất, kèm lý do
       * từng khoản. Audit ở trên là nơi truy vết đầy đủ.
       */
    });

    return this.build(tenantId, booking);
  }

  async updateSurcharge(
    tenantId: string,
    bookingId: string,
    surchargeId: string,
    userId: string,
    dto: SaveSurchargeDto,
  ): Promise<BookingSettlementDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const current = await this.requireSurcharge(tenantId, bookingId, surchargeId);

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSurcharge.update({
        where: { id: current.id },
        data: {
          category: dto.category,
          amount: new Prisma.Decimal(dto.amount),
          reason: dto.reason.trim(),
          updatedBy: userId,
        },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.surcharge.update',
          targetType: 'booking_surcharge',
          targetId: current.id,
          before: {
            category: current.category,
            amount: current.amount.toFixed(2),
            reason: current.reason,
          },
          after: { category: dto.category, amount: dto.amount, reason: dto.reason },
        },
        tx,
      );
    });

    return this.build(tenantId, booking);
  }

  /**
   * Gỡ một khoản — huỷ MỀM. Xoá cứng làm mất bằng chứng "đã từng trừ tiền khách rồi rút lại",
   * đúng thứ cần nhất khi có khiếu nại.
   */
  async voidSurcharge(
    tenantId: string,
    bookingId: string,
    surchargeId: string,
    userId: string,
    dto: VoidSurchargeDto,
  ): Promise<BookingSettlementDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const current = await this.requireSurcharge(tenantId, bookingId, surchargeId);

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSurcharge.update({
        where: { id: current.id },
        data: {
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: dto.reason.trim(),
          updatedBy: userId,
        },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.surcharge.void',
          targetType: 'booking_surcharge',
          targetId: current.id,
          before: { amount: current.amount.toFixed(2), category: current.category },
          after: { voided: true, reason: dto.reason },
        },
        tx,
      );
    });

    return this.build(tenantId, booking);
  }

  // ── Hoàn cọc ──────────────────────────────────────────────────────────────

  async recordRefund(
    tenantId: string,
    bookingId: string,
    userId: string,
    dto: RecordDepositRefundDto,
  ): Promise<BookingSettlementDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const existing = await this.prisma.bookingDepositSettlement.findUnique({
      where: { bookingId },
    });
    if (existing) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Đơn này đã có bản ghi hoàn cọc — dùng chức năng điều chỉnh nếu cần sửa',
      });
    }

    const snapshot = await this.moneySnapshot(tenantId, bookingId, booking.depositAmount);
    const refundAmount = this.assertRefundable(dto, snapshot.depositReceived);
    const refundedAt = this.assertRefundTime(dto.refundedAt);

    const id = newId();
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingDepositSettlement.create({
        data: {
          id,
          tenantId,
          bookingId,
          // Chụp lại tại thời điểm ghi nhận: thêm phát sinh sau đó KHÔNG được sửa lịch sử
          // "đã hoàn bao nhiêu, dựa trên cái gì".
          depositReceived: snapshot.depositReceived,
          surchargeTotal: snapshot.surchargeTotal,
          refundAmount,
          refundMethod: dto.refundMethod,
          refundedAt,
          reference: dto.reference?.trim() || null,
          note: dto.note?.trim() || null,
          recordedBy: userId,
        },
      });

      // Tiền RỜI TAY chủ xe ⇒ phải là một dòng chi trong sổ, cùng transaction với bản ghi hoàn
      // cọc. Số ở đây đã là số RÒNG (cọc đã thu − phát sinh), nên phụ phí không cần dòng riêng —
      // ghi thêm một phiếu cho phụ phí là đếm cùng một đồng hai lần.
      //
      // Hoàn 0đ (phát sinh nuốt trọn cọc) thì không có đồng nào di chuyển: không sinh phiếu.
      if (refundAmount.greaterThan(0)) {
        await this.receipts.createApprovedWithinTx(tx, tenantId, userId, {
          type: RECEIPT_TYPE.EXPENSE,
          amount: refundAmount.toFixed(2),
          // `REFUND_METHOD` là tập con của `PAYMENT_METHOD` (bank_transfer | cash | other).
          paymentMethod: dto.refundMethod as PaymentMethod,
          source: RECEIPT_SOURCE.DEPOSIT_REFUND,
          sourceRefId: id,
          categoryKey: SYSTEM_FINANCE_CATEGORY.DEPOSIT_REFUND,
          bookingId,
          vehicleId: booking.vehicleId,
          tenantCustomerId: booking.tenantCustomerId,
          occurredAt: refundedAt,
          referenceCode: dto.reference?.trim() || null,
          description: `Hoàn cọc đơn ${booking.code}`,
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.deposit_refund.record',
          targetType: 'booking',
          targetId: bookingId,
          after: {
            refundAmount: refundAmount.toFixed(2),
            refundMethod: dto.refundMethod,
            refundedAt: refundedAt.toISOString(),
            depositReceived: snapshot.depositReceived.toFixed(2),
            surchargeTotal: snapshot.surchargeTotal.toFixed(2),
            ...(dto.reference ? { reference: dto.reference } : {}),
          },
        },
        tx,
      );

      // Tiền về túi khách là tin khách chờ nhất — nhưng nói đúng sự thật: đây là chủ xe ĐÃ
      // chuyển bên ngoài rồi đánh dấu lại, không phải hệ thống vừa chuyển khoản.
      await this.notifyCustomer(tx, tenantId, bookingId, {
        title: 'Chủ xe đã đánh dấu hoàn cọc',
        body: `Số tiền hoàn ${formatVnd(refundAmount)}. Vui lòng đối chiếu với tài khoản của bạn.`,
      });
    });

    return this.build(tenantId, booking);
  }

  /** Sửa bản ghi đã hoàn — quyền cao hơn, lý do bắt buộc, audit giữ CẢ giá trị cũ. */
  async correctRefund(
    tenantId: string,
    bookingId: string,
    userId: string,
    dto: CorrectDepositRefundDto,
  ): Promise<BookingSettlementDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const existing = await this.prisma.bookingDepositSettlement.findUnique({
      where: { bookingId },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Chưa có bản ghi hoàn cọc cho đơn này',
      });
    }

    const refundAmount = this.assertRefundable(dto, existing.depositReceived);
    const refundedAt = this.assertRefundTime(dto.refundedAt);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookingDepositSettlement.updateMany({
        where: { id: existing.id, tenantId, rowVersion: dto.expectedRowVersion },
        data: {
          refundAmount,
          refundMethod: dto.refundMethod,
          refundedAt,
          reference: dto.reference?.trim() || null,
          note: dto.note?.trim() || null,
          recordedBy: userId,
          rowVersion: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Bản ghi đã thay đổi ở nơi khác — tải lại rồi thử lại',
        });
      }

      // Sổ đi theo bản ghi. Sửa TẠI CHỖ chứ không huỷ-rồi-tạo-lại: unique index
      // (tenant_id, source, source_ref_id) phủ cả dòng đã huỷ, nên tạo lại sẽ đụng constraint.
      await this.syncRefundReceipt(tx, tenantId, userId, {
        settlementId: existing.id,
        bookingId,
        bookingCode: booking.code,
        vehicleId: booking.vehicleId,
        tenantCustomerId: booking.tenantCustomerId,
        refundAmount,
        refundMethod: dto.refundMethod,
        refundedAt,
        reference: dto.reference?.trim() || null,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.deposit_refund.correct',
          targetType: 'booking',
          targetId: bookingId,
          before: {
            refundAmount: existing.refundAmount.toFixed(2),
            refundMethod: existing.refundMethod,
            refundedAt: existing.refundedAt.toISOString(),
            reference: existing.reference,
          },
          after: {
            refundAmount: refundAmount.toFixed(2),
            refundMethod: dto.refundMethod,
            refundedAt: refundedAt.toISOString(),
            reference: dto.reference?.trim() || null,
            reason: dto.correctionReason,
          },
        },
        tx,
      );
    });

    return this.build(tenantId, booking);
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  /**
   * Đưa phiếu chi hoàn cọc về khớp với bản ghi hoàn cọc sau khi sửa.
   *
   * Ba chuyển tiếp, cả ba đều phải đúng:
   *  - **0đ → có tiền**: lần ghi đầu không sinh phiếu (không đồng nào di chuyển), sửa lên số dương
   *    thì bây giờ mới sinh.
   *  - **có tiền → số khác**: sửa tại chỗ (unique index phủ cả dòng đã huỷ, không tạo lại được).
   *  - **có tiền → 0đ**: huỷ phiếu — sổ không được giữ một khoản chi đã bị rút lại.
   */
  private async syncRefundReceipt(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    input: {
      settlementId: string;
      bookingId: string;
      bookingCode: string;
      vehicleId: string;
      tenantCustomerId: string | null;
      refundAmount: Prisma.Decimal;
      refundMethod: string;
      refundedAt: Date;
      reference: string | null;
    },
  ): Promise<void> {
    if (input.refundAmount.lessThanOrEqualTo(0)) {
      await this.receipts.cancelBySourceWithinTx(
        tx,
        tenantId,
        RECEIPT_SOURCE.DEPOSIT_REFUND,
        input.settlementId,
        userId,
      );
      return;
    }

    const touched = await this.receipts.updateAmountWithinTx(
      tx,
      tenantId,
      RECEIPT_SOURCE.DEPOSIT_REFUND,
      input.settlementId,
      userId,
      {
        amount: input.refundAmount.toFixed(2),
        occurredAt: input.refundedAt,
        referenceCode: input.reference,
      },
    );
    if (touched > 0) return;

    await this.receipts.createApprovedWithinTx(tx, tenantId, userId, {
      type: RECEIPT_TYPE.EXPENSE,
      amount: input.refundAmount.toFixed(2),
      paymentMethod: input.refundMethod as PaymentMethod,
      source: RECEIPT_SOURCE.DEPOSIT_REFUND,
      sourceRefId: input.settlementId,
      categoryKey: SYSTEM_FINANCE_CATEGORY.DEPOSIT_REFUND,
      bookingId: input.bookingId,
      vehicleId: input.vehicleId,
      tenantCustomerId: input.tenantCustomerId,
      occurredAt: input.refundedAt,
      referenceCode: input.reference,
      description: `Hoàn cọc đơn ${input.bookingCode}`,
    });
  }

  private async requireBooking(tenantId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        status: true,
        vehicleId: true,
        tenantCustomerId: true,
        depositAmount: true,
        returnAt: true,
        actualReturnAt: true,
      },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đơn',
      });
    }
    return booking;
  }

  /**
   * Báo cho KHÁCH của chuyến, nếu chuyến gắn với một tài khoản.
   *
   * Chỉ còn MỘT nơi gọi: **hoàn cọc đã ghi nhận**. Đó là tiền rời khỏi tay chủ xe và khách phải
   * đi đối chiếu tài khoản — khác hẳn phí giao nhận / phát sinh, những thứ hai bên đã thống
   * nhất trước và khách không có gì để làm khi nhận tin (Wave 11.1).
   *
   * Đi qua đúng kho thông báo đã có (`NotificationService`) và trỏ vào `booking` — link
   * click-through của khách phân giải id đơn thành `/trips/:id`. Khách vãng lai chưa có tài
   * khoản thì im lặng bỏ qua: không có ai để gửi, và đó không phải lỗi.
   */
  private async notifyCustomer(
    tx: Prisma.TransactionClient,
    tenantId: string,
    bookingId: string,
    payload: { title: string; body: string },
  ): Promise<void> {
    const request = await tx.bookingRequest.findFirst({
      where: { bookingId },
      select: { customerUserId: true },
    });
    if (!request?.customerUserId) return;

    await this.notifications.emitToUser(
      request.customerUserId,
      {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: payload.title,
        body: payload.body,
        tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: bookingId,
      },
      tx,
    );
  }

  private async requireSurcharge(tenantId: string, bookingId: string, surchargeId: string) {
    const row = await this.prisma.bookingSurcharge.findFirst({
      // Ràng buộc tenant + đơn ngay trong WHERE: id của gian hàng khác đơn giản là không tồn tại.
      where: { id: surchargeId, tenantId, bookingId, voidedAt: null },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy khoản phát sinh',
      });
    }
    return row;
  }

  /** Cọc đã THU + tổng phát sinh còn hiệu lực — hai con số nuôi mọi phép tính còn lại. */
  private async moneySnapshot(
    tenantId: string,
    bookingId: string,
    depositRequired: Prisma.Decimal,
  ): Promise<{
    depositRequired: Prisma.Decimal;
    depositReceived: Prisma.Decimal;
    surchargeTotal: Prisma.Decimal;
    surcharges: SurchargeRow[];
  }> {
    const [deposits, surcharges] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          bookingId,
          kind: PAYMENT_KIND.DEPOSIT,
          status: PAYMENT_STATUS.SUCCEEDED,
        },
        _sum: { amount: true },
      }),
      this.prisma.bookingSurcharge.findMany({
        where: { tenantId, bookingId, voidedAt: null },
        orderBy: { createdAt: 'asc' },
        select: SURCHARGE_SELECT,
      }),
    ]);

    const surchargeTotal = surcharges.reduce(
      (sum, row) => sum.plus(row.amount),
      new Prisma.Decimal(0),
    );

    return {
      depositRequired,
      depositReceived: deposits._sum.amount ?? ZERO,
      surchargeTotal,
      surcharges,
    };
  }

  private async build(
    tenantId: string,
    booking: {
      id: string;
      status: string;
      vehicleId: string;
      depositAmount: Prisma.Decimal;
      returnAt: Date;
      actualReturnAt: Date | null;
    },
  ): Promise<BookingSettlementDto> {
    const [snapshot, settlement, overtime] = await Promise.all([
      this.moneySnapshot(tenantId, booking.id, booking.depositAmount),
      this.prisma.bookingDepositSettlement.findUnique({ where: { bookingId: booking.id } }),
      this.overtimeSuggestion(tenantId, booking),
    ]);

    const names = await this.actorNames([
      ...snapshot.surcharges.map((row) => row.createdBy),
      settlement?.recordedBy ?? null,
    ]);

    // Công thức chốt ở docs/design/14 §4.2 — kẹp sàn 0 ở cả hai chiều.
    const proposedRefund = Prisma.Decimal.max(
      0,
      snapshot.depositReceived.minus(snapshot.surchargeTotal),
    );
    const additionalDue = Prisma.Decimal.max(
      0,
      snapshot.surchargeTotal.minus(snapshot.depositReceived),
    );

    return {
      bookingId: booking.id,
      depositRequired: snapshot.depositRequired.toFixed(2),
      depositReceived: snapshot.depositReceived.toFixed(2),
      surcharges: snapshot.surcharges.map((row) => toSurchargeDto(row, names)),
      surchargeTotal: snapshot.surchargeTotal.toFixed(2),
      proposedRefund: proposedRefund.toFixed(2),
      additionalDue: additionalDue.toFixed(2),
      depositStatus: depositStatusOf({
        bookingStatus: booking.status as BookingStatus,
        depositRequired: snapshot.depositRequired,
        depositReceived: snapshot.depositReceived,
        proposedRefund,
        refunded: settlement?.refundAmount ?? null,
      }),
      refund: settlement
        ? {
            refundAmount: settlement.refundAmount.toFixed(2),
            refundMethod: settlement.refundMethod,
            refundedAt: settlement.refundedAt.toISOString(),
            reference: settlement.reference,
            note: settlement.note,
            recordedByName: settlement.recordedBy
              ? (names.get(settlement.recordedBy) ?? null)
              : null,
            rowVersion: settlement.rowVersion,
          }
        : null,
      overtime,
    };
  }

  /**
   * Đề xuất phí quá giờ từ chính sách hiệu lực + giờ trả THỰC TẾ.
   *
   * `available: false` khi chưa cấu hình phí quá giờ hoặc chưa có giờ trả thực tế — nói rõ là
   * chưa đủ dữ liệu, KHÔNG dựng một con số 0 trông như "không quá giờ".
   */
  private async overtimeSuggestion(
    tenantId: string,
    booking: { vehicleId: string; returnAt: Date; actualReturnAt: Date | null },
  ): Promise<OvertimeSuggestionDto> {
    const empty: OvertimeSuggestionDto = {
      available: false,
      lateMinutes: 0,
      chargedHours: 0,
      feePerHour: null,
      amount: null,
      formula: null,
    };
    if (!booking.actualReturnAt) return empty;

    const policy = await this.pricing.effectivePolicy(tenantId, booking.vehicleId);
    const feePerHour = policy?.values.overtimeFeePerHour ?? null;
    if (!feePerHour) return empty;

    const grace = policy?.values.overtimeGraceMinutes ?? 0;
    const rounding = policy?.values.overtimeRoundingMinutes ?? MINUTES_PER_HOUR;
    const rawMinutes = Math.floor(
      (booking.actualReturnAt.getTime() - booking.returnAt.getTime()) / 60_000,
    );
    const lateMinutes = Math.max(0, rawMinutes - grace);
    if (lateMinutes <= 0) {
      return { ...empty, available: true, feePerHour, amount: '0', formula: 'Trả đúng hẹn' };
    }

    const step = rounding > 0 ? rounding : MINUTES_PER_HOUR;
    const roundedMinutes = Math.ceil(lateMinutes / step) * step;
    const chargedHours = roundedMinutes / MINUTES_PER_HOUR;
    const amount = new Prisma.Decimal(feePerHour).mul(chargedHours);

    return {
      available: true,
      lateMinutes,
      chargedHours,
      feePerHour,
      amount: amount.toFixed(2),
      formula: `Trễ ${lateMinutes} phút → tính ${chargedHours} giờ × ${feePerHour}đ/giờ`,
    };
  }

  /** Không hoàn quá số đã thu — đây là trả lại cọc, không phải một khoản chi mới. */
  private assertRefundable(
    dto: RecordDepositRefundDto,
    depositReceived: Prisma.Decimal,
  ): Prisma.Decimal {
    const amount = new Prisma.Decimal(dto.refundAmount);
    if (depositReceived.lessThanOrEqualTo(0)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Đơn này chưa ghi nhận thu cọc — không có gì để hoàn',
      });
    }
    if (amount.greaterThan(depositReceived)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Số tiền hoàn không được lớn hơn tiền cọc đã thu',
        details: {
          fields: [{ field: 'refundAmount', message: 'Vượt quá tiền cọc đã thu' }],
          depositReceived: depositReceived.toFixed(2),
        },
      });
    }
    return amount;
  }

  private assertRefundTime(value?: string): Date {
    const at = value ? new Date(value) : new Date();
    if (at.getTime() > Date.now() + 2 * 60 * 1000) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm hoàn cọc không thể ở tương lai',
        details: { fields: [{ field: 'refundedAt', message: 'Chọn thời điểm không ở tương lai' }] },
      });
    }
    return at;
  }

  private async actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean) as string[])];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
}

function toSurchargeDto(row: SurchargeRow, names: Map<string, string>): BookingSurchargeDto {
  return {
    id: row.id,
    category: row.category,
    amount: row.amount.toFixed(2),
    reason: row.reason,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Trạng thái cọc — thứ tự kiểm quan trọng, và mỗi nhánh phải nói đúng về MỘT khoản tiền thật.
 *
 * Hai chỗ từng sai và đã sửa ở Wave 11.1:
 *
 *  - **Đã thu cọc nhưng chuyến chưa xong** từng trả `NONE`, khiến một đơn đang giữ 5 triệu hiện
 *    nhãn `Không có cọc`. Giờ là `RECEIVED` — tiền đang được giữ, đúng vai trò của nó.
 *  - **Phát sinh ăn hết cọc** từng cũng rơi vào nhánh "chờ hoàn" với số 0, mời chủ xe đi hoàn
 *    một khoản không tồn tại. Giờ là `SETTLED` — đã dùng xong, không còn gì để trả lại.
 *
 * `NOT_RECEIVED` vẫn phải đứng TRƯỚC mọi nhánh hoàn tiền: có yêu cầu cọc mà chưa ghi nhận thu
 * thì không có việc hoàn cọc nào cả (docs/design/14 §5.1).
 */
function depositStatusOf(input: {
  bookingStatus: BookingStatus;
  depositRequired: Prisma.Decimal;
  depositReceived: Prisma.Decimal;
  proposedRefund: Prisma.Decimal;
  refunded: Prisma.Decimal | null;
}): DepositStatus {
  if (input.depositReceived.lessThanOrEqualTo(0)) {
    return input.depositRequired.greaterThan(0) ? DEPOSIT_STATUS.NOT_RECEIVED : DEPOSIT_STATUS.NONE;
  }

  if (input.refunded !== null) {
    return input.refunded.greaterThanOrEqualTo(input.proposedRefund)
      ? DEPOSIT_STATUS.REFUNDED
      : DEPOSIT_STATUS.PARTIALLY_REFUNDED;
  }

  // Chuyến chưa kết thúc: cọc đang được GIỮ, chưa tới lúc nói chuyện hoàn lại.
  if (input.bookingStatus !== BOOKING_STATUS.COMPLETED) return DEPOSIT_STATUS.RECEIVED;

  // Xong chuyến: còn gì để trả thì chờ hoàn, hết sạch vào phát sinh thì coi như đã quyết toán.
  return input.proposedRefund.greaterThan(0)
    ? DEPOSIT_STATUS.AWAITING_REFUND
    : DEPOSIT_STATUS.SETTLED;
}

/** Re-export để controller khai kiểu mà không phải import chéo DTO. */
export type { BookingSettlementDto };
export { SURCHARGE_CATEGORY };
