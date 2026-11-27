import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  type PaymentKind,
  type PaymentMethod,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { ReceiptsService } from '../finance/receipts.service';
import { BookingDetailDto } from '../bookings/dto/booking.dto';
import { BookingPaymentWriter } from './booking-payment.writer';
import { AdjustDepositCollectedDto, PaymentDto, RecordPaymentDto } from './dto/payment.dto';

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
    private readonly writer: BookingPaymentWriter,
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

    // Lõi ghi (phiếu thu + payment + `paid_amount` + audit) ở `BookingPaymentWriter` — lượt nhận
    // lại xe dùng CHÍNH nó trong transaction của biên bản, nên hai đường không thể ghi hai kiểu.
    await this.prisma.$transaction((tx) =>
      this.writer.recordWithinTx(tx, {
        tenantId,
        userId,
        booking,
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method as PaymentMethod,
        kind: (dto.kind ?? PAYMENT_KIND.RENTAL) as PaymentKind,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        referenceCode: dto.referenceCode ?? null,
      }),
    );

    return this.bookings.getOne(tenantId, bookingId);
  }

  /**
   * Sửa số cọc ĐÃ THU (thu dư / thu thiếu) bằng bút toán điều chỉnh - xem
   * `BookingPaymentWriter.adjustDepositCollectedWithinTx`. MỘT transaction, khoá dòng đơn.
   */
  async adjustDepositCollected(
    tenantId: string,
    userId: string,
    bookingId: string,
    dto: AdjustDepositCollectedDto,
  ): Promise<BookingDetailDto> {
    await this.prisma.$transaction((tx) =>
      this.writer.adjustDepositCollectedWithinTx(tx, {
        tenantId,
        userId,
        bookingId,
        collectedAmount: new Prisma.Decimal(dto.collectedAmount),
        method: (dto.method ?? PAYMENT_METHOD.CASH) as PaymentMethod,
      }),
    );
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
      if (payment.bookingId && payment.kind === PAYMENT_KIND.RENTAL) {
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
