import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  CUSTOMER_REVENUE_SORT,
  FINANCE_GRANULARITY,
  FINANCE_MAX_BUCKETS,
  PAYMENT_KIND,
  PAYMENT_STATUS,
  RECEIPT_TYPE,
  VEHICLE_PROFIT_SORT,
  type FinanceGranularity,
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
import {
  SQL_BUSINESS_ONLY,
  SQL_REAL_MONEY,
  profitMarginPercent,
  resolveGranularity,
  resolvePeriodBounds,
  sqlBookingScope,
  sqlOccurredRange,
  sqlReceiptScope,
} from '../../common/finance-period';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CustomerRevenueItemDto,
  CustomerRevenueQueryDto,
  DebtItemDto,
  DebtListQueryDto,
  FinanceCategoryBreakdownDto,
  FinanceCategoryBreakdownQueryDto,
  FinanceSeriesDto,
  FinanceSeriesQueryDto,
  FinanceSummaryDto,
  FinanceSummaryQueryDto,
  RECEIPT_DEFAULT_LIMIT,
  RECEIPT_MAX_LIMIT,
  VehicleProfitItemDto,
  VehicleProfitQueryDto,
} from './dto/finance.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

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

interface MoneyRow {
  cash_in: string;
  cash_out: string;
  revenue: string;
  cost: string;
  unassigned_cost: string;
  unassigned_revenue: string;
}

interface SeriesRow {
  bucket: string;
  revenue: string;
  cost: string;
  cash_in: string;
  cash_out: string;
}

interface CategoryRow {
  category_id: string | null;
  name: string | null;
  system_key: string | null;
  amount: string;
  cnt: bigint;
}

interface CustomerRevenueRow {
  tenant_customer_id: string;
  full_name: string;
  trips: bigint;
  revenue: string;
  share_percent: number | null;
  total_count: bigint;
}

interface VehicleProfitRow {
  vehicle_id: string;
  vehicle_name: string;
  plate_number: string | null;
  trips: bigint;
  revenue: string;
  cost: string;
  profit: string;
  total_count: bigint;
}

/** Bước `generate_series` của từng độ mịn — giá trị đến từ union đã validate, không từ client. */
const SERIES_STEP: Readonly<Record<FinanceGranularity, string>> = {
  [FINANCE_GRANULARITY.DAY]: '1 day',
  [FINANCE_GRANULARITY.WEEK]: '1 week',
  [FINANCE_GRANULARITY.MONTH]: '1 month',
};

/** Số ngày trung bình một bucket phủ — chỉ để ƯỚC LƯỢNG số cột, không dùng để tính tiền. */
const DAYS_PER_BUCKET: Readonly<Record<FinanceGranularity, number>> = {
  [FINANCE_GRANULARITY.DAY]: 1,
  [FINANCE_GRANULARITY.WEEK]: 7,
  [FINANCE_GRANULARITY.MONTH]: 28,
};

/**
 * Công nợ + báo cáo tài chính của gian hàng.
 *
 * Công nợ TÍNH ĐỘNG từ `bookings` (không bảng `debts` — tránh drift), theo đúng công thức duy
 * nhất ở `common/booking-money.ts`. Doanh thu/chi phí đi qua `common/finance-period.ts` để bề mặt
 * này và thẻ xe ở `/manage/vehicles` không bao giờ trả hai con số cho cùng một câu hỏi.
 *
 * Prisma không so cột-với-cột, không `date_trunc`, không `generate_series` — nên các báo cáo là
 * `$queryRaw` THAM SỐ HOÁ: mọi giá trị đi bằng bind param, kể cả tên độ mịn và cột sắp xếp.
 */
