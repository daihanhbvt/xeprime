import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  WALLET_ACTIVITY_SOURCE,
  WALLET_ENTRY_KIND,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_TERMS,
  isTaxPeriodKey,
  maskAccountNumber,
  taxPeriodKeyVn,
  taxPeriodRangeVn,
  type WalletActivitySource,
  type WalletEntryKind,
  type WalletStatus,
  type WithdrawalStatus,
} from '@xeprime/types';
import { resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
  type WalletActivityDto,
  type WalletActivityPageDto,
  type WalletActivityQueryDto,
  type WalletEntryPageDto,
  type WalletEntryQueryDto,
  type WalletSummaryDto,
} from './dto/wallet.dto';
import { WalletService, type WalletOwner } from './wallet.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Đọc ví — tách khỏi `WalletService` (writer) để đường GHI không mọc thêm bề mặt đọc.
 *
 * Sổ ví là một danh sách chỉ dài thêm, nên phân trang ở SERVER và có index
 * `(wallet_id, created_at)` đi kèm: một chủ xe chạy vài trăm chuyến một năm sẽ có sổ dài hàng
 * nghìn dòng, và tải hết về client là cách nó chậm dần cho tới lúc không mở nổi.
 */
@Injectable()
export class WalletReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /**
   * Ba con số + cam kết thời gian.
   *
   * Cam kết đi kèm ngay trong response thay vì để FE tự hardcode: *việc phải hiện một cam kết
   * trước khi người dùng bấm rút* là QUY TẮC (ADR 0025 điều 7), còn con số là dữ liệu — và hai
   * client (web, native) phải nói cùng một con số.
   */
  async summary(owner: WalletOwner): Promise<WalletSummaryDto> {
    const s = await this.wallet.summaryFor(owner);
    return {
      available: s.available,
      pending: s.pending,
      total: s.total,
      status: s.status as WalletStatus,
      minWithdrawAmount: String(WITHDRAWAL_TERMS.MIN_AMOUNT),
      maxBusinessDays: WITHDRAWAL_TERMS.MAX_BUSINESS_DAYS,
    };
  }

  async entries(owner: WalletOwner, query: WalletEntryQueryDto): Promise<WalletEntryPageDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

    const walletId = await this.wallet.findWalletId(owner);
    // Chưa có ví = chưa từng có khoản nào. Trang rỗng, không phải 404.
    if (!walletId) return { items: [], total: 0, page, limit, hasNext: false };

    const where: Prisma.WalletEntryWhereInput = { walletId };
    const [total, rows] = await Promise.all([
      this.prisma.walletEntry.count({ where }),
      this.prisma.walletEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          amount: true,
          balanceAfter: true,
          bookingId: true,
          note: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind as WalletEntryKind,
        amount: row.amount.toFixed(0),
        balanceAfter: row.balanceAfter.toFixed(0),
        bookingId: row.bookingId,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      hasNext: page * limit < total,
    };
  }

  /**
   * "Biến động số dư" của một kỳ — bút toán sổ ví và lệnh rút trong MỘT danh sách.
   *
   * `UNION ALL` ngay trong Postgres để đếm và phân trang đúng trên cả kỳ, không trên một trang đã
   * kéo về (cùng khuôn với `/account/transactions` của khách). Hai bút toán của lệnh rút
   * (`withdrawal`, `withdrawal_reversal`) bị loại: lệnh rút đã là dòng của chính nó, kể lại chúng
   * là đếm một khoản hai lần. Cả hai nhánh lọc theo `wallet_id` + `created_at` — index
   * `(wallet_id, created_at)` có sẵn ở cả hai bảng.
   */
  async activity(
    owner: WalletOwner,
    query: WalletActivityQueryDto,
  ): Promise<WalletActivityPageDto> {
    const period =
      query.period && isTaxPeriodKey(query.period) ? query.period : taxPeriodKeyVn(new Date());
    const paging = resolvePaging(query, ACTIVITY_DEFAULT_LIMIT, ACTIVITY_MAX_LIMIT);
    const empty = {
      items: [],
      period,
      total: 0,
      page: paging.page,
      limit: paging.limit,
      hasNext: false,
    };

    const walletId = await this.wallet.findWalletId(owner);
    if (!walletId) return empty;

    const { start, end } = taxPeriodRangeVn(period);
    const E = WALLET_ENTRY_KIND;
    const union = Prisma.sql`
      SELECT wr.id::text AS id, ${WALLET_ACTIVITY_SOURCE.WITHDRAWAL}::text AS source,
             NULL::text AS kind, wr.code::text AS code, NULL::text AS booking_id,
             (-wr.amount) AS amount, NULL::numeric AS balance_after, wr.created_at AS occurred_at,
             wr.status::text AS w_status, wr.bank_code::text AS bank_code,
             wr.bank_account_number::text AS bank_account_number, wr.due_by, wr.paid_at,
             wr.reject_reason, wr.reverse_reason
        FROM withdrawal_requests wr
       WHERE wr.wallet_id = ${walletId}
         AND wr.created_at >= ${start} AND wr.created_at < ${end}

      UNION ALL
      SELECT we.id::text, ${WALLET_ACTIVITY_SOURCE.ENTRY}::text, we.kind::text, b.code::text,
             b.id::text, we.amount, we.balance_after, we.created_at,
             NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::timestamptz,
             NULL::text, NULL::text
        FROM wallet_entries we
        LEFT JOIN booking_holds h ON h.id = we.hold_id
        LEFT JOIN bookings b ON b.id = COALESCE(we.booking_id, h.booking_id)
       WHERE we.wallet_id = ${walletId}
         AND we.kind NOT IN (${E.WITHDRAWAL}, ${E.WITHDRAWAL_REVERSAL})
         AND we.created_at >= ${start} AND we.created_at < ${end}
    `;

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total FROM (${union}) t`,
      this.prisma.$queryRaw<ActivityRow[]>`
        SELECT * FROM (${union}) t
        ORDER BY t.occurred_at DESC, t.id DESC
        LIMIT ${paging.take} OFFSET ${paging.skip}`,
    ]);
    const total = Number(countRows[0]?.total ?? 0);

    return {
      ...empty,
      items: rows.map(toActivityDto),
      total,
      hasNext: paging.page * paging.limit < total,
    };
  }
}

interface ActivityRow {
  id: string;
  source: string;
  kind: string | null;
  code: string | null;
  booking_id: string | null;
  amount: Prisma.Decimal | string;
  balance_after: Prisma.Decimal | string | null;
  occurred_at: Date;
  w_status: string | null;
  bank_code: string | null;
  bank_account_number: string | null;
  due_by: Date | null;
  paid_at: Date | null;
  reject_reason: string | null;
  reverse_reason: string | null;
}

function toActivityDto(r: ActivityRow): WalletActivityDto {
  const isWithdrawal = r.source === WALLET_ACTIVITY_SOURCE.WITHDRAWAL;
  return {
    id: r.id.trim(),
    source: r.source as WalletActivitySource,
    kind: (r.kind as WalletEntryKind | null) ?? null,
    code: r.code,
    bookingId: r.booking_id?.trim() ?? null,
    amount: new Prisma.Decimal(r.amount).toFixed(0),
    balanceAfter: r.balance_after == null ? null : new Prisma.Decimal(r.balance_after).toFixed(0),
    occurredAt: r.occurred_at.toISOString(),
    cancellable: isWithdrawal && r.w_status === WITHDRAWAL_STATUS.PENDING,
    withdrawal: isWithdrawal
      ? {
          status: r.w_status as WithdrawalStatus,
          bankCode: r.bank_code ?? '',
          // PII: chủ ví chỉ cần nhận ra tài khoản, không cần đọc lại số.
          accountNumberMasked: maskAccountNumber(r.bank_account_number) ?? '',
          dueBy: r.due_by?.toISOString() ?? null,
          paidAt: r.paid_at?.toISOString() ?? null,
          rejectReason: r.reject_reason,
          reverseReason: r.reverse_reason,
        }
      : null,
  };
}
