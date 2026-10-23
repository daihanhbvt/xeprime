import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  BOOKING_STATUS,
  LISTING_STATUS,
  PERMISSION,
  PLATFORM_DASHBOARD_TREND_DAYS,
  TENANT_STATUS_VALUES,
} from '@xeprime/types';
import { dayStartUtc, vnDateKey, vnMonthKey, vnMonthStartUtc } from '../../common/day-range';
import type { PlatformContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PlatformDashboardActivityDto,
  PlatformDashboardFunnelDto,
  PlatformDashboardGrowthDto,
  PlatformDashboardOverviewDto,
  PlatformDashboardRevenueDto,
  PlatformDashboardSummaryDto,
  PlatformPeriodCountDto,
  PlatformPeriodMoneyDto,
  PlatformTenantStatusCountsDto,
} from './dto/platform-dashboard.dto';
import { hasPlatformPermission } from './partner-scope';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hai trạng thái đơn KHÔNG vào GMV — chuyến không diễn ra thì không có giá trị giao dịch. */
const GMV_EXCLUDED_STATUSES: string[] = [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW];

/** Khoảng `[start, end)`. */
interface Window {
  start: Date;
  end: Date;
}

@Injectable()
export class PlatformDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Toàn bộ số liệu dashboard nền tảng — count song song (pattern finance-overview). */
  async summary(): Promise<PlatformDashboardSummaryDto> {
    const monthStart = vnMonthStartUtc(new Date());

    const [
      tenantsByStatus,
      listingActive,
      listingTotal,
      bookingTotal,
      bookingThisMonth,
      pendingByTarget,
      pendingVehicles,
      recentTenants,
    ] = await Promise.all([
      this.prisma.tenant.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.publicListing.count({ where: { status: LISTING_STATUS.ACTIVE } }),
      this.prisma.publicListing.count(),
      this.prisma.booking.count({ where: { deletedAt: null } }),
      this.prisma.booking.count({
        where: { deletedAt: null, createdAt: { gte: monthStart } },
      }),
      this.prisma.approvalTask.groupBy({
        by: ['targetType'],
        where: { status: APPROVAL_STATUS.PENDING },
        orderBy: { targetType: 'asc' },
        _count: true,
      }),
      /*
       * Xe chờ duyệt đếm ĐÚNG như hàng đợi "Duyệt xe" đếm (ADR 0049): phiếu có hình chiếu hàng
       * đợi và xe chưa bị xoá. Đếm thô theo `target_type` sẽ nói "3 xe chờ" trong khi mở màn ra
       * chỉ thấy 2.
       */
      this.prisma.approvalTask.count({
        where: {
          targetType: APPROVAL_TARGET_TYPE.VEHICLE,
          status: APPROVAL_STATUS.PENDING,
          vehicleSubject: { is: { vehicle: { deletedAt: null } } },
        },
      }),
      this.prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          profile: { select: { provinceName: true } },
        },
      }),
    ]);

    const byStatus = Object.fromEntries(
      TENANT_STATUS_VALUES.map((s) => [s, 0]),
    ) as unknown as PlatformTenantStatusCountsDto;
    let tenantTotal = 0;
    for (const row of tenantsByStatus) {
      const count = row._count;
      tenantTotal += count;
      if (row.status in byStatus) {
        byStatus[row.status as keyof PlatformTenantStatusCountsDto] = count;
      }
    }

    const pendingCount = (target: string): number =>
      pendingByTarget.find((r) => r.targetType === target)?._count ?? 0;
    const approvalPending = pendingByTarget.reduce((sum, r) => sum + r._count, 0);

    return {
      tenantTotal,
      tenantsByStatus: byStatus,
      listingActive,
      listingTotal,
      bookingTotal,
      bookingThisMonth,
      approvalPending,
      approvalPendingTenant: pendingCount(APPROVAL_TARGET_TYPE.TENANT),
      approvalPendingVehicle: pendingVehicles,
      recentTenants: recentTenants.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        provinceName: t.profile?.provinceName ?? null,
        createdAt: (t.createdAt as Date).toISOString(),
      })),
    };
  }

  /**
   * KPI tháng (so CÙNG KỲ tháng trước), xu hướng 30 ngày và phễu kích hoạt đối tác.
   *
   * Hai khối gác thêm quyền NGOÀI quyền xem tổng quan — mọi vai nền tảng (cả reviewer, support) đều
   * có `platform.dashboard.view`:
   *  - `activity` (GMV, đơn) cần `platform.bookings.view`: ai đọc được từng đơn thì đọc được tổng;
   *  - `revenue` (tiền CỦA nền tảng) cần `platform.money.manage` — cùng cổng với số tiền ở drawer
   *    đối tác (`canViewPartnerMoney`).
   * Thiếu quyền ⇒ khối đó `null` và truy vấn của nó KHÔNG chạy.
   */
  async overview(
    platform: PlatformContext,
    now: Date = new Date(),
  ): Promise<PlatformDashboardOverviewDto> {
    const start = vnMonthStartUtc(now);
    const previousStart = vnMonthStartUtc(now, 1);
    // Cùng số ngày đã trôi qua, kẹp trong tháng trước (31/03 so với tháng Hai không tràn sang 01/03).
    const previousEnd = new Date(
      Math.min(previousStart.getTime() + (now.getTime() - start.getTime()), start.getTime()),
    );
    const current: Window = { start, end: now };
    const previous: Window = { start: previousStart, end: previousEnd };

    const canActivity = hasPlatformPermission(platform, PERMISSION.PLATFORM_BOOKING_VIEW);
    const canRevenue = hasPlatformPermission(platform, PERMISSION.PLATFORM_MONEY_MANAGE);

    const [activity, growth, revenue, funnel] = await Promise.all([
      canActivity ? this.activity(current, previous, now) : null,
      this.growth(current, previous),
      canRevenue ? this.revenue(current, previous) : null,
      this.funnel(),
    ]);

    return {
      generatedAt: now.toISOString(),
      period: vnMonthKey(now),
      activity,
      growth,
      revenue,
      funnel,
    };
  }

  private async activity(
    current: Window,
    previous: Window,
    now: Date,
  ): Promise<PlatformDashboardActivityDto> {
    const [bookings, cancelled, gmv, series] = await Promise.all([
      this.periodCount(
        (w) => this.prisma.booking.count({ where: { deletedAt: null, createdAt: inWindow(w) } }),
        current,
        previous,
      ),
      this.periodCount(
        (w) =>
          this.prisma.booking.count({
            where: {
              deletedAt: null,
              createdAt: inWindow(w),
              status: { in: GMV_EXCLUDED_STATUSES },
            },
          }),
        current,
        previous,
      ),
      this.periodMoney(
        async (w) => {
          const agg = await this.prisma.booking.aggregate({
            where: {
              deletedAt: null,
              createdAt: inWindow(w),
              status: { notIn: GMV_EXCLUDED_STATUSES },
            },
            _sum: { totalAmount: true },
          });
          return agg._sum.totalAmount;
        },
        current,
        previous,
      ),
      this.dailySeries(now),
    ]);
    return { bookings, cancelled, gmv, series };
  }

  /**
   * Đơn + GMV theo NGÀY LỊCH VN, đủ `PLATFORM_DASHBOARD_TREND_DAYS` ngày kể cả ngày không có đơn
   * (`generate_series`) — một biểu đồ thiếu ngày trống sẽ nối hai cột xa nhau thành một dốc giả.
   * Cùng cách gom ngày với chuỗi tài chính của gian hàng (`AT TIME ZONE 'Asia/Ho_Chi_Minh'`).
   */
  private async dailySeries(now: Date): Promise<PlatformDashboardActivityDto['series']> {
    const firstDay = vnDateKey(
      new Date(now.getTime() - (PLATFORM_DASHBOARD_TREND_DAYS - 1) * DAY_MS),
    );
    const lastDay = vnDateKey(now);
    const from = dayStartUtc(firstDay)!;

    const rows = await this.prisma.$queryRaw<
      Array<{ date: string; bookings: number; gmv: Prisma.Decimal }>
    >`
      WITH days AS (
        SELECT generate_series(${firstDay}::date, ${lastDay}::date, '1 day'::interval)::date AS day
      ),
      agg AS (
        SELECT (b.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
               COUNT(*)::int AS bookings,
               COALESCE(SUM(b.total_amount) FILTER (
                 WHERE b.status NOT IN (${Prisma.join(GMV_EXCLUDED_STATUSES)})
               ), 0) AS gmv
          FROM bookings b
         WHERE b.deleted_at IS NULL
           AND b.created_at >= ${from}
         GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
             COALESCE(a.bookings, 0)::int AS bookings,
             COALESCE(a.gmv, 0) AS gmv
        FROM days d
        LEFT JOIN agg a ON a.day = d.day
       ORDER BY d.day ASC
    `;

    return rows.map((row) => ({
      date: row.date,
      bookings: row.bookings,
      gmv: new Prisma.Decimal(row.gmv).toFixed(0),
    }));
  }

  private async growth(current: Window, previous: Window): Promise<PlatformDashboardGrowthDto> {
    const [newCustomers, newPartners] = await Promise.all([
      this.periodCount(
        (w) =>
          this.prisma.user.count({
            where: { realm: ACCOUNT_REALM.CUSTOMER, deletedAt: null, createdAt: inWindow(w) },
          }),
        current,
        previous,
      ),
      this.periodCount(
        (w) => this.prisma.tenant.count({ where: { deletedAt: null, createdAt: inWindow(w) } }),
        current,
        previous,
      ),
    ]);
    return { newCustomers, newPartners };
  }

  /** Cùng hai vị từ với `BookingHoldsService.dailyReconciliation` — chỉ đổi cửa sổ. */
  private async revenue(current: Window, previous: Window): Promise<PlatformDashboardRevenueDto> {
    const [serviceFee, subscriptions] = await Promise.all([
      this.periodMoney(
        async (w) => {
          const agg = await this.prisma.bookingHold.aggregate({
            where: { outcome: { not: null }, releasedAt: inWindow(w) },
            _sum: { settledPlatformAmount: true },
          });
          return agg._sum.settledPlatformAmount;
        },
        current,
        previous,
      ),
      this.periodMoney(
        async (w) => {
          const agg = await this.prisma.subscriptionInvoice.aggregate({
            where: { paidAt: inWindow(w) },
            _sum: { paidAmount: true },
          });
          return agg._sum.paidAmount;
        },
        current,
        previous,
      ),
    ]);

    const sum = (a: string, b: string) => new Prisma.Decimal(a).add(b).toFixed(0);
    return {
      serviceFee,
      subscriptions,
      total: {
        current: sum(serviceFee.current, subscriptions.current),
        previous: sum(serviceFee.previous, subscriptions.previous),
      },
    };
  }

  /**
   * Phễu HIỆN TRẠNG: mỗi bậc đòi cả điều kiện của bậc trước, nên số không bao giờ tăng khi đi
   * xuống — một gian hàng từng có đơn nhưng nay không còn xe nào trên chợ dừng ở bậc "có xe".
   * Ba `EXISTS` đi theo index `(tenant_id, …)` sẵn có của `vehicles`, `public_listings`, `bookings`.
   */
  private async funnel(): Promise<PlatformDashboardFunnelDto> {
    const [row] = await this.prisma.$queryRaw<Array<PlatformDashboardFunnelDto>>`
      WITH stage AS (
        SELECT
          EXISTS (
            SELECT 1 FROM vehicles v WHERE v.tenant_id = t.id AND v.deleted_at IS NULL
          ) AS has_vehicle,
          EXISTS (
            SELECT 1 FROM public_listings l
              JOIN vehicles v ON v.id = l.vehicle_id AND v.deleted_at IS NULL
             WHERE l.tenant_id = t.id AND l.status = ${LISTING_STATUS.ACTIVE}
          ) AS has_listing,
          EXISTS (
            SELECT 1 FROM bookings b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL
          ) AS has_booking,
          EXISTS (
            SELECT 1 FROM bookings b
             WHERE b.tenant_id = t.id AND b.deleted_at IS NULL AND b.status = ${BOOKING_STATUS.COMPLETED}
          ) AS has_completed
          FROM tenants t
         WHERE t.deleted_at IS NULL
      )
      SELECT COUNT(*)::int                                                       AS "registered",
             COUNT(*) FILTER (WHERE has_vehicle)::int                            AS "withVehicle",
             COUNT(*) FILTER (WHERE has_vehicle AND has_listing)::int            AS "withListing",
             COUNT(*) FILTER (WHERE has_listing AND has_booking)::int            AS "withBooking",
             COUNT(*) FILTER (WHERE has_listing AND has_booking AND has_completed)::int
                                                                                 AS "withCompletedTrip"
        FROM stage
    `;
    return (
      row ?? { registered: 0, withVehicle: 0, withListing: 0, withBooking: 0, withCompletedTrip: 0 }
    );
  }

  private async periodCount(
    count: (window: Window) => Promise<number>,
    current: Window,
    previous: Window,
  ): Promise<PlatformPeriodCountDto> {
    const [a, b] = await Promise.all([count(current), count(previous)]);
    return { current: a, previous: b };
  }

  private async periodMoney(
    sum: (window: Window) => Promise<Prisma.Decimal | null>,
    current: Window,
    previous: Window,
  ): Promise<PlatformPeriodMoneyDto> {
    const [a, b] = await Promise.all([sum(current), sum(previous)]);
    return {
      current: (a ?? new Prisma.Decimal(0)).toFixed(0),
      previous: (b ?? new Prisma.Decimal(0)).toFixed(0),
    };
  }
}

/** Mệnh đề Prisma cho `[start, end)`. */
function inWindow(window: Window): { gte: Date; lt: Date } {
  return { gte: window.start, lt: window.end };
}
