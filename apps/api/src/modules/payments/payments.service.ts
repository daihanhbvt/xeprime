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
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { ReceiptsService } from '../finance/receipts.service';
import { BookingDetailDto } from '../bookings/dto/booking.dto';
import { PaymentDto, RecordPaymentDto } from './dto/payment.dto';

const SELECT = {
  id: true,
  amount: true,
  kind: true,
  method: true,
  status: true,
  receiptId: true,
  paidAt: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

/**
 * Ghi nhận thanh toán đơn (Phase 6) — **writer DUY NHẤT của `booking.paid_amount`**.
 *
 * Mỗi lần thu: ghi payment + tạo phiếu thu đã-duyệt (+ cộng dồn paidAmount nếu là tiền THUÊ), tất
 * cả trong MỘT transaction. Cập nhật paidAmount bằng `increment`/`decrement` (khoá ở DB) → 2 lần
 * thu song song vẫn cộng đúng, không lost-update. XePrime không cầm tiền: đây là sổ ghi nội bộ.
 *
 * **Hai loại tiền, một đường ghi** (`dto.kind`):
 * - `rental` — tiền thuê: cộng vào `paid_amount`, làm giảm công nợ.
 * - `deposit` — tiền cọc: **KHÔNG** đụng `paid_amount`. Cọc là tài sản giữ hộ sẽ trả lại, không
 *   phải doanh thu; `total_amount` chưa bao giờ chứa nó (cọc nằm ở `bookings.deposit_amount`).
 *   Cộng cọc vào `paid_amount` làm một đơn đã đặt cọc trông như hết nợ.
 *
 * Cả hai đều lên sổ Thu-Chi thành phiếu thu — khác nhau ở danh mục và `source`, nên nhìn sổ vẫn
 * tách được doanh thu với tiền đang giữ hộ.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
    private readonly receipts: ReceiptsService,
  ) {}

  /** Ghi nhận một lần thu tiền cho đơn; trả về đơn với paid/debt đã cập nhật. */
  async recordForBooking(
    tenantId: string,
    userId: string,
    bookingId: string,
    dto: RecordPaymentDto,
  ): Promise<BookingDetailDto> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: { id: true, vehicleId: true, code: true, tenantCustomerId: true },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đơn thuê',
      });
    }

    const amount = new Prisma.Decimal(dto.amount);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const kind = (dto.kind ?? PAYMENT_KIND.RENTAL) as PaymentKind;
    const isDeposit = kind === PAYMENT_KIND.DEPOSIT;

    // Id payment sinh TRƯỚC phiếu: phiếu cần nó làm `sourceRefId` (đường lần ngược từ sổ về giao
    // dịch), còn payment cần `receiptId` — hai chiều, nên một đầu phải có id trước.
    const paymentId = newId();

    await this.prisma.$transaction(async (tx) => {
      // Phiếu thu đã-duyệt lên sổ Thu-Chi + dashboard (khỏi nhập tay 2 lần).
      const receipt = await this.receipts.createApprovedWithinTx(tx, tenantId, userId, {
        type: RECEIPT_TYPE.INCOME,
        amount: dto.amount,
        paymentMethod: dto.method as PaymentMethod,
        source: isDeposit ? RECEIPT_SOURCE.DEPOSIT : RECEIPT_SOURCE.PAYMENT,
        sourceRefId: paymentId,
        categoryKey: isDeposit
          ? SYSTEM_FINANCE_CATEGORY.DEPOSIT
          : SYSTEM_FINANCE_CATEGORY.BOOKING_PAYMENT,
        bookingId,
        vehicleId: booking.vehicleId,
        tenantCustomerId: booking.tenantCustomerId,
        occurredAt: paidAt,
        description:
          dto.description ??
          (isDeposit ? `Thu cọc đơn ${booking.code}` : `Thu tiền đơn ${booking.code}`),
        referenceCode: dto.referenceCode ?? null,
      });

      await tx.payment.create({
        data: {
          id: paymentId,
          tenantId,
          bookingId,
          receiptId: receipt.id,
          payerUserId: userId,
          amount,
          kind,
          method: dto.method as PaymentMethod,
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
          where: { id: bookingId },
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
          targetId: bookingId,
          after: { amount: dto.amount, method: dto.method, kind },
        },
        tx,
      );
    });

    return this.bookings.getOne(tenantId, bookingId);
  }

  /** Huỷ (hoàn) một lần thu: trừ lại paidAmount + huỷ phiếu thu liên kết, trong 1 transaction. */
  async voidPayment(tenantId: string, userId: string, paymentId: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      select: {
        id: true,
        status: true,
        amount: true,
        kind: true,
        bookingId: true,
        receiptId: true,
      },
    });
    if (!payment) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy giao dịch',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Chỉ void được payment đang succeeded, đúng một lần (chống void kép trừ tiền 2 lần).
      const flipped = await tx.payment.updateMany({
        where: { id: paymentId, status: PAYMENT_STATUS.SUCCEEDED },
        data: { status: PAYMENT_STATUS.REFUNDED },
      });
      if (flipped.count !== 1) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: 'Giao dịch này đã được hoàn trước đó',
        });
      }

      // Đối xứng với `recordForBooking`: chỉ trừ lại thứ đã từng cộng vào. Trừ vô điều kiện sẽ
      // rút `paid_amount` xuống vì một khoản cọc chưa bao giờ nằm trong đó — công nợ phình lên
      // từ hư không ngay lần hoàn cọc đầu tiên.
      if (payment.bookingId && payment.kind !== PAYMENT_KIND.DEPOSIT) {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { paidAmount: { decrement: payment.amount } },
        });
      }
      if (payment.receiptId) {
        await this.receipts.cancelWithinTx(tx, payment.receiptId, userId);
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'payment.void',
          targetType: 'payment',
          targetId: paymentId,
          before: { amount: payment.amount.toString() },
        },
        tx,
      );
    });

    const row = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: SELECT });
    return toDto(row);
  }

  /** Lịch sử thu tiền của một đơn (mới nhất trước). */
  async listForBooking(tenantId: string, bookingId: string): Promise<PaymentDto[]> {
    const rows = await this.prisma.payment.findMany({
      where: { tenantId, bookingId },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }
}

type Row = Prisma.PaymentGetPayload<{ select: typeof SELECT }>;
function toDto(p: Row): PaymentDto {
  return {
    id: p.id,
    amount: p.amount.toString(),
    kind: p.kind,
    method: p.method,
    status: p.status,
    receiptId: p.receiptId,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
