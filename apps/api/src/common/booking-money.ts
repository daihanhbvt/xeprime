import { Prisma } from '@xeprime/prisma';
import { BOOKING_STATUS, PAYMENT_KIND, PAYMENT_STATUS, RECEIPT_SOURCE, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';

/**
 * MỘT con số phải-thu cho một đơn thuê — định nghĩa duy nhất của "khách còn nợ bao nhiêu".
 *
 * ## Vì sao phải gom
 *
 * Tiền của một đơn nằm ở BA bảng và trước đây chúng không nói chuyện với nhau:
 *  - `payments` (tiền thuê) → `bookings.paid_amount`;
 *  - `booking_surcharges` (quá giờ, vệ sinh, hư hại) → chỉ nuôi phép tính hoàn cọc;
 *  - `receipts` nhập tay có gắn đơn → chỉ nằm trong sổ Thu-Chi.
 *
 * Hệ quả thật đã gặp: một đơn thu 720k tiền thuê + 200k quá giờ (ghi bằng phiếu tay) hiện ra
 * "đã thu 720k" ở màn đơn và "920k" ở sổ. Tệ hơn: phụ phí CHƯA thu thì `/manage/debts` báo 0 —
 * gian hàng mất tiền mà không có gì báo.
 *
 * ## Công thức
 *
 * ```
 * phảiThu   = total_amount + tổng phụ phí còn hiệu lực
 * cọcGánh   = min(tổng phụ phí, cọc ĐÃ THU)
 * đãThu     = paid_amount + phiếu thu TAY đã duyệt gắn đơn + cọcGánh
 * cònNợ     = max(0, phảiThu − đãThu)
 * ```
 *
 * **`cọcGánh` là mấu chốt chống ĐẾM HAI LẦN.** Quyết toán cọc đã trừ phụ phí vào tiền hoàn
 * (`proposedRefund = cọc đã thu − phụ phí`), tức phần phụ phí nằm trong tầm cọc coi như đã thu
 * rồi. Cộng thẳng phụ phí vào công nợ mà không trừ lại phần đó là bắt khách trả hai lần: một
 * lần bị giữ bớt cọc, một lần bị đòi nợ.
 *
 * ## Cố ý KHÔNG tính
 *
 * - **Phiếu tự động `source = payment`** — đã nằm trong `paid_amount` rồi, cộng nữa là đếm đôi.
 * - **Phiếu `source = deposit`** — cọc là tài sản giữ hộ, không phải tiền thuê đã thu.
 * - **Phiếu CHI gắn đơn** (giao xe, hoàn cọc) — đó là chi phí của gian hàng, không đổi thứ
 *   khách nợ. Hoàn tiền cho khách đi bằng đường huỷ giao dịch, không phải một phiếu chi.
 * - **Phiếu chưa duyệt** — chưa duyệt thì chưa phải tiền thật (cùng luật với thẻ tổng của sổ).
 *
 * Không denormalize cột nào: công nợ tính lúc đọc, đúng doctrine Phase 6 (tránh drift).
 */
export interface BookingMoneyInput {
  /** Giá thuê đã chốt trên đơn (không gồm phụ phí). */
  totalAmount: Prisma.Decimal | string | number;
  /** Tổng phụ phí còn hiệu lực (`voided_at IS NULL`). */
  surchargeTotal?: Prisma.Decimal | string | number | null;
  /** Tiền thuê đã thu — `bookings.paid_amount`, writer duy nhất là `PaymentsService`. */
  paidAmount: Prisma.Decimal | string | number;
  /** Phiếu thu NHẬP TAY đã duyệt gắn đơn (quá giờ, phụ thu… ghi thẳng ở sổ). */
  otherCollected?: Prisma.Decimal | string | number | null;
  /** Cọc ĐÃ THU (`payments.kind = 'deposit'`), dùng để tính phần cọc gánh phụ phí. */
  depositReceived?: Prisma.Decimal | string | number | null;
}

export interface BookingMoney {
  amountDue: Prisma.Decimal;
  collectedAmount: Prisma.Decimal;
  debtAmount: Prisma.Decimal;
  surchargeTotal: Prisma.Decimal;
  otherCollected: Prisma.Decimal;
}

export function bookingMoney(input: BookingMoneyInput): BookingMoney {
  const total = new Prisma.Decimal(input.totalAmount);
  const surcharge = new Prisma.Decimal(input.surchargeTotal ?? 0);
  const paid = new Prisma.Decimal(input.paidAmount);
  const other = new Prisma.Decimal(input.otherCollected ?? 0);
  const deposit = new Prisma.Decimal(input.depositReceived ?? 0);

  const amountDue = total.plus(surcharge);
  const coveredByDeposit = Prisma.Decimal.min(surcharge, deposit);
  const collectedAmount = paid.plus(other).plus(coveredByDeposit);

  return {
    amountDue,
    collectedAmount,
    // Kẹp sàn 0 có chủ đích: trả dư là công nợ 0, không phải số âm.
    debtAmount: Prisma.Decimal.max(0, amountDue.minus(collectedAmount)),
    surchargeTotal: surcharge,
    otherCollected: other,
  };
}

/**
 * Bản SQL của đúng công thức trên, cho các danh sách phải so cột-với-cột (`/manage/debts`, sổ
 * khách, dashboard). Prisma không so được cột với cột nên chúng buộc phải là raw SQL — và nếu
 * mỗi câu tự viết lại phép tính thì ba màn sẽ trôi khỏi nhau đúng như trước.
 *
 * Dùng kèm `BOOKING_MONEY_JOINS`; cả hai giả định bảng `bookings` mang bí danh `b`.
 */
export const BOOKING_MONEY_JOINS = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(s.amount), 0) AS total
    FROM booking_surcharges s
    WHERE s.booking_id = b.id AND s.voided_at IS NULL
  ) sur ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount), 0) AS total
    FROM receipts r
    WHERE r.booking_id = b.id
      AND r.type = ${RECEIPT_TYPE.INCOME}
      AND r.source = ${RECEIPT_SOURCE.MANUAL}
      AND r.status = ${RECEIPT_STATUS.APPROVED}
      AND r.deleted_at IS NULL
  ) man ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount), 0) AS total
    FROM payments p
    WHERE p.booking_id = b.id
      AND p.kind = ${PAYMENT_KIND.DEPOSIT}
      AND p.status = ${PAYMENT_STATUS.SUCCEEDED}
  ) dep ON TRUE
