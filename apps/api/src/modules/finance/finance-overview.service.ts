import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type PaginationMeta,
} from '@xeprime/types';
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
  return_at: Date;
  total_amount: string;
  paid_amount: string;
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

    const rows = await this.prisma.$queryRaw<DebtRow[]>(Prisma.sql`
      SELECT b.id AS booking_id, b.code, b.customer_name, b.customer_phone,
             v.name AS vehicle_name, b.return_at,
             trim_scale(b.total_amount)::text AS total_amount,
             trim_scale(b.paid_amount)::text AS paid_amount,
             trim_scale(b.total_amount - b.paid_amount)::text AS debt_amount
      FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
      WHERE b.tenant_id = ${tenantId} AND b.deleted_at IS NULL
        AND b.status <> ${BOOKING_STATUS.CANCELLED}
        AND b.total_amount > b.paid_amount
        ${filterSql}
      ORDER BY b.return_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM bookings b
      WHERE b.tenant_id = ${tenantId} AND b.deleted_at IS NULL
        AND b.status <> ${BOOKING_STATUS.CANCELLED}
        AND b.total_amount > b.paid_amount
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
        returnAt: r.return_at.toISOString(),
        totalAmount: r.total_amount,
        paidAmount: r.paid_amount,
        debtAmount: r.debt_amount,
      })),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async summary(tenantId: string, query: FinanceSummaryQueryDto): Promise<FinanceSummaryDto> {
    const createdAt =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          }
        : undefined;
    const base: Prisma.ReceiptWhereInput = {
      tenantId,
      status: RECEIPT_STATUS.APPROVED,
      deletedAt: null,
      ...(createdAt ? { createdAt } : {}),
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
        SELECT trim_scale(COALESCE(SUM(total_amount - paid_amount), 0))::text AS total, COUNT(*)::bigint AS cnt
        FROM bookings
        WHERE tenant_id = ${tenantId} AND deleted_at IS NULL
          AND status <> ${BOOKING_STATUS.CANCELLED} AND total_amount > paid_amount
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
      return Prisma.sql`AND b.paid_amount = 0`;
    default:
      return Prisma.empty;
  }
}