@Injectable()
export class FinanceOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async debts(
    tenantId: string,
    query: DebtListQueryDto,
  ): Promise<{ data: DebtItemDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, RECEIPT_DEFAULT_LIMIT, RECEIPT_MAX_LIMIT);
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const filterSql = debtFilterSql(query.filter, now, soon);
    const searchSql = debtSearchSql(query.q);

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
        ${searchSql}
      ORDER BY b.return_at ASC
      LIMIT ${paging.take} OFFSET ${paging.skip}
    `);

    const countRes = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      -- Cùng FROM với câu lấy trang: ô tìm kiếm chạm cả tên xe/biển số, nên thiếu join này
      -- thì tổng số đếm được sẽ nhiều hơn số dòng thật sự trả về.
      FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
      ${BOOKING_MONEY_JOINS}
      WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE}
        AND ${SQL_HAS_DEBT}
        ${filterSql}
        ${searchSql}
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
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Ba lớp tiền của một kỳ — xem docblock `FinanceSummaryDto`.
   *
   * Bốn con số tiền lấy bằng MỘT câu với `FILTER (WHERE …)` thay vì bốn `aggregate` riêng: cùng
   * một lần quét `receipts_tenant_occurred_idx`, và quan trọng hơn — bốn con số chắc chắn đến từ
   * cùng một ảnh chụp dữ liệu chứ không phải bốn thời điểm cách nhau vài mili giây.
   */
  async summary(tenantId: string, query: FinanceSummaryQueryDto): Promise<FinanceSummaryDto> {
    // Cùng cột và cùng cách hiểu biên ngày với `/receipts` — trước đây màn này lọc `created_at`
    // với ISO đầy đủ còn sổ lọc `created_at` với `YYYY-MM-DD`, nên hai màn ra hai con số.
    const fromAt = dayStartOf(query.from);
    const toAt = dayEndOf(query.to);
    const range = sqlOccurredRange(fromAt, toAt);
    // Phạm vi diễn đạt bằng hai cột khác nhau ở hai bảng: tiền nằm ở `receipts`, còn số chuyến /
    // cọc / công nợ nằm ở `bookings`. Cùng một câu hỏi, hai mệnh đề lọc.
    const receiptScope = sqlReceiptScope(query);
    const bookingScope = sqlBookingScope(query);

    const [moneyRows, debtAgg, deposit, trips] = await Promise.all([
      this.prisma.$queryRaw<MoneyRow[]>(Prisma.sql`
        SELECT
          trim_scale(COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME}), 0))::text
            AS cash_in,
          trim_scale(COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.EXPENSE}), 0))::text
            AS cash_out,
          trim_scale(COALESCE(SUM(r.amount)
            FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME} AND ${SQL_BUSINESS_ONLY}), 0))::text
            AS revenue,
          trim_scale(COALESCE(SUM(r.amount)
            FILTER (WHERE r.type = ${RECEIPT_TYPE.EXPENSE} AND ${SQL_BUSINESS_ONLY}), 0))::text
            AS cost,
          trim_scale(COALESCE(SUM(r.amount)
            FILTER (WHERE r.type = ${RECEIPT_TYPE.EXPENSE} AND ${SQL_BUSINESS_ONLY}
                      AND r.vehicle_id IS NULL), 0))::text
            AS unassigned_cost,
          trim_scale(COALESCE(SUM(r.amount)
            FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME} AND ${SQL_BUSINESS_ONLY}
                      AND r.tenant_customer_id IS NULL), 0))::text
            AS unassigned_revenue
        FROM receipts r
        WHERE r.tenant_id = ${tenantId} AND ${SQL_REAL_MONEY} ${range} ${receiptScope}
      `),
      this.prisma.$queryRaw<{ total: string; cnt: bigint }[]>(Prisma.sql`
        SELECT trim_scale(COALESCE(SUM(${SQL_DEBT}), 0))::text AS total, COUNT(*)::bigint AS cnt
        FROM bookings b
        ${BOOKING_MONEY_JOINS}
        WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE} AND ${SQL_HAS_DEBT} ${bookingScope}
      `),
      this.depositHeld(tenantId, bookingScope),
      this.prisma.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS cnt
        FROM bookings b
        WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE}
          ${bookingScope}
          ${fromAt ? Prisma.sql`AND b.pickup_at >= ${fromAt}` : Prisma.empty}
          ${toAt ? Prisma.sql`AND b.pickup_at <= ${toAt}` : Prisma.empty}
      `),
    ]);

    const money = moneyRows[0];
    const revenue = new Prisma.Decimal(money?.revenue ?? 0);
    const cost = new Prisma.Decimal(money?.cost ?? 0);
    const cashIn = new Prisma.Decimal(money?.cash_in ?? 0);
    const cashOut = new Prisma.Decimal(money?.cash_out ?? 0);
    const profit = revenue.minus(cost);

    return {
      totalIncome: cashIn.toString(),
      totalExpense: cashOut.toString(),
      balance: cashIn.minus(cashOut).toString(),
      revenue: revenue.toString(),
      cost: cost.toString(),
      unassignedCost: money?.unassigned_cost ?? '0',
      unassignedRevenue: money?.unassigned_revenue ?? '0',
      profit: profit.toString(),
      profitMarginPercent: profitMarginPercent(revenue, profit),
      depositHeld: deposit.amount,
      depositHeldBookings: deposit.bookings,
      totalDebt: debtAgg[0]?.total ?? '0',
      debtBookings: Number(debtAgg[0]?.cnt ?? 0),
      trips: Number(trips[0]?.cnt ?? 0),
    };
  }

  /**
   * Cọc ĐANG CẦM — không lọc theo kỳ, vì câu hỏi là "lúc này tôi đang giữ hộ khách bao nhiêu".
   *
   * Kẹp sàn 0 TỪNG ĐƠN (`GREATEST(…, 0)`) chứ không kẹp ở tổng: một đơn lỡ ghi hoàn dư không được
   * phép ăn bớt cọc đang giữ của đơn khác. Đơn huỷ/đã xoá nằm ngoài phép tính (`SQL_DEBT_SCOPE`).
   */
  private async depositHeld(
    tenantId: string,
    bookingScope: Prisma.Sql,
  ): Promise<{ amount: string; bookings: number }> {
    const rows = await this.prisma.$queryRaw<{ total: string; cnt: bigint }[]>(Prisma.sql`
      SELECT trim_scale(COALESCE(SUM(held), 0))::text AS total,
             COUNT(*) FILTER (WHERE held > 0)::bigint AS cnt
      FROM (
        SELECT GREATEST(dep.total - COALESCE(s.refund_amount, 0), 0) AS held
        FROM bookings b
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(p.amount), 0) AS total
          FROM payments p
          WHERE p.booking_id = b.id
            AND p.kind = ${PAYMENT_KIND.DEPOSIT}
            AND p.status = ${PAYMENT_STATUS.SUCCEEDED}
        ) dep ON TRUE
        LEFT JOIN booking_deposit_settlements s ON s.booking_id = b.id
        WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE} ${bookingScope}
      ) x
    `);
    return { amount: rows[0]?.total ?? '0', bookings: Number(rows[0]?.cnt ?? 0) };
  }

  /**
   * Chuỗi thời gian thu-chi cho biểu đồ.
   *
   * Ba điều bắt buộc, bỏ điều nào cũng là vẽ ra thứ không có thật:
   *
   * 1. **Gộp theo giờ Việt Nam.** Một phiếu 05:00 sáng VN có `occurred_at` là 22:00 UTC hôm
   *    trước — gộp theo UTC là ném doanh thu sang sai ngày.
   * 2. **Điền bucket rỗng.** Thiếu `generate_series`, ba ngày không phiếu biến mất và đường lợi
   *    nhuận nối thẳng qua khoảng trống, tức vẽ ra một xu hướng không tồn tại.
   * 3. **Server chốt độ mịn** rồi trả lại giá trị đã dùng — client hiển thị đúng thứ đã vẽ.
   */
  async series(tenantId: string, query: FinanceSeriesQueryDto): Promise<FinanceSeriesDto> {
    const { fromAt, toAt } = resolvePeriodBounds(query.from, query.to);
    const requested = (query.granularity ?? FINANCE_GRANULARITY.DAY) as FinanceGranularity;
    const granularity = resolveGranularity(requested, fromAt, toAt, FINANCE_MAX_BUCKETS);

    assertBucketsFit(granularity, fromAt, toAt);

    const rows = await this.prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
      WITH bounds AS (
        SELECT date_trunc(${granularity}, ${fromAt}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')
                 AS b_from,
               date_trunc(${granularity}, ${toAt}::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')
                 AS b_to
      ),
      slots AS (
        SELECT generate_series(b_from, b_to, ${SERIES_STEP[granularity]}::interval) AS bucket
        FROM bounds
      ),
      agg AS (
        SELECT date_trunc(${granularity}, r.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS bucket,
               COALESCE(SUM(r.amount)
                 FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME} AND ${SQL_BUSINESS_ONLY}), 0)
                 AS revenue,
               COALESCE(SUM(r.amount)
                 FILTER (WHERE r.type = ${RECEIPT_TYPE.EXPENSE} AND ${SQL_BUSINESS_ONLY}), 0)
                 AS cost,
               COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME}), 0) AS cash_in,
               COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.EXPENSE}), 0) AS cash_out
        FROM receipts r
        WHERE r.tenant_id = ${tenantId} AND ${SQL_REAL_MONEY}
          AND r.occurred_at >= ${fromAt} AND r.occurred_at <= ${toAt}
          ${sqlReceiptScope(query)}
        GROUP BY 1
      )
      SELECT to_char(s.bucket, 'YYYY-MM-DD') AS bucket,
             trim_scale(COALESCE(a.revenue, 0))::text AS revenue,
             trim_scale(COALESCE(a.cost, 0))::text AS cost,
             trim_scale(COALESCE(a.cash_in, 0))::text AS cash_in,
             trim_scale(COALESCE(a.cash_out, 0))::text AS cash_out
      FROM slots s LEFT JOIN agg a ON a.bucket = s.bucket
      ORDER BY s.bucket ASC
    `);

    return {
      granularity,
      buckets: rows.map((r) => ({
        bucket: r.bucket,
        revenue: r.revenue,
        cost: r.cost,
        profit: new Prisma.Decimal(r.revenue).minus(r.cost).toString(),
        cashIn: r.cash_in,
        cashOut: r.cash_out,
      })),
    };
  }

  /**
   * Cơ cấu doanh thu (hoặc chi phí) theo danh mục.
   *
   * Phiếu chưa gán danh mục KHÔNG bị bỏ đi — nó thành một dòng `categoryId: null`. Lọc nó ra thì
   * tổng các dòng nhỏ hơn thẻ ngay phía trên, và không ai giải thích được phần chênh.
   *
   * Trả cả `systemKey` vì tên danh mục hệ thống nằm trong DB bằng tiếng Việt: giao diện tiếng Anh
   * dịch NHÃN từ khoá đó, còn danh mục riêng của gian hàng giữ nguyên tên người dùng đặt (ADR 0012).
   */
  async byCategory(
    tenantId: string,
    query: FinanceCategoryBreakdownQueryDto,
  ): Promise<FinanceCategoryBreakdownDto> {
    const range = sqlOccurredRange(dayStartOf(query.from), dayEndOf(query.to));

    const rows = await this.prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
      SELECT r.category_id, c.name, c.system_key,
             trim_scale(SUM(r.amount))::text AS amount,
             COUNT(*)::bigint AS cnt
      FROM receipts r
      LEFT JOIN finance_categories c ON c.id = r.category_id
      WHERE r.tenant_id = ${tenantId} AND ${SQL_REAL_MONEY} AND ${SQL_BUSINESS_ONLY}
        AND r.type = ${query.type}
        ${range}
        ${sqlReceiptScope(query)}
      GROUP BY r.category_id, c.name, c.system_key
      ORDER BY SUM(r.amount) DESC
    `);

    const total = rows.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));

    return {
      total: total.toString(),
      items: rows.map((r) => ({
        categoryId: r.category_id,
        name: r.name,
        systemKey: r.system_key,
        amount: r.amount,
        // Tỷ trọng tính trên Decimal rồi mới ra `number`: phần trăm là số để vẽ thanh, không
        // phải tiền — nhưng phép chia vẫn phải chạy trên Decimal để không lệch ở số lớn.
        sharePercent: total.isZero()
          ? 0
          : Number(new Prisma.Decimal(r.amount).dividedBy(total).times(100).toDecimalPlaces(1)),
        count: Number(r.cnt),
      })),
    };
  }

  /**
   * Lãi/lỗ theo từng xe trong kỳ.
   *
   * Tập dòng là HỢP của "xe có phát sinh tiền" và "xe có chuyến" — một chiếc xe chạy cả tháng mà
   * tiền chưa lên sổ vẫn phải xuất hiện (đó chính là dấu hiệu cần đi ghi phiếu), và một chiếc xe
   * chỉ tốn tiền sửa mà không chạy chuyến nào cũng vậy.
   *
   * `COUNT(*) OVER ()` thay cho một câu đếm thứ hai: hai câu dùng chung một CTE là hai chỗ để
   * trôi khỏi nhau ngay lần đầu ai đó sửa điều kiện ở một câu.
   */
  async byVehicle(
    tenantId: string,
    query: VehicleProfitQueryDto,
  ): Promise<{ data: VehicleProfitItemDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, RECEIPT_DEFAULT_LIMIT, RECEIPT_MAX_LIMIT);
    const fromAt = dayStartOf(query.from);
    const toAt = dayEndOf(query.to);
    const range = sqlOccurredRange(fromAt, toAt);
    // Chuyến tính theo NGÀY NHẬN XE: đó là lúc chiếc xe bắt đầu làm ra tiền, và là mốc chủ xe
    // dùng khi hỏi "tháng này xe chạy mấy chuyến".
    const tripRange = Prisma.sql`
      ${fromAt ? Prisma.sql`AND b.pickup_at >= ${fromAt}` : Prisma.empty}
      ${toAt ? Prisma.sql`AND b.pickup_at <= ${toAt}` : Prisma.empty}`;

    const rows = await this.prisma.$queryRaw<VehicleProfitRow[]>(Prisma.sql`
        WITH money AS (
          SELECT r.vehicle_id,
                 COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME}), 0) AS revenue,
                 COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.EXPENSE}), 0) AS cost
          FROM receipts r
          WHERE r.tenant_id = ${tenantId} AND r.vehicle_id IS NOT NULL
            AND ${SQL_REAL_MONEY} AND ${SQL_BUSINESS_ONLY}
            ${range}
          GROUP BY r.vehicle_id
        ),
        trips AS (
          SELECT b.vehicle_id, COUNT(*)::bigint AS trips
          FROM bookings b
          WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE}
            ${tripRange}
          GROUP BY b.vehicle_id
        ),
        ids AS (
          SELECT vehicle_id FROM money UNION SELECT vehicle_id FROM trips
        ),
        joined AS (
          SELECT v.id AS vehicle_id, v.name AS vehicle_name, v.plate_number,
                 COALESCE(t.trips, 0) AS trips,
                 COALESCE(m.revenue, 0) AS revenue,
                 COALESCE(m.cost, 0) AS cost,
                 COALESCE(m.revenue, 0) - COALESCE(m.cost, 0) AS profit
          FROM ids i
          -- Điều kiện tenant lặp lại có chủ đích: id xe đoán được của gian hàng khác sẽ rơi
          -- ra ngoài ngay cả khi một CTE phía trên lỡ sót điều kiện tenant.
          JOIN vehicles v ON v.id = i.vehicle_id AND v.tenant_id = ${tenantId}
          LEFT JOIN money m ON m.vehicle_id = i.vehicle_id
          LEFT JOIN trips t ON t.vehicle_id = i.vehicle_id
        )
        SELECT vehicle_id, vehicle_name, plate_number, trips,
               trim_scale(revenue)::text AS revenue,
               trim_scale(cost)::text AS cost,
               trim_scale(profit)::text AS profit,
               COUNT(*) OVER ()::bigint AS total_count
        FROM joined
        ORDER BY ${vehicleSortSql(query.sort)} DESC, vehicle_name ASC
        LIMIT ${paging.take} OFFSET ${paging.skip}
      `);

    return {
      data: rows.map((r) => ({
        vehicleId: r.vehicle_id,
        vehicleName: r.vehicle_name,
        plateNumber: r.plate_number,
        trips: Number(r.trips),
        revenue: r.revenue,
        cost: r.cost,
        profit: r.profit,
        profitMarginPercent: profitMarginPercent(
          new Prisma.Decimal(r.revenue),
          new Prisma.Decimal(r.profit),
        ),
      })),
      meta: paginationMeta(paging, Number(rows[0]?.total_count ?? 0)),
    };
  }

  /**
   * Doanh thu theo từng KHÁCH trong kỳ.
   *
   * Cùng khuôn với `byVehicle` và cùng lý do: tập dòng là HỢP của "khách có phát sinh tiền" và
   * "khách có chuyến". Một khách thuê cả tháng mà tiền chưa lên sổ vẫn phải hiện ra — đó chính là
   * dấu hiệu cần đi thu tiền, nên giấu đi là giấu mất việc cần làm.
   *
   * **Cơ sở là TIỀN THẬT ĐÃ THU**, không phải giá trị đơn đã chốt. Sổ khách có một con số khác
   * ("Tổng giá trị thuê") tính trên `bookings` — đó là bề mặt đi ĐÒI NỢ và nó phải tính trên đơn.
   * Hai câu hỏi khác nhau nên hai con số; nhãn của mỗi bề mặt nói rõ mình đang trả lời câu nào.
   *
   * Phiếu thu không gắn khách nào (thu tay không liên kết đơn) KHÔNG lọt vào đây — chúng nằm ở
   * `summary.unassignedRevenue` để phần chênh với thẻ "Doanh thu" luôn có chỗ giải thích.
   */
  async byCustomer(
    tenantId: string,
    query: CustomerRevenueQueryDto,
  ): Promise<{ data: CustomerRevenueItemDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, RECEIPT_DEFAULT_LIMIT, RECEIPT_MAX_LIMIT);
    const fromAt = dayStartOf(query.from);
    const toAt = dayEndOf(query.to);
    const range = sqlOccurredRange(fromAt, toAt);
    const tripRange = Prisma.sql`
      ${fromAt ? Prisma.sql`AND b.pickup_at >= ${fromAt}` : Prisma.empty}
      ${toAt ? Prisma.sql`AND b.pickup_at <= ${toAt}` : Prisma.empty}`;

    const rows = await this.prisma.$queryRaw<CustomerRevenueRow[]>(Prisma.sql`
      WITH money AS (
        SELECT r.tenant_customer_id,
               COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${RECEIPT_TYPE.INCOME}), 0) AS revenue
        FROM receipts r
        WHERE r.tenant_id = ${tenantId} AND r.tenant_customer_id IS NOT NULL
          AND ${SQL_REAL_MONEY} AND ${SQL_BUSINESS_ONLY}
          ${range}
        GROUP BY r.tenant_customer_id
      ),
      trips AS (
        SELECT b.tenant_customer_id, COUNT(*)::bigint AS trips
        FROM bookings b
        WHERE b.tenant_id = ${tenantId} AND ${SQL_DEBT_SCOPE}
          AND b.tenant_customer_id IS NOT NULL
          ${tripRange}
        GROUP BY b.tenant_customer_id
      ),
      ids AS (
        SELECT tenant_customer_id FROM money UNION SELECT tenant_customer_id FROM trips
      ),
      -- Mẫu số của tỷ trọng là doanh thu CẢ KỲ, kể cả phần chưa gắn khách — tức đúng con số trên
      -- thẻ "Doanh thu". Lấy tổng của các dòng làm mẫu số sẽ cho ra bộ % cộng lại tròn 100% ở mọi
      -- trang: nghe hợp lý và sai hoàn toàn khi có phiếu thu không gắn khách.
      period AS (
        SELECT COALESCE(SUM(r.amount), 0) AS revenue
        FROM receipts r
        WHERE r.tenant_id = ${tenantId} AND r.type = ${RECEIPT_TYPE.INCOME}
          AND ${SQL_REAL_MONEY} AND ${SQL_BUSINESS_ONLY}
          ${range}
      ),
      joined AS (
        SELECT c.id AS tenant_customer_id, c.full_name,
               COALESCE(t.trips, 0) AS trips,
               COALESCE(m.revenue, 0) AS revenue
        FROM ids i
        -- Điều kiện tenant lặp lại có chủ đích: id khách đoán được của gian hàng khác sẽ rơi ra
        -- ngoài ngay cả khi một CTE phía trên lỡ sót điều kiện tenant.
        JOIN tenant_customers c ON c.id = i.tenant_customer_id AND c.tenant_id = ${tenantId}
        LEFT JOIN money m ON m.tenant_customer_id = i.tenant_customer_id
        LEFT JOIN trips t ON t.tenant_customer_id = i.tenant_customer_id
      )
      SELECT j.tenant_customer_id, j.full_name, j.trips,
             trim_scale(j.revenue)::text AS revenue,
             -- Phép chia chạy trên NUMERIC của Postgres, không đi qua float của JS (ADR 0007).
             CASE WHEN p.revenue = 0 THEN NULL
                  ELSE ROUND(j.revenue * 100 / p.revenue, 1)::float8 END AS share_percent,
             COUNT(*) OVER ()::bigint AS total_count
      FROM joined j CROSS JOIN period p
      ORDER BY ${customerSortSql(query.sort)} DESC, j.full_name ASC
      LIMIT ${paging.take} OFFSET ${paging.skip}
    `);

    return {
      data: rows.map((r) => ({
        tenantCustomerId: r.tenant_customer_id,
        fullName: r.full_name,
        trips: Number(r.trips),
        revenue: r.revenue,
        sharePercent: r.share_percent,
      })),
      meta: paginationMeta(paging, Number(rows[0]?.total_count ?? 0)),
    };
  }
}

