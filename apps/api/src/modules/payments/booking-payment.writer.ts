import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PAYMENT_KIND,
  PAYMENT_STATUS,
  RECEIPT_SOURCE,
  RECEIPT_TYPE,
  SYSTEM_FINANCE_CATEGORY,
  type PaymentKind,
  type PaymentMethod,
} from '@xeprime/types';
import { loadCounterDueAmount, loadNetDepositReceived } from '../../common/booking-money';
import { assertBookingMoneyOpenWithinTx } from '../../common/booking-money-gate';
import { AuditService } from '../audit/audit.service';
import { ReceiptsService } from '../finance/receipts.service';

export interface RecordBookingPaymentInput {
  tenantId: string;
  userId: string;
  booking: { id: string; code: string; vehicleId: string; tenantCustomerId: string | null };
  amount: Prisma.Decimal;
  method: PaymentMethod;
  kind: PaymentKind;
  paidAt: Date;
  description?: string;
  referenceCode?: string | null;
  /** Nguồn của lượt ghi trong audit — `payments` (hộp Thu tiền) hay một bước khác gọi vào. */
  via?: string;
}

export interface AdjustDepositCollectedInput {
  tenantId: string;
  userId: string;
  bookingId: string;
  /** Số cọc ĐÃ THU mong muốn (ròng) sau lượt điều chỉnh. */
  collectedAmount: Prisma.Decimal;
  method: PaymentMethod;
}

export interface AdjustDepositCollectedResult {
  previous: Prisma.Decimal;
  collected: Prisma.Decimal;
  /** `> 0` thu thêm, `< 0` trả lại khách, `0` không ghi gì. */
  diff: Prisma.Decimal;
  paymentId: string | null;
}

/**
 * Lõi ghi MỘT lần thu tiền của đơn — chạy trong transaction của NGƯỜI GỌI.
 *
 * Tách khỏi `PaymentsService` để lượt nhận lại xe (`HandoversService`) ghi phiếu thu trong CÙNG
 * transaction với biên bản trả xe (06/11/2026) mà không import `PaymentsModule` — module đó phụ
 * thuộc `BookingsModule`, gọi ngược là một vòng. Module của writer là LÁ (chỉ Finance + Audit).
 *
 * Vẫn là writer DUY NHẤT của `payments` và của phần `paid_amount` do gian hàng ghi: `PaymentsService`
 * cũng đi qua đây, nên hai đường không thể ghi hai kiểu.
 */
@Injectable()
export class BookingPaymentWriter {
  constructor(
    private readonly audit: AuditService,
    private readonly receipts: ReceiptsService,
  ) {}

