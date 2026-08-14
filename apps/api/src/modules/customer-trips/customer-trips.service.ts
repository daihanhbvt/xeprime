import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CUSTOMER_TRIP_FILTER,
  PAYMENT_KIND,
  PAYMENT_STATUS,
  customerTripStage,
  isCustomerTripFilter,
  type BookingRequestStatus,
  type BookingStatus,
  type CustomerTripFilter,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementService } from '../bookings/settlement/settlement.service';
import {
  CUSTOMER_TRIP_DEFAULT_LIMIT,
  CUSTOMER_TRIP_MAX_LIMIT,
  CustomerTripCountsDto,
  CustomerTripDetailDto,
  CustomerTripFinanceDto,
  CustomerTripListItemDto,
  CustomerTripListQueryDto,
  CustomerTripPageDto,
} from './dto/customer-trip.dto';

const ZERO = new Prisma.Decimal(0);

/**
 * Vòng đời một chuyến ĐỨNG TỪ PHÍA KHÁCH — chỉ đọc.
 *
 * Ba ranh giới đóng đinh ở service này:
 *
 *  - **Không có nguồn sự thật thứ hai.** Đơn/yêu cầu/phát sinh/cọc/hoàn cọc vẫn do các module
 *    của chủ xe sở hữu; ở đây chỉ CHIẾU chúng sang cái khách được thấy. Phép tính quyết toán
 *    mượn nguyên `SettlementService` (Wave 10) để hai bên không bao giờ đọc ra hai số khác nhau.
 *  - **Quyền sở hữu nằm trong WHERE, không nằm trong một câu `if`.** Mọi truy vấn đều buộc
 *    `bookingRequest.customerUserId = người đang đăng nhập`, nên chuyến của người khác đơn giản
 *    là không tồn tại: 404, không phải 403 — 403 chính là câu trả lời "có tồn tại đấy".
 *  - **DTO là hàng rào lộ dữ liệu.** Ghi chú nội bộ của shop, ảnh bàn giao, số KM, tên nhân
 *    viên ghi phiếu, `rowVersion`… không có đường nào đi ra ngoài từ đây.
 *
 * Định danh chuyến là id **yêu cầu thuê**: nó có từ lúc khách bấm gửi, sớm hơn đơn thuê. Nhưng
 * thông báo cũ trỏ vào id ĐƠN, nên `detail()` nhận cả hai — cùng một chuyến, hai cách gọi tên.
 */