/** Biên đầu/cuối kỳ cho câu raw — `undefined` nghĩa là "không chặn phía đó". */
function dayStartOf(value: string | undefined): Date | undefined {
  return dayRangeFilter(value, undefined)?.gte;
}

function dayEndOf(value: string | undefined): Date | undefined {
  return dayRangeFilter(undefined, value)?.lte;
}

/** Cột sắp xếp của bảng doanh thu theo khách — cùng luật an toàn với `vehicleSortSql`. */
function customerSortSql(sort: string | undefined): Prisma.Sql {
  return sort === CUSTOMER_REVENUE_SORT.TRIPS ? Prisma.sql`trips` : Prisma.sql`revenue`;
}

/**
 * Cột sắp xếp của bảng hiệu quả theo xe.
 *
 * Trả `Prisma.Sql` từ một `switch` trên union ĐÃ validate, không nội suy chuỗi của client —
 * `ORDER BY ${input}` là chỗ SQL injection sống lâu nhất trong mọi codebase.
 */
function vehicleSortSql(sort: string | undefined): Prisma.Sql {
  switch (sort) {
    case VEHICLE_PROFIT_SORT.REVENUE:
      return Prisma.sql`revenue`;
    case VEHICLE_PROFIT_SORT.COST:
      return Prisma.sql`cost`;
    case VEHICLE_PROFIT_SORT.TRIPS:
      return Prisma.sql`trips`;
    default:
      return Prisma.sql`profit`;
  }
}