  async recordWithinTx(
    tx: Prisma.TransactionClient,
    input: RecordBookingPaymentInput,
  ): Promise<string> {
    const { tenantId, userId, booking, amount, method, kind, paidAt } = input;
    const isDeposit = kind === PAYMENT_KIND.DEPOSIT;

    // Đơn huỷ / khách không đến không nhận tiền thuê hay cọc mới — chặn ở writer DUY NHẤT nên mọi
    // đường thu (hộp Thu tiền, Thu cọc, lượt nhận lại xe) cùng một luật.
    await assertBookingMoneyOpenWithinTx(tx, booking.id);

    /*
     * Trần tiền THUÊ = số khách còn đưa tận tay (18/11/2026). Trước đây hộp nhận mọi con số: đơn qua
     * chợ đã có `D` trả trước qua XePrime vẫn bị gợi ý thu trọn tiền thuê, tức thu khách hai lần,
     * và phần dư vào `paid_amount` như doanh thu của đơn. Đọc SAU `FOR UPDATE` của cổng trên nên
     * hai lượt thu song song không cùng lọt một mức trần cũ. Cọc không có trần ở đây — nó là tiền
     * giữ hộ, không phải công nợ.
     */
    if (!isDeposit) {
      const due = (await loadCounterDueAmount(tx, tenantId, booking.id)) ?? new Prisma.Decimal(0);
      if (amount.greaterThan(due)) {
        throw new ConflictException({
          code: API_ERROR_CODE.PAYMENT_EXCEEDS_DUE,
          message: `Số tiền vượt số khách còn phải thu (${due.toFixed(0)}đ). Khoản khách đưa thêm ngoài đơn - lập phiếu thu ở Sổ Thu-Chi`,
          details: { counterDueAmount: due.toFixed(0) },
        });
      }
    }

    // Id payment sinh TRƯỚC phiếu: phiếu cần nó làm `sourceRefId` (đường lần ngược từ sổ về giao
    // dịch), còn payment cần `receiptId` — hai chiều, nên một đầu phải có id trước.
    const paymentId = newId();

    // Phiếu thu đã-duyệt lên sổ Thu-Chi + dashboard (khỏi nhập tay 2 lần).
    const receipt = await this.receipts.createApprovedWithinTx(tx, tenantId, userId, {
      type: RECEIPT_TYPE.INCOME,
      amount: amount.toString(),
      paymentMethod: method,
      source: isDeposit ? RECEIPT_SOURCE.DEPOSIT : RECEIPT_SOURCE.PAYMENT,
      sourceRefId: paymentId,
      categoryKey: isDeposit
        ? SYSTEM_FINANCE_CATEGORY.DEPOSIT
        : SYSTEM_FINANCE_CATEGORY.BOOKING_PAYMENT,
      bookingId: booking.id,
      vehicleId: booking.vehicleId,
      tenantCustomerId: booking.tenantCustomerId,
      occurredAt: paidAt,
      description:
        input.description ??
        (isDeposit ? `Thu cọc đơn ${booking.code}` : `Thu tiền đơn ${booking.code}`),
      referenceCode: input.referenceCode ?? null,
    });

    await tx.payment.create({
      data: {
        id: paymentId,
        tenantId,
        bookingId: booking.id,
        receiptId: receipt.id,
        payerUserId: userId,
        amount,
        kind,
        method,
        status: PAYMENT_STATUS.SUCCEEDED,
        paidAt,
      },
    });

    // CHỈ tiền thuê mới cộng vào `paid_amount`. Cọc là tài sản giữ hộ sẽ trả lại khách —
    // cộng nó vào đây làm công nợ tụt giả và đơn biến mất khỏi /manage/debts trong khi khách
    // chưa trả một đồng tiền thuê nào. Cọc đã thu đọc qua `payments.kind = 'deposit'`.
    if (!isDeposit) {
      // Cộng dồn ở DB — chống lost-update khi 2 lần thu chạy song song.
      await tx.booking.update({
        where: { id: booking.id },
        data: { paidAmount: { increment: amount } },
      });
    }

    await this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: 'tenant',
        action: 'payment.record',
        targetType: 'booking',
        targetId: booking.id,
        after: {
          amount: amount.toString(),
          method,
          kind,
          ...(input.via ? { via: input.via } : {}),
        },
      },
      tx,
    );

    return paymentId;
  }
  /**
   * Sửa số cọc ĐÃ THU bằng bút toán điều chỉnh - không bao giờ sửa/xoá khoản cũ (sổ chỉ thêm).
   *
   * Trong transaction của người gọi, khoá dòng đơn rồi đọc cọc ròng hiện tại:
   *  - chênh dương ⇒ một khoản `deposit` mới (phiếu THU `deposit`), đi qua đúng `recordWithinTx`;
   *  - chênh âm ⇒ một khoản `deposit_return` (phiếu CHI `deposit_refund`, `source_ref_id` =
   *    payments.id) - tiền chủ xe trả lại khách trước quyết toán;
   *  - bằng nhau ⇒ không ghi gì.
   * Sau khi đã có bản ghi hoàn cọc lúc trả xe thì không điều chỉnh nữa: số ròng đã được chụp vào đó,
   * sửa tiếp là lệch sổ - dùng chức năng sửa hoàn cọc.
   */
  async adjustDepositCollectedWithinTx(
    tx: Prisma.TransactionClient,
    input: AdjustDepositCollectedInput,
  ): Promise<AdjustDepositCollectedResult> {
    const { tenantId, userId, bookingId, collectedAmount, method } = input;
    // Khoá dòng đơn trước mọi phép đọc: hai lượt điều chỉnh song song không cùng đọc một số cũ.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: { id: true, code: true, vehicleId: true, tenantCustomerId: true },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đơn thuê',
      });
    }
    const settled = await tx.bookingDepositSettlement.findFirst({
      where: { tenantId, bookingId },
      select: { id: true },
    });
    if (settled) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Đơn đã ghi hoàn cọc lúc trả xe - sửa số tiền ở phần hoàn cọc',
      });
    }

    const previous = await loadNetDepositReceived(tx, tenantId, bookingId);
    const diff = collectedAmount.minus(previous);
    const result = { previous, collected: collectedAmount, diff, paymentId: null as string | null };
    if (diff.isZero()) return result;

    // Ghi chú mặc định - không hỏi lý do (sản phẩm chốt 27/11/2026); audit giữ số cũ → số mới.
    const description = `Điều chỉnh số tiền cọc đã thu đơn ${booking.code}`;
    if (diff.greaterThan(0)) {
      // Thu thêm = một lần thu cọc bình thường (cổng đơn huỷ, phiếu thu, audit `payment.record`).
      result.paymentId = await this.recordWithinTx(tx, {
        tenantId,
        userId,
        booking,
        amount: diff,
        method,
        kind: PAYMENT_KIND.DEPOSIT,
        paidAt: new Date(),
        description,
        via: 'deposit_adjustment',
      });
    } else {
      const amount = diff.abs();
      const paymentId = newId();
      const now = new Date();
      const receipt = await this.receipts.createApprovedWithinTx(tx, tenantId, userId, {
        type: RECEIPT_TYPE.EXPENSE,
        amount: amount.toFixed(2),
        paymentMethod: method,
        source: RECEIPT_SOURCE.DEPOSIT_REFUND,
        sourceRefId: paymentId,
        categoryKey: SYSTEM_FINANCE_CATEGORY.DEPOSIT_REFUND,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        tenantCustomerId: booking.tenantCustomerId,
        occurredAt: now,
        description,
      });
      await tx.payment.create({
        data: {
          id: paymentId,
          tenantId,
          bookingId: booking.id,
          receiptId: receipt.id,
          payerUserId: userId,
          amount,
          kind: PAYMENT_KIND.DEPOSIT_RETURN,
          method,
          status: PAYMENT_STATUS.SUCCEEDED,
          paidAt: now,
        },
      });
      result.paymentId = paymentId;
    }

    await this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: 'tenant',
        action: 'booking.deposit_collected.adjust',
        targetType: 'booking',
        targetId: bookingId,
        before: { depositReceived: previous.toFixed(2) },
        after: {
          depositReceived: collectedAmount.toFixed(2),
          diff: diff.toFixed(2),
          method,
          paymentId: result.paymentId,
        },
      },
      tx,
    );
    return result;
  }
}
