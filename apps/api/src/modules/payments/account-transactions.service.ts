import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_TRANSACTION_KIND,
  ACCOUNT_TRANSACTION_STATUS,
  ACCOUNT_TRANSACTION_TITLE,
  BANK_DIRECTION,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  HOLD_REFUND_STATUS,
  PAYMENT_KIND,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_STATUS,
  WALLET_ENTRY_KIND,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  type AccountTransactionKind,
  type AccountTransactionStatus,
  type AccountTransactionTitle,
  type PaginationMeta,
} from '@xeprime/types';
import { dayEndUtc, dayStartUtc } from '../../common/day-range';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACCOUNT_TRANSACTION_DEFAULT_LIMIT,
  ACCOUNT_TRANSACTION_MAX_LIMIT,
  type AccountTransactionDto,
  type AccountTransactionListQueryDto,
} from './dto/account-transaction.dto';

interface RawRow {
  id: string;
  kind: string;
  title: string;
  code: string | null;
  amount: Prisma.Decimal | string;
  status: string;
  occurred_at: Date;
  trip_id: string | null;
  booking_code: string | null;
  cancellable: boolean;
}

/**
 * "Lịch sử giao dịch" của tài khoản khách — `GET /account/transactions`.
 *
 * MỘT danh sách hợp nhất sáu nguồn bằng `UNION ALL` ngay trong Postgres, để lọc trạng thái, lọc
 * ngày, đếm và phân trang đều đúng trên TOÀN BỘ lịch sử chứ không trên một trang đã kéo về:
 *
 *  1. `bank_transactions` chiều VÀO đã khớp (máy/tay) vào một `booking_holds` của khách — tiền
 *     giữ chỗ qua SePay. Luôn "thành công": dòng chỉ tồn tại khi tiền đã về ngân hàng.
 *  2. `payment_gateway_orders` nhắm một hold của khách — MoMo/VNPAY (ADR 0058). Cổng KHÔNG ghi vào
 *     `bank_transactions`, nên hai nguồn không đếm đôi cùng một khoản.
 *  3. `withdrawal_requests` của ví `user` của khách — rút ví điểm về ngân hàng.
 *  4. `wallet_entries` của ví đó TRỪ hai loại của lệnh rút (lệnh rút đã là dòng 3).
 *  5. `hold_refunds` chuyển THẲNG về ngân hàng (không `wallet_entry_id`) — hoàn qua ví đã là dòng 4.
 *  6. `payments` của các đơn khách đã thuê (cùng phạm vi với `/account/payments`).
 *
 * Mọi nhánh khoá theo `viewerUserId` của PHIÊN. Ánh xạ trạng thái nằm trong SQL để bộ lọc chạy
 * trong DB. Chỉ đọc — không ghi vào sổ nào.
 */