@Injectable()
export class CustomerTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  async list(
    customerUserId: string,
    query: CustomerTripListQueryDto,
  ): Promise<CustomerTripPageDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      CUSTOMER_TRIP_MAX_LIMIT,
      Math.max(1, query.limit ?? CUSTOMER_TRIP_DEFAULT_LIMIT),
    );
    const filter: CustomerTripFilter = isCustomerTripFilter(query.filter)
      ? query.filter
      : CUSTOMER_TRIP_FILTER.ALL;

    const where = this.whereFor(customerUserId, filter);

    const [total, rows, counts] = await Promise.all([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
      this.counts(customerUserId),
    ]);

    const surchargeTotals = await this.surchargeTotals(rows.map((row) => row.bookingId));

    const meta: PaginationMeta = { page, limit, total, hasNext: page * limit < total };
    return { data: rows.map((row) => toListItem(row, surchargeTotals)), meta, counts };
  }

  /**
   * Tổng phát sinh còn hiệu lực của MỘT TRANG đơn — một truy vấn `groupBy` cho cả trang, không
   * phải một lần gọi quyết toán cho mỗi dòng (N+1).
   *
   * Tồn tại để `totalAmount` ở danh sách bằng đúng `finalTotal` ở chi tiết. Trước Wave 11.1 danh
   * sách đọc thẳng `bookings.total_amount` — con số CỐ Ý không gồm phát sinh (Wave 10) — nên một
   * chuyến có phụ phí hiện hai số `Tổng thanh toán` khác nhau ở hai màn.
   */
  private async surchargeTotals(
    bookingIds: (string | null)[],
  ): Promise<Map<string, Prisma.Decimal>> {
    const ids = bookingIds.filter((id): id is string => id !== null);
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.bookingSurcharge.groupBy({
      by: ['bookingId'],
      // Cùng điều kiện với `SettlementService.moneySnapshot` — khoản đã huỷ mềm không tính.
      where: { bookingId: { in: ids }, voidedAt: null },
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.bookingId, row._sum.amount ?? ZERO]));
  }

  /**
   * Một chuyến. `id` là id yêu cầu HOẶC id đơn — thông báo của Wave 5/9/10 trỏ vào cả hai loại,
   * và bắt khách phải biết mình đang cầm loại id nào là một yêu cầu vô lý.
   */
  async detail(customerUserId: string, id: string): Promise<CustomerTripDetailDto> {
    const row = await this.prisma.bookingRequest.findFirst({
      where: {
        customerUserId,
        OR: [{ id }, { bookingId: id }],
      },
      select: DETAIL_SELECT,
    });
    if (!row) throw tripNotFound();

    const booking = row.booking;
    const base = toListItem(row, await this.surchargeTotals([row.bookingId]));

    return {
      ...base,
      customerNote: row.note,
      rejectReason: row.rejectReason,
      actualPickupAt: booking?.actualPickupAt?.toISOString() ?? null,
      actualReturnAt: booking?.actualReturnAt?.toISOString() ?? null,
      finance: booking ? await this.finance(booking) : null,
      review: booking?.review
        ? {
            id: booking.review.id,
            rating: booking.review.rating,
            comment: booking.review.comment,
            createdAt: booking.review.createdAt.toISOString(),
          }
        : null,
    };
  }

  // ── Tiền ──────────────────────────────────────────────────────────────────

  /**
   * Toàn bộ tiền của chuyến, tính đúng MỘT lần.
   *
   * Chống đếm trùng ở hai chỗ dễ sai nhất:
   *
   *  1. **Cọc không được cộng vào tiền thuê đã trả.** `bookings.paid_amount` cộng dồn MỌI lần
   *     thu, kể cả lần thu cọc — đọc nó thành "đã trả tiền thuê" là cộng khoản cọc hai lần
   *     (một lần ở hoá đơn, một lần ở khối cọc). Nên `rentalPaid` đếm lại từ `payments` với
   *     `kind = 'rental'`; `depositReceived` lấy phần `kind = 'deposit'`. Hai tập rời nhau,
   *     cùng một bảng, không giao nhau.
   *  2. **Phát sinh chỉ cộng vào tổng MỘT lần.** `bookings.total_amount` KHÔNG bao gồm phát
   *     sinh (Wave 10 cố ý không đụng tới nó), nên `finalTotal = rentalTotal + surchargeTotal`.
   *     Phần khấu trừ vào cọc là CÁCH TRẢ cho phần đó, không phải một khoản thu thêm.
   */
  private async finance(booking: BookingRow): Promise<CustomerTripFinanceDto> {
    const [settlement, rentalPaidAgg] = await Promise.all([
      // Cùng một phép tính với màn chủ xe (Wave 10) — không dựng lại công thức ở đây.
      this.settlement.get(booking.tenantId, booking.id),
      this.prisma.payment.aggregate({
        where: {
          tenantId: booking.tenantId,
          bookingId: booking.id,
          kind: PAYMENT_KIND.RENTAL,
          status: PAYMENT_STATUS.SUCCEEDED,
        },
        _sum: { amount: true },
      }),
    ]);

    const rentalTotal = new Prisma.Decimal(booking.totalAmount);
    const surchargeTotal = new Prisma.Decimal(settlement.surchargeTotal);
    const depositReceived = new Prisma.Decimal(settlement.depositReceived);

    // Khấu trừ = phần phát sinh mà tiền cọc gánh được. Vượt quá thì phần dư là `additionalDue`
    // (server đã tính), khách trả trực tiếp — không bao giờ hiện một khoản khấu trừ âm.
    const depositDeducted = Prisma.Decimal.min(surchargeTotal, depositReceived);

    return {
      currency: 'VND',
      baseAmount: booking.baseAmount.toFixed(2),
      discountAmount: booking.discountAmount.toFixed(2),
      deliveryFee: booking.deliveryFee.toFixed(2),
      rentalTotal: rentalTotal.toFixed(2),
      surcharges: settlement.surcharges.map((row) => ({
        category: row.category,
        amount: row.amount,
        reason: row.reason,
        recordedAt: row.createdAt,
      })),
      surchargeTotal: surchargeTotal.toFixed(2),
      finalTotal: rentalTotal.plus(surchargeTotal).toFixed(2),
      rentalPaid: (rentalPaidAgg._sum.amount ?? ZERO).toFixed(2),
      depositRequired: settlement.depositRequired,
      depositReceived: settlement.depositReceived,
      depositDeducted: depositDeducted.toFixed(2),
      additionalDue: settlement.additionalDue,
      expectedRefund: settlement.proposedRefund,
      depositStatus: settlement.depositStatus,
      // Bản ghi hoàn cọc do chủ xe lập; khách CHỈ đọc — không có đường sửa nào từ đây.
      refundAmount: settlement.refund?.refundAmount ?? null,
      refundMethod: settlement.refund?.refundMethod ?? null,
      refundedAt: settlement.refund?.refundedAt ?? null,
      refundReference: settlement.refund?.reference ?? null,
      legacyPricing: booking.priceSnapshot === null,
    };
  }

  // ── Lọc & đếm ─────────────────────────────────────────────────────────────

  /**
   * Điều kiện lọc theo TAB. Chặng của khách là giá trị suy ra chứ không phải cột, nên mỗi tab
   * dịch ngược thành một vị từ trên hai cột trạng thái thật — vẫn lọc và phân trang ở DB, không
   * bao giờ kéo cả danh sách về rồi lọc trong Node.
   */
  private whereFor(
    customerUserId: string,
    filter: CustomerTripFilter,
  ): Prisma.BookingRequestWhereInput {
    const mine: Prisma.BookingRequestWhereInput = { customerUserId };

    switch (filter) {
      case CUSTOMER_TRIP_FILTER.PENDING:
        return {
          ...mine,
          bookingId: null,
          status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        };
      case CUSTOMER_TRIP_FILTER.UPCOMING:
        return {
          ...mine,
          booking: { status: { in: [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED] } },
        };
      case CUSTOMER_TRIP_FILTER.ACTIVE:
        return { ...mine, booking: { status: BOOKING_STATUS.ACTIVE } };
      case CUSTOMER_TRIP_FILTER.COMPLETED:
        return { ...mine, booking: { status: BOOKING_STATUS.COMPLETED } };
      case CUSTOMER_TRIP_FILTER.CANCELLED:
        return {
          ...mine,
          OR: [
            {
              bookingId: null,
              status: {
                in: [
                  BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
                  BOOKING_REQUEST_STATUS.EXPIRED,
                  BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
                ],
              },
            },
            { booking: { status: { in: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW] } } },
          ],
        };
      default:
        return mine;
    }
  }

  /** Đếm cho từng tab bằng CHÍNH vị từ của tab đó — con số trên tab và danh sách không lệch. */
  private async counts(customerUserId: string): Promise<CustomerTripCountsDto> {
    const count = (filter: CustomerTripFilter) =>
      this.prisma.bookingRequest.count({ where: this.whereFor(customerUserId, filter) });

    const [all, pending, upcoming, active, completed, cancelled] = await Promise.all([
      count(CUSTOMER_TRIP_FILTER.ALL),
      count(CUSTOMER_TRIP_FILTER.PENDING),
      count(CUSTOMER_TRIP_FILTER.UPCOMING),
      count(CUSTOMER_TRIP_FILTER.ACTIVE),
      count(CUSTOMER_TRIP_FILTER.COMPLETED),
      count(CUSTOMER_TRIP_FILTER.CANCELLED),
    ]);
    return { all, pending, upcoming, active, completed, cancelled };
  }
}