`;

/** `phải thu` — tiền thuê + phụ phí còn hiệu lực. */
export const SQL_AMOUNT_DUE = Prisma.sql`(b.total_amount + sur.total)`;

/** `đã thu` — tiền thuê + phiếu tay đã duyệt + phần phụ phí mà cọc đã gánh. */
export const SQL_COLLECTED = Prisma.sql`(b.paid_amount + man.total + LEAST(sur.total, dep.total))`;

/** `còn nợ` — kẹp sàn 0, khớp từng ký tự với `bookingMoney()`. */
export const SQL_DEBT = Prisma.sql`GREATEST(${SQL_AMOUNT_DUE} - ${SQL_COLLECTED}, 0)`;

/** Vị từ "đơn này còn nợ" — dùng cho `WHERE` và cho bộ đếm. */
export const SQL_HAS_DEBT = Prisma.sql`${SQL_AMOUNT_DUE} > ${SQL_COLLECTED}`;

/** Đơn bị huỷ không nằm trong bất kỳ phép tính công nợ nào. */
export const SQL_DEBT_SCOPE = Prisma.sql`b.deleted_at IS NULL AND b.status <> ${BOOKING_STATUS.CANCELLED}`;

/** Ba tổng phụ của một đơn — thứ `bookings` không tự mang trong cột nào. */
export interface BookingMoneySides {
  surchargeTotal: Prisma.Decimal;
  otherCollected: Prisma.Decimal;
  depositReceived: Prisma.Decimal;
}

const ZERO_SIDES: BookingMoneySides = {
  surchargeTotal: new Prisma.Decimal(0),
  otherCollected: new Prisma.Decimal(0),
  depositReceived: new Prisma.Decimal(0),
};

export const emptyMoneySides = (): BookingMoneySides => ZERO_SIDES;

/**
 * Nạp ba tổng phụ cho một TRANG đơn — ba `groupBy` trên tập id đã biết, không phải N+1.
 *
 * Dùng cho danh sách và chi tiết đơn (Prisma không cộng được quan hệ trong `findMany`). Cùng
 * khuôn với `VehiclesService.stats`: gộp ở DB, trả về vài chục dòng.
 *
 * Client truyền vào là `PrismaService` hoặc một `TransactionClient` — nhận cả hai để nơi gọi
 * đang ở trong transaction không phải nhảy ra ngoài.
 */
export async function loadBookingMoneySides(
  db: Pick<Prisma.TransactionClient, 'bookingSurcharge' | 'receipt' | 'payment'>,
  bookingIds: string[],
): Promise<Map<string, BookingMoneySides>> {
  const result = new Map<string, BookingMoneySides>();
  if (bookingIds.length === 0) return result;

  const [surcharges, manualReceipts, deposits] = await Promise.all([
    db.bookingSurcharge.groupBy({
      by: ['bookingId'],
      where: { bookingId: { in: bookingIds }, voidedAt: null },
      _sum: { amount: true },
    }),
    db.receipt.groupBy({
      by: ['bookingId'],
      where: {
        bookingId: { in: bookingIds },
        type: RECEIPT_TYPE.INCOME,
        // CHỈ phiếu nhập tay: phiếu `payment` đã nằm trong `paid_amount`, phiếu `deposit` là
        // tiền giữ hộ. Cộng cả hai vào đây là đếm đôi.
        source: RECEIPT_SOURCE.MANUAL,
        status: RECEIPT_STATUS.APPROVED,
        deletedAt: null,
      },
      _sum: { amount: true },
    }),
    db.payment.groupBy({
      by: ['bookingId'],
      where: {
        bookingId: { in: bookingIds },
        kind: PAYMENT_KIND.DEPOSIT,
        status: PAYMENT_STATUS.SUCCEEDED,
      },
      _sum: { amount: true },
    }),
  ]);

  const sumOf = (
    groups: { bookingId: string | null; _sum: { amount: Prisma.Decimal | null } }[],
    id: string,
  ) => groups.find((g) => g.bookingId === id)?._sum.amount ?? new Prisma.Decimal(0);

  for (const id of bookingIds) {
    result.set(id, {
      surchargeTotal: sumOf(surcharges, id),
      otherCollected: sumOf(manualReceipts, id),
      depositReceived: sumOf(deposits, id),
    });
  }
  return result;
}