@Injectable()
export class AccountTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    viewerUserId: string,
    query: AccountTransactionListQueryDto,
  ): Promise<{ data: AccountTransactionDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(
      query,
      ACCOUNT_TRANSACTION_DEFAULT_LIMIT,
      ACCOUNT_TRANSACTION_MAX_LIMIT,
    );
    const union = unionSql(viewerUserId);
    const where = filterSql(query);

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total FROM (${union}) t ${where}`,
      this.prisma.$queryRaw<RawRow[]>`
        SELECT * FROM (${union}) t ${where}
        ORDER BY t.occurred_at DESC, t.id DESC
        LIMIT ${paging.take} OFFSET ${paging.skip}`,
    ]);

    return {
      data: rows.map(toDto),
      meta: paginationMeta(paging, Number(countRows[0]?.total ?? 0)),
    };
  }
}

function filterSql(query: AccountTransactionListQueryDto): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  if (query.status) conds.push(Prisma.sql`t.status = ${query.status}`);
  // Ngày lịch Việt Nam — cùng helper mọi bộ lọc ngày khác của API dùng.
  const from = dayStartUtc(query.from);
  const to = dayEndUtc(query.to);
  if (from) conds.push(Prisma.sql`t.occurred_at >= ${from}`);
  if (to) conds.push(Prisma.sql`t.occurred_at <= ${to}`);
  return conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
}

function unionSql(me: string): Prisma.Sql {
  const S = ACCOUNT_TRANSACTION_STATUS;
  const K = ACCOUNT_TRANSACTION_KIND;
  const T = ACCOUNT_TRANSACTION_TITLE;
  const E = WALLET_ENTRY_KIND;
  const W = WITHDRAWAL_STATUS;

  return Prisma.sql`
    SELECT bt.id::text AS id, ${K.HOLD_PAYMENT}::text AS kind, ${T.HOLD_PAYMENT}::text AS title,
           h.code::text AS code, (-bt.amount_in) AS amount, ${S.SUCCEEDED}::text AS status,
           COALESCE(bt.bank_time, bt.created_at) AS occurred_at,
           COALESCE(h.booking_id, h.booking_request_id)::text AS trip_id,
           b.code::text AS booking_code, false AS cancellable
      FROM bank_transactions bt
      JOIN booking_holds h ON h.id = bt.matched_ref_id
      LEFT JOIN bookings b ON b.id = h.booking_id
     WHERE h.customer_user_id = ${me}
       AND bt.matched_type = ${BANK_MATCH_TARGET_TYPE.BOOKING_HOLD}
       AND bt.direction = ${BANK_DIRECTION.IN}
       AND bt.match_status IN (${BANK_MATCH_STATUS.MATCHED}, ${BANK_MATCH_STATUS.MANUAL})

    UNION ALL
    SELECT o.id, ${K.HOLD_PAYMENT}::text, ${T.HOLD_PAYMENT}::text, h.code,
           -COALESCE(o.paid_amount, o.amount),
           CASE o.status
             WHEN ${PAYMENT_ORDER_STATUS.SUCCEEDED} THEN ${S.SUCCEEDED}::text
             WHEN ${PAYMENT_ORDER_STATUS.PENDING} THEN ${S.PENDING}::text
             ELSE ${S.FAILED}::text END,
           COALESCE(o.provider_paid_at, o.result_at, o.created_at),
           COALESCE(h.booking_id, h.booking_request_id), b.code, false
      FROM payment_gateway_orders o
      JOIN booking_holds h ON h.id = o.booking_hold_id
      LEFT JOIN bookings b ON b.id = h.booking_id
     WHERE h.customer_user_id = ${me}
       AND o.target_type = ${PAYMENT_ORDER_TARGET.BOOKING_HOLD}

    UNION ALL
    SELECT wr.id, ${K.WITHDRAWAL}::text, ${T.WITHDRAWAL}::text, wr.code, wr.amount,
           CASE
             WHEN wr.status = ${W.PAID} THEN ${S.SUCCEEDED}::text
             WHEN wr.status IN (${W.PENDING}, ${W.APPROVED}) THEN ${S.PENDING}::text
             ELSE ${S.FAILED}::text END,
           wr.created_at, NULL::text, NULL::text, (wr.status = ${W.PENDING})
      FROM withdrawal_requests wr
      JOIN wallets w ON w.id = wr.wallet_id
     WHERE w.owner_type = ${WALLET_OWNER_TYPE.USER} AND w.owner_user_id = ${me}

    UNION ALL
    SELECT we.id, ${K.WALLET_CREDIT}::text,
           CASE we.kind
             WHEN ${E.HOLD_REFUND} THEN ${T.HOLD_REFUND}::text
             WHEN ${E.HOLD_OVERPAY} THEN ${T.HOLD_OVERPAY}::text
             WHEN ${E.HOLD_RELEASE} THEN ${T.HOLD_RELEASE}::text
             WHEN ${E.HOLD_FORFEIT} THEN ${T.HOLD_FORFEIT}::text
             ELSE ${T.ADJUSTMENT}::text END,
           h.code, we.amount, ${S.SUCCEEDED}::text, we.created_at,
           COALESCE(we.booking_id, h.booking_id, h.booking_request_id), b.code, false
      FROM wallet_entries we
      JOIN wallets w ON w.id = we.wallet_id
      LEFT JOIN booking_holds h ON h.id = we.hold_id
      LEFT JOIN bookings b ON b.id = COALESCE(we.booking_id, h.booking_id)
     WHERE w.owner_type = ${WALLET_OWNER_TYPE.USER} AND w.owner_user_id = ${me}
       AND we.kind NOT IN (${E.WITHDRAWAL}, ${E.WITHDRAWAL_REVERSAL})

    UNION ALL
    SELECT r.id, ${K.HOLD_REFUND}::text, ${T.HOLD_REFUND}::text, h.code, r.amount,
           CASE r.status
             WHEN ${HOLD_REFUND_STATUS.PAID} THEN ${S.SUCCEEDED}::text
             WHEN ${HOLD_REFUND_STATUS.PENDING} THEN ${S.PENDING}::text
             ELSE ${S.FAILED}::text END,
           COALESCE(r.paid_at, r.created_at),
           COALESCE(h.booking_id, h.booking_request_id), b.code, false
      FROM hold_refunds r
      JOIN booking_holds h ON h.id = r.hold_id
      LEFT JOIN bookings b ON b.id = h.booking_id
     WHERE r.customer_user_id = ${me}
       AND r.wallet_entry_id IS NULL
       AND r.status <> ${HOLD_REFUND_STATUS.CREDITED}

    UNION ALL
    SELECT p.id, ${K.RENTAL_PAYMENT}::text,
           CASE p.kind WHEN ${PAYMENT_KIND.DEPOSIT} THEN ${T.DEPOSIT}::text ELSE ${T.RENTAL}::text END,
           b.code, -p.amount,
           CASE p.status
             WHEN ${PAYMENT_STATUS.SUCCEEDED} THEN ${S.SUCCEEDED}::text
             WHEN ${PAYMENT_STATUS.PENDING} THEN ${S.PENDING}::text
             ELSE ${S.FAILED}::text END,
           COALESCE(p.paid_at, p.created_at), b.id, b.code, false
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      JOIN booking_requests br ON br.booking_id = b.id
     WHERE br.customer_user_id = ${me}
  `;
}

function toDto(r: RawRow): AccountTransactionDto {
  return {
    id: r.id.trim(),
    kind: r.kind as AccountTransactionKind,
    title: r.title as AccountTransactionTitle,
    code: r.code,
    amount: new Prisma.Decimal(r.amount).toFixed(0),
    status: r.status as AccountTransactionStatus,
    occurredAt: r.occurred_at.toISOString(),
    tripId: r.trip_id?.trim() ?? null,
    bookingCode: r.booking_code,
    cancellable: r.cancellable,
  };
}