// ── Truy vấn ─────────────────────────────────────────────────────────────────

const BOOKING_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  status: true,
  pickupAt: true,
  returnAt: true,
  actualPickupAt: true,
  actualReturnAt: true,
  baseAmount: true,
  discountAmount: true,
  deliveryFee: true,
  totalAmount: true,
  priceSnapshot: true,
  vehicle: { select: { plateNumber: true } },
  review: { select: { id: true, rating: true, comment: true, createdAt: true } },
} satisfies Prisma.BookingSelect;

const LIST_SELECT = {
  id: true,
  status: true,
  pickupAt: true,
  returnAt: true,
  deliveryRequested: true,
  deliveryAddress: true,
  createdAt: true,
  bookingId: true,
  vehicle: {
    select: {
      id: true,
      name: true,
      mainImageUrl: true,
      seatCount: true,
      transmission: true,
      fuelType: true,
    },
  },
  tenant: { select: { name: true, slug: true, ratingAvg: true, ratingCount: true, phone: true } },
  booking: { select: BOOKING_SELECT },
} satisfies Prisma.BookingRequestSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  note: true,
  rejectReason: true,
} satisfies Prisma.BookingRequestSelect;

type TripRow = Prisma.BookingRequestGetPayload<{ select: typeof DETAIL_SELECT }>;
type BookingRow = NonNullable<TripRow['booking']>;