/**
 * Chặn một kỳ rộng tới mức không vẽ được.
 *
 * `resolveGranularity` đã nâng bậc tới `month`; nếu vẫn quá trần thì đây là câu hỏi kiểu "toàn bộ
 * lịch sử" — trả 400 kèm hướng dẫn thu hẹp, thay vì âm thầm cắt bớt dữ liệu (nói dối) hoặc dựng
 * vài nghìn cột (một câu truy vấn vô ích và một biểu đồ không ai đọc nổi).
 */
function assertBucketsFit(granularity: FinanceGranularity, from: Date, to: Date): void {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
  if (days / DAYS_PER_BUCKET[granularity] <= FINANCE_MAX_BUCKETS) return;
  throw new BadRequestException({
    code: API_ERROR_CODE.VALIDATION_FAILED,
    message: 'Khoảng thời gian quá rộng để vẽ biểu đồ — hãy chọn kỳ ngắn hơn',
    details: { maxBuckets: FINANCE_MAX_BUCKETS, granularity },
  });
}

/**
 * Ô tìm kiếm của màn công nợ.
 *
 * Chạm đúng những gì bảng ĐANG HIỆN: mã đơn, tên khách, SĐT, tên xe, biển số — người thu nợ
 * cầm tờ giấy ghi biển số hoặc số điện thoại, không cầm ULID. `ILIKE '%…%'` đi được bằng hai
 * index trigram đã có (`bookings_search_trgm_idx`, `vehicles_search_trgm_idx`).
 */
function debtSearchSql(q: string | undefined): Prisma.Sql {
  const term = q?.trim();
  if (!term) return Prisma.empty;
  const like = `%${term}%`;
  return Prisma.sql`AND (
    b.code ILIKE ${like}
    OR b.customer_name ILIKE ${like}
    OR b.customer_phone ILIKE ${like}
    OR v.name ILIKE ${like}
    OR v.plate_number ILIKE ${like}
  )`;
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
