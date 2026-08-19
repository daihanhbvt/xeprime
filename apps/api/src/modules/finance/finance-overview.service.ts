import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type PaginationMeta,
} from '@xeprime/types';
import {
  BOOKING_MONEY_JOINS,
  SQL_AMOUNT_DUE,
  SQL_COLLECTED,
  SQL_DEBT,
  SQL_DEBT_SCOPE,
  SQL_HAS_DEBT,
} from '../../common/booking-money';
import { dayRangeFilter } from '../../common/day-range';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DebtItemDto,
  DebtListQueryDto,
  FinanceSummaryDto,
  FinanceSummaryQueryDto,
  RECEIPT_DEFAULT_LIMIT,
  RECEIPT_MAX_LIMIT,
} from './dto/finance.dto';

interface DebtRow {
  booking_id: string;
  code: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_name: string;
  status: string;
  return_at: Date;
  total_amount: string;
  paid_amount: string;
  surcharge_total: string;
  debt_amount: string;
}

/**
 * Công nợ + dashboard tài chính. Công nợ TÍNH ĐỘNG từ bookings (`total_amount > paid_amount`) —
 * không bảng debts (tránh drift). Prisma không so sánh cột-với-cột nên dùng `$queryRaw` tham số hoá.
 */
@Injectable()
export class FinanceOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async debts(
    tenantId: string,
    query: DebtListQueryDto,
  ): Promise<{ data: DebtItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(RECEIPT_MAX_LIMIT, Math.max(1, query.limit ?? RECEIPT_DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const filterSql = debtFilterSql(query.filter, now, soon);

    // `phải thu` / `đã thu` / `còn nợ` đến từ `common/booking-money.ts` — cùng công thức với
    // chi tiết đơn, sổ khách và hợp đồng. Trước đây câu này tự viết `total - paid`, nên một đơn
    // có phụ phí quá giờ chưa thu vẫn báo hết nợ và không ai đi đòi.
    const rows = await this.prisma.$queryRaw<DebtRow[]>(Prisma.sql`
      SELECT b.id AS booking_id, b.code, b.customer_name, b.customer_phone,
             v.name AS vehicle_name, b.status, b.return_at,
             trim_scale(${SQL_AMOUNT_DUE})::text AS total_amount,
             trim_scale(${SQL_COLLECTED})::text AS paid_amount,
             trim_scale(sur.total)::text AS surcharge_total,
             trim_scale(${SQL_DEBT})::text AS debt_amount
      FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
      ${BOOKING_MONEY_JOINS}
      WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE}
        AND ${SQL_HAS_DEBT}
        ${filterSql}
      ORDER BY b.return_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM bookings b
      ${BOOKING_MONEY_JOINS}
      WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE}
        AND ${SQL_HAS_DEBT}
        ${filterSql}
    `);
    const total = Number(countRes[0]?.count ?? 0);

    return {
      data: rows.map((r) => ({
        bookingId: r.booking_id,
        code: r.code,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        vehicleName: r.vehicle_name,
        status: r.status,
        returnAt: r.return_at.toISOString(),
        totalAmount: r.total_amount,
        paidAmount: r.paid_amount,
        surchargeTotal: r.surcharge_total,
        debtAmount: r.debt_amount,
      })),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async summary(tenantId: string, query: FinanceSummaryQueryDto): Promise<FinanceSummaryDto> {
    // Cùng cột và cùng cách hiểu biên ngày với `/receipts` — trước đây màn này lọc `created_at`
    // với ISO đầy đủ còn sổ lọc `created_at` với `YYYY-MM-DD`, nên hai màn ra hai con số.
    const occurredAt = dayRangeFilter(query.from, query.to);
    const base: Prisma.ReceiptWhereInput = {
      tenantId,
      status: RECEIPT_STATUS.APPROVED,
      deletedAt: null,
      ...(occurredAt ? { occurredAt } : {}),
    };

    const [income, expense, debtAgg] = await Promise.all([
      this.prisma.receipt.aggregate({
        where: { ...base, type: RECEIPT_TYPE.INCOME },
        _sum: { amount: true },
      }),
      this.prisma.receipt.aggregate({
        where: { ...base, type: RECEIPT_TYPE.EXPENSE },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<{ total: string; cnt: bigint }[]>(Prisma.sql`
        SELECT trim_scale(COALESCE(SUM(${SQL_DEBT}), 0))::text AS total, COUNT(*)::bigint AS cnt
        FROM bookings b
        ${BOOKING_MONEY_JOINS}
        WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE} AND ${SQL_HAS_DEBT}
      `),
    ]);

    const inc = income._sum.amount ?? new Prisma.Decimal(0);
    const exp = expense._sum.amount ?? new Prisma.Decimal(0);

    return {
      totalIncome: inc.toString(),
      totalExpense: exp.toString(),
      balance: new Prisma.Decimal(inc).minus(exp).toString(),
      totalDebt: debtAgg[0]?.total ?? '0',
      debtBookings: Number(debtAgg[0]?.cnt ?? 0),
    };
  }
}

/** Lọc công nợ theo hạn trả. */
function debtFilterSql(filter: string | undefined, now: Date, soon: Date): Prisma.Sql {
  switch (filter) {
    case 'overdue':
      return Prisma.sql`AND b.return_at < ${now} AND b.status NOT IN (${BOOKING_STATUS.COMPLETED}, ${BOOKING_STATUS.CANCELLED})`;
    case 'upcoming':
      return Prisma.sql`AND b.return_at >= ${now} AND b.return_at <= ${soon}`;
    case 'unpaid':
      // "Chưa thu đồng nào" tính trên ĐÃ THU đầy đủ, không chỉ `paid_amount`: một đơn đã nhận
      // 200k quá giờ bằng phiếu tay thì không còn là chưa thu gì.
      return Prisma.sql`AND ${SQL_COLLECTED} = 0`;
    default:
      return Prisma.empty;
  }
}