function toListItem(
  row: TripRow | Prisma.BookingRequestGetPayload<{ select: typeof LIST_SELECT }>,
  surchargeTotals: Map<string, Prisma.Decimal>,
) {
  const booking = row.booking;
  const stage = customerTripStage({
    requestStatus: row.status as BookingRequestStatus,
    bookingStatus: (booking?.status as BookingStatus | undefined) ?? null,
  });
  const engaged = isEngagedTrip(row.status as BookingRequestStatus, Boolean(booking));

  const item: CustomerTripListItemDto = {
    id: row.id,
    bookingId: booking?.id ?? null,
    code: booking?.code ?? null,
    stage,
    vehicle: {
      id: row.vehicle.id,
      name: row.vehicle.name,
      imageUrl: row.vehicle.mainImageUrl,
      seatCount: row.vehicle.seatCount,
      transmission: row.vehicle.transmission,
      fuelType: row.vehicle.fuelType,
      plateNumber: engaged ? (booking?.vehicle.plateNumber ?? null) : null,
    },
    shop: {
      name: row.tenant.name,
      slug: row.tenant.slug,
      ratingAvg: Number(row.tenant.ratingAvg),
      ratingCount: row.tenant.ratingCount,
      phone: engaged ? row.tenant.phone : null,
    },
    // Giờ trên ĐƠN thắng giờ trên yêu cầu: shop dời lịch thì đơn mới là cái đang có hiệu lực.
    pickupAt: (booking?.pickupAt ?? row.pickupAt).toISOString(),
    returnAt: (booking?.returnAt ?? row.returnAt).toISOString(),
    deliveryRequested: row.deliveryRequested,
    deliveryAddress: row.deliveryAddress,
    /*
     * Tổng DỊCH VỤ mới nhất = tiền thuê (đã gồm khuyến mãi + phí giao nhận hiện hành) + phát
     * sinh còn hiệu lực. Đúng công thức `finalTotal` ở chi tiết, nên hai màn không bao giờ hiện
     * hai số. Cọc KHÔNG nằm trong đây, và phần phát sinh khấu trừ vào cọc cũng không bị cộng
     * thêm lần nữa — nó chỉ là cách khách đã trả cho phần phát sinh này.
     */
    totalAmount: booking
      ? booking.totalAmount.plus(surchargeTotals.get(booking.id) ?? ZERO).toFixed(2)
      : null,
    canReview: booking?.status === BOOKING_STATUS.COMPLETED && !booking.review,
    hasReview: Boolean(booking?.review),
    createdAt: row.createdAt.toISOString(),
  };
  return item;
}

/**
 * Chuyến đã thật sự thành QUAN HỆ giữa khách và gian hàng — điều kiện để lộ SĐT shop và biển số.
 *
 * Danh sách CHO PHÉP, không phải "khác chờ duyệt". Điều kiện phủ định cũ (`stage !== pending`)
 * coi cả yêu cầu bị từ chối, quá hạn và khách tự huỷ là đã-gắn-kết — tức là gửi một yêu cầu rồi
 * tự huỷ ngay là đủ để moi số điện thoại của mọi gian hàng trên sàn. Thêm một trạng thái kết
 * thúc mới trong tương lai cũng sẽ tự động rơi vào phía AN TOÀN thay vì tự động lộ.
 */
function isEngagedTrip(requestStatus: BookingRequestStatus, hasBooking: boolean): boolean {
  if (hasBooking) return true;
  return (
    requestStatus === BOOKING_REQUEST_STATUS.APPROVED_BY_HOST ||
    requestStatus === BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING
  );
}

/**
 * Chuyến không tồn tại VÀ chuyến của người khác trả về cùng một lỗi. Phân biệt hai cái đó là
 * cách lịch sự để xác nhận "id này có thật, chỉ là không phải của bạn".
 */
function tripNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy chuyến đi này',
  });
}
