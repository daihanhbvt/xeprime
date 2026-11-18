import { ConflictException, Injectable } from '@nestjs/common';
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
import { loadCounterDueAmount } from '../../common/booking-money';
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
}
