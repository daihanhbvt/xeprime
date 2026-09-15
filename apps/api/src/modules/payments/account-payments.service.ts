import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  PAYMENT_KIND,
  PAYMENT_STATUS,
  type PaginationMeta,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStatus,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACCOUNT_PAYMENT_DEFAULT_LIMIT,
  ACCOUNT_PAYMENT_MAX_LIMIT,
  type AccountPaymentDto,
  type AccountPaymentListQueryDto,
  type AccountPaymentTotalsDto,
} from './dto/account-payment.dto';

const SELECT = {
  id: true,
  bookingId: true,
  amount: true,
  currency: true,
  kind: true,
  method: true,
  status: true,
  paidAt: true,
  createdAt: true,
  booking: {
    select: {
      code: true,
      tenant: { select: { name: true } },
      vehicle: { select: { name: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

/**
 * "Tiền của các chuyến đã thuê" — bề mặt KHÁCH của `payments` (PROMPT 5).
 *
 * ## Ba loại tiền, ba màn hình — và đây là màn nào
 *
 *   · `payments`      → tiền khách trả cho **GIAN HÀNG** của một chuyến. **Màn này.**
 *   · `booking_holds` → tiền khách chuyển cho **XEPRIME** để giữ chỗ (`/trips/:id`).
 *   · `wallets`       → tiền **XEPRIME NỢ** khách, hiển thị là Ví điểm (`/account/balance`).
 *
 * Gộp chúng lại là cách chắc chắn để một người tưởng mình đã được hoàn tiền khi thật ra chưa.
 * Đó là lý do docblock của `ROUTES.ACCOUNT.PAYMENTS` nói thẳng *"đọc từ `payments`, không phải
 * ví"*, và vì sao service này không biết `wallets` tồn tại.
 *
 * ## Phạm vi: chuyến KHÁCH ĐÃ THUÊ, không phải chuyến họ cho thuê
 *
 * Khoá theo `booking.bookingRequest.customerUserId` — cùng nguồn sự thật với
 * `CustomerTripsService`. Một chủ gian hàng mở màn này sẽ thấy tiền họ ĐÃ TRẢ với tư cách khách,
 * không thấy tiền họ đã THU: phía thu nằm ở `/manage/receipts` và `/manage/finance`, với quyền
 * khác và ở một tenant scope khác.
 *
 * Đơn gian hàng tự lập (ngoài luồng chợ) không có `booking_request` nên không lọt vào đây — và
 * đúng như vậy: khách không có tài khoản nào gắn với đơn đó để mà đọc.
 */
@Injectable()
export class AccountPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    viewerUserId: string,
    query: AccountPaymentListQueryDto,
  ): Promise<{
    data: AccountPaymentDto[];
    meta: PaginationMeta & { totals: AccountPaymentTotalsDto };
  }> {
    const paging = resolvePaging(
      query,
      ACCOUNT_PAYMENT_DEFAULT_LIMIT,
      ACCOUNT_PAYMENT_MAX_LIMIT,
    );
    /*
     * Ranh giới đọc nằm ở ĐÂY và chỉ ở đây: mọi truy vấn của service này đều mang `scope`. Một
     * phép đếm hay một phép tổng thiếu nó sẽ cho khách thấy con số của người khác — và tổng là
     * chỗ dễ quên nhất vì nó không trả về dòng nào để ai đó nhận ra.
     */
    const scope: Prisma.PaymentWhereInput = {
      booking: { bookingRequest: { customerUserId: viewerUserId } },
    };
    const where: Prisma.PaymentWhereInput = {
      ...scope,
      ...(query.kind ? { kind: query.kind } : {}),
    };

    const [total, rows, totals] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        select: SELECT,
        /*
         * Sắp theo `paid_at` nhưng rơi về `created_at` khi chưa ghi nhận: khoản `pending` chưa có
         * `paid_at`, và để nó tụt xuống cuối nghĩa là thứ khách đang chờ lại ở trang cuối.
         * `id` chốt cuối để phân trang không lặp dòng khi hai khoản cùng mốc.
         */
        orderBy: [{ paidAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
      }),
      this.totals(scope),
    ]);

    /*
     * `totals` đi TRONG `meta`. Phong bì thành công chỉ có `{ data, meta }`, nên một khoá thứ ba
     * ngang hàng `data` sẽ bị client làm rụng khi nó lấy `result.data` — xem docblock của
     * `AccountPaymentMetaDto`.
     */
    return { data: rows.map(toDto), meta: { ...paginationMeta(paging, total), totals } };
  }

  /**
   * Tổng ĐÃ TRẢ — chỉ khoản `succeeded`.
   *
   * `pending` chưa phải tiền đã trả (gian hàng chưa xác nhận nhận được), `failed`/`refunded` thì
   * không còn. Cộng cả bốn trạng thái vào một con số "đã trả" là nói với khách rằng họ đã trả
   * nhiều hơn thực tế — và đó là con số họ mang đi tranh luận với gian hàng.
   */
  private async totals(scope: Prisma.PaymentWhereInput): Promise<AccountPaymentTotalsDto> {
    const paidScope: Prisma.PaymentWhereInput = { ...scope, status: PAYMENT_STATUS.SUCCEEDED };

    const [byKind, trips] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['kind'],
        where: paidScope,
        _sum: { amount: true },
      }),
      // Số CHUYẾN có tiền, không phải số khoản: một chuyến trả ba lần vẫn là một chuyến.
      this.prisma.payment.findMany({
        where: paidScope,
        select: { bookingId: true },
        distinct: ['bookingId'],
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    const sumOf = (kind: PaymentKind) =>
      byKind.find((k) => k.kind === kind)?._sum.amount ?? zero;
    const rental = sumOf(PAYMENT_KIND.RENTAL);
    const deposit = sumOf(PAYMENT_KIND.DEPOSIT);

    return {
      paidTotal: rental.add(deposit).toFixed(0),
      rentalTotal: rental.toFixed(0),
      depositTotal: deposit.toFixed(0),
      tripCount: trips.length,
    };
  }
}

type Row = Prisma.PaymentGetPayload<{ select: typeof SELECT }>;

function toDto(r: Row): AccountPaymentDto {
  return {
    id: r.id,
    // `booking_id` là NULL-able trên bảng, nhưng `scope` đòi có `booking` nên ở đây luôn có.
    bookingId: r.bookingId!,
    bookingCode: r.booking?.code ?? '',
    tenantName: r.booking?.tenant?.name ?? '',
    vehicleName: r.booking?.vehicle?.name ?? '',
    amount: r.amount.toFixed(0),
    currency: r.currency,
    kind: r.kind as PaymentKind,
    method: r.method as PaymentMethod,
    status: r.status as PaymentStatus,
    paidAt: r.paidAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
