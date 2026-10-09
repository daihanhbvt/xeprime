import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  DASHBOARD_AGENDA_DAYS,
  DASHBOARD_AGENDA_KIND,
  DASHBOARD_AGENDA_LIMIT,
  DASHBOARD_TREND_MONTHS,
  FEATURE_STATE,
  LISTING_STATUS,
  PERMISSION,
  PLAN_FEATURE,
  TRIP_REQUEST_URGENT_MINUTES,
  VEHICLE_PUBLIC_STATUS,
  tenantUsesManagePortal,
  type Permission,
  type ServiceType,
} from '@xeprime/types';
import { dayEndUtc, dayStartUtc, vnDateKey, vnMonthKey, vnMonthStartUtc } from '../../common/day-range';
import {
  resolveBranchIdList,
  resolveBranchScope,
  vehicleBranchWhere,
  type BranchScope,
} from '../../common/dto/branch-scope';
import type { TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { presetWhere } from '../bookings/bookings.service';
import { HostMetricsService } from '../host-metrics/host-metrics.service';
import { completedTripsInPeriodWhere } from '../wallet/wallet-statement.service';
import type {
  PartnerDashboardAgendaDto,
  PartnerDashboardAgendaItemDto,
  PartnerDashboardMarketDto,
  PartnerDashboardMonthDto,
  PartnerDashboardOverviewDto,
  PartnerDashboardQueryDto,
  PartnerDashboardRequestsDto,
  PartnerDashboardTodayDto,
  PartnerDashboardTrendPointDto,
} from './dto/partner-dashboard.dto';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Cột tối thiểu để dựng một mốc trên lịch giao/nhận — không kéo snapshot giá hay PII thừa. */
const AGENDA_SELECT = {
  id: true,
  code: true,
  pickupAt: true,
  returnAt: true,
  customerName: true,
  serviceType: true,
  vehicleId: true,
  vehicle: { select: { name: true, plateNumber: true } },
} satisfies Prisma.BookingSelect;

type AgendaRow = Prisma.BookingGetPayload<{ select: typeof AGENDA_SELECT }>;

/** Khoảng `[start, end)` — mọi kỳ của Tổng quan đều nửa mở, cùng quy ước với sổ ví và sổ thuế. */
interface Window {
  start: Date;
  end: Date;
}

/**
 * TỔNG QUAN site partner — một lần đọc cho cả màn, dùng chung cho hai tuyến.
 *
 * ## Không có phép tính thứ hai
 *
 * Mọi con số ở đây hoặc là MỘT TẬP CON của một danh sách đã có, hoặc gọi đúng hàm đang tính nó ở
 * chỗ khác:
 *  - "Chờ giao xe" = `presetWhere(awaiting_pickup)` — câu của màn "Chờ giao xe";
 *  - "Chuyến hoàn thành" = `completedTripsInPeriodWhere` — câu của bảng tổng hợp giao dịch;
 *  - yêu cầu khẩn = mốc `TRIP_REQUEST_URGENT_MINUTES` của hàng đợi vận hành chuyến nền tảng;
 *  - uy tín = `HostMetricsService.forTenant` — nguồn duy nhất (ADR 0045 điều 2).
 *
 * Tiền KHÔNG có ở đây: doanh thu tuyến gói đọc `/finance/summary` (sổ thu chi), thu nhập chủ xe
 * đọc `/shop/wallet/statement` (sổ ví). Một tổng thứ ba cộng từ `bookings` sẽ nói một con số khác
 * cả hai — đúng thứ nguyên tắc "một sự thật, hiện một lần" cấm.
 *
 * ## Phạm vi
 *
 * `tenantId` đến từ membership (CLAUDE.md mục 6). Ô chi nhánh đi qua `resolveBranchScope` — phép
 * GIAO giữa phạm vi được giao và phạm vi đang xin (ADR 0052) — và thu hẹp mọi khối đọc từ xe; uy
 * tín là của cả gian hàng nên đứng ngoài.
 *
 * ## Quyền theo khối
 *
 * Endpoint mở cho mọi thành viên (`tenants.view`); từng khối tự gác bằng quyền của dữ liệu nó lộ
 * ra và trả `null` khi thiếu — truy vấn của khối đó KHÔNG chạy. Báo cáo theo kỳ (`trend`) còn gác
 * thêm trục TUYẾN và trục GÓI: chủ xe tuyến hoa hồng không có sổ tổng hợp (ADR 0027 điều 1).
 */
@Injectable()
export class PartnerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    /** Uy tín — nguồn tính DUY NHẤT (ADR 0045 điều 2). */
    private readonly hostMetrics: HostMetricsService,
  ) {}

  async overview(
    tenant: TenantContext,
    query: PartnerDashboardQueryDto,
    now: Date = new Date(),
  ): Promise<PartnerDashboardOverviewDto> {
    const can = (permission: Permission) => tenant.permissions.includes(permission);
    const scope = resolveBranchScope(query.branchId, tenant.allowedBranchIds);
    const branchIds = resolveBranchIdList(query.branchId, tenant.allowedBranchIds);
    const { tenantId } = tenant;

    const canBookings = can(PERMISSION.BOOKING_VIEW);
    /*
     * Báo cáo theo kỳ: TUYẾN gói (chặn thật, không qua công tắc rollout — ADR 0038 điều 4) VÀ gói
     * có sổ tổng hợp (`read_only` vẫn xem được — ADR 0027 điều 3) VÀ người gọi xem được đơn.
     */
    const canTrend =
      canBookings &&
      tenantUsesManagePortal({ billingMode: tenant.billingMode }) &&
      (tenant.features[PLAN_FEATURE.FINANCE] ?? FEATURE_STATE.HIDDEN) !== FEATURE_STATE.HIDDEN;

    const [today, requests, agenda, month, trend, market, reputation] = await Promise.all([
      canBookings ? this.today(tenantId, scope, now) : null,
      can(PERMISSION.BOOKING_REQUEST_VIEW) ? this.requests(tenantId, scope, now) : null,
      canBookings ? this.agenda(tenantId, scope, now) : null,
      canBookings ? this.month(tenantId, scope, branchIds, now) : null,
      canTrend ? this.trend(tenantId, scope, now) : null,
      can(PERMISSION.VEHICLE_VIEW) ? this.market(tenantId, scope) : null,
      this.hostMetrics.forTenant(tenantId),
    ]);

    return {
      generatedAt: now.toISOString(),
      today,
      requests,
      agenda,
      month,
      trend,
      market,
      reputation,
    };
  }

  // ── Việc trong ngày ──────────────────────────────────────────────────────────────────────

  private async today(
    tenantId: string,
    scope: BranchScope,
    now: Date,
  ): Promise<PartnerDashboardTodayDto> {
    const day = vnDayBounds(now);
    const awaiting = awaitingPickupWhere(tenantId, scope);
    const active = activeWhere(tenantId, scope);

    const [awaitingPickup, pickupsToday, pickupsOverdue, activeCount, returnsToday, returnsOverdue] =
      await Promise.all([
        this.prisma.booking.count({ where: awaiting }),
        this.prisma.booking.count({ where: { ...awaiting, pickupAt: day } }),
        this.prisma.booking.count({ where: { ...awaiting, pickupAt: { lt: now } } }),
        this.prisma.booking.count({ where: active }),
        this.prisma.booking.count({ where: { ...active, returnAt: day } }),
        this.prisma.booking.count({ where: { ...active, returnAt: { lt: now } } }),
      ]);

    return {
      awaitingPickup,
      pickupsToday,
      pickupsOverdue,
      active: activeCount,
      returnsToday,
      returnsOverdue,
    };
  }

  private async requests(
    tenantId: string,
    scope: BranchScope,
    now: Date,
  ): Promise<PartnerDashboardRequestsDto> {
    const base: Prisma.BookingRequestWhereInput = { tenantId, ...vehicleBranchWhere(scope) };
    const pending: Prisma.BookingRequestWhereInput = {
      ...base,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    };
    const urgentBy = new Date(now.getTime() + TRIP_REQUEST_URGENT_MINUTES * MINUTE_MS);

    const [pendingCount, pendingUrgent, next, awaitingPayment] = await Promise.all([
      this.prisma.bookingRequest.count({ where: pending }),
      this.prisma.bookingRequest.count({ where: { ...pending, respondBy: { lte: urgentBy } } }),
      this.prisma.bookingRequest.findFirst({
        where: pending,
        orderBy: [{ respondBy: 'asc' }, { id: 'asc' }],
        select: { respondBy: true },
      }),
      this.prisma.bookingRequest.count({
        where: { ...base, status: BOOKING_REQUEST_STATUS.AWAITING_HOLD },
      }),
    ]);

    return {
      pending: pendingCount,
      pendingUrgent,
      nextRespondBy: next?.respondBy.toISOString() ?? null,
      awaitingPayment,
    };
  }

  /**
   * Lịch giao/nhận: hai luồng mốc (giờ hẹn giao của đơn chờ giao, giờ hẹn trả của đơn đang thuê)
   * gộp theo thời gian. Mỗi luồng lấy `LIMIT + 1` dòng — dòng thừa chỉ để biết có `hasMore` hay
   * không, mà không cần một lượt đếm riêng.
   */
  private async agenda(
    tenantId: string,
    scope: BranchScope,
    now: Date,
  ): Promise<PartnerDashboardAgendaDto> {
    const horizon = dayEndUtc(vnDateKey(new Date(now.getTime() + (DASHBOARD_AGENDA_DAYS - 1) * DAY_MS)))!;
    const take = DASHBOARD_AGENDA_LIMIT + 1;

    const [pickups, returns] = await Promise.all([
      this.prisma.booking.findMany({
        where: { ...awaitingPickupWhere(tenantId, scope), pickupAt: { lte: horizon } },
        orderBy: [{ pickupAt: 'asc' }, { id: 'asc' }],
        take,
        select: AGENDA_SELECT,
      }),
      this.prisma.booking.findMany({
        where: { ...activeWhere(tenantId, scope), returnAt: { lte: horizon } },
        orderBy: [{ returnAt: 'asc' }, { id: 'asc' }],
        take,
        select: AGENDA_SELECT,
      }),
    ]);

    const merged = [
      ...pickups.map((row) => toAgendaItem(row, DASHBOARD_AGENDA_KIND.PICKUP)),
      ...returns.map((row) => toAgendaItem(row, DASHBOARD_AGENDA_KIND.RETURN)),
    ].sort((a, b) => a.at.localeCompare(b.at) || a.bookingId.localeCompare(b.bookingId));

    return {
      items: merged.slice(0, DASHBOARD_AGENDA_LIMIT),
      hasMore: merged.length > DASHBOARD_AGENDA_LIMIT,
    };
  }

  // ── Tháng này so với cùng kỳ tháng trước ────────────────────────────────────────────────────

  private async month(
    tenantId: string,
    scope: BranchScope,
    branchIds: string[] | null,
    now: Date,
  ): Promise<PartnerDashboardMonthDto> {
    const start = vnMonthStartUtc(now);
    const nextMonth = vnMonthStartUtc(now, -1);
    const previousStart = vnMonthStartUtc(now, 1);
    // Cùng số ngày đã trôi qua, kẹp trong tháng trước (31/03 so với tháng Hai không tràn sang 01/03).
    const previousEnd = new Date(
      Math.min(previousStart.getTime() + (now.getTime() - start.getTime()), start.getTime()),
    );
    /*
     * Phép ĐẾM của tháng hiện tại đi tới HẾT tháng, không dừng ở "bây giờ": đó là biên của bảng
     * tổng hợp giao dịch và của cột tháng này trên biểu đồ xu hướng — ba bề mặt, một con số. (Sự
     * kiện ở tương lai không tồn tại, trừ dữ liệu nhập tay có giờ trả nằm sau hiện tại.) Lấp đầy
     * là phép tính THỜI GIAN nên tự kẹp ở `now`.
     */
    const thisMonth: Window = { start, end: nextMonth };
    const previous: Window = { start: previousStart, end: previousEnd };

    const [
      newBookings,
      newBookingsPrevious,
      completedTrips,
      completedTripsPrevious,
      utilization,
      utilizationPrevious,
    ] = await Promise.all([
      this.countNewBookings(tenantId, scope, thisMonth),
      this.countNewBookings(tenantId, scope, previous),
      this.countCompletedTrips(tenantId, scope, thisMonth),
      this.countCompletedTrips(tenantId, scope, previous),
      this.utilization(tenantId, branchIds, thisMonth, now),
      this.utilization(tenantId, branchIds, previous, now),
    ]);

    return {
      period: vnMonthKey(now),
      newBookings,
      newBookingsPrevious,
      completedTrips,
      completedTripsPrevious,
      utilizationPercent: utilization,
      utilizationPercentPrevious: utilizationPrevious,
    };
  }

  private async trend(
    tenantId: string,
    scope: BranchScope,
    now: Date,
  ): Promise<PartnerDashboardTrendPointDto[]> {
    // Cũ → mới: chỉ số `DASHBOARD_TREND_MONTHS - 1` là tháng xa nhất, 0 là tháng hiện tại.
    const months = Array.from({ length: DASHBOARD_TREND_MONTHS }, (_, i) => {
      const back = DASHBOARD_TREND_MONTHS - 1 - i;
      const start = vnMonthStartUtc(now, back);
      return { period: vnMonthKey(start), window: { start, end: vnMonthStartUtc(now, back - 1) } };
    });

    return Promise.all(
      months.map(async ({ period, window }) => {
        const [newBookings, completedTrips] = await Promise.all([
          this.countNewBookings(tenantId, scope, window),
          this.countCompletedTrips(tenantId, scope, window),
        ]);
        return { period, newBookings, completedTrips };
      }),
    );
  }

  private countNewBookings(tenantId: string, scope: BranchScope, window: Window): Promise<number> {
    return this.prisma.booking.count({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: window.start, lt: window.end },
        ...vehicleBranchWhere(scope),
      },
    });
  }

  private countCompletedTrips(tenantId: string, scope: BranchScope, window: Window): Promise<number> {
    return this.prisma.booking.count({
      where: {
        AND: [completedTripsInPeriodWhere(tenantId, window.start, window.end), vehicleBranchWhere(scope)],
      },
    });
  }

  /**
   * Tỉ lệ lấp đầy của một kỳ: Σ thời gian xe CÓ KHÁCH ÷ Σ thời gian xe CÓ MẶT trong đội.
   *
   *  - Tử số: đơn `active` hoặc `completed` giao nhau với kỳ. Đơn đang thuê tính tới hết kỳ (xe
   *    vẫn đang ở ngoài, kể cả khi đã quá giờ hẹn trả); đơn đã xong tính tới giờ trả THẬT nếu có.
   *    Giờ giao thật thắng giờ hẹn.
   *  - Mẫu số: mỗi xe chưa xoá góp phần thời gian từ lúc nó được tạo (hoặc đầu kỳ) tới hết kỳ —
   *    một xe mới thêm hôm qua không làm cả tháng trông như bỏ trống.
   *
   * `null` khi mẫu số bằng 0 (chưa có xe nào trong kỳ). Kẹp trần 100%: hai đơn chồng nhau trên
   * cùng một xe là dữ liệu hỏng mà constraint lịch không cho sinh ra từ luồng hiện tại, nhưng một
   * tỉ lệ 130% trên màn hình thì tệ hơn là giấu nó đi.
   */
  private async utilization(
    tenantId: string,
    branchIds: string[] | null,
    window: Window,
    now: Date,
  ): Promise<number | null> {
    const end = new Date(Math.min(window.end.getTime(), now.getTime()));
    if (end.getTime() <= window.start.getTime()) return null;

    const [row] = await this.prisma.$queryRaw<Array<{ capacity: number | null; used: number | null }>>`
      WITH fleet AS (
        SELECT v.id, v.created_at
          FROM vehicles v
         WHERE v.tenant_id = ${tenantId}
           AND v.deleted_at IS NULL
           AND v.created_at < ${end}
           AND (${branchIds}::char(26)[] IS NULL OR v.branch_id = ANY(${branchIds}::char(26)[]))
      )
      SELECT
        (SELECT SUM(EXTRACT(EPOCH FROM (${end}::timestamptz - GREATEST(f.created_at, ${window.start}::timestamptz))))
           FROM fleet f)::float8 AS capacity,
        (SELECT SUM(GREATEST(EXTRACT(EPOCH FROM (
                  LEAST(
                    CASE WHEN b.status = ${BOOKING_STATUS.ACTIVE} THEN ${end}::timestamptz
                         ELSE COALESCE(b.actual_return_at, b.return_at) END,
                    ${end}::timestamptz
                  )
                  - GREATEST(COALESCE(b.actual_pickup_at, b.pickup_at), ${window.start}::timestamptz)
                )), 0))
           FROM bookings b
           JOIN fleet f ON f.id = b.vehicle_id
          WHERE b.tenant_id = ${tenantId}
            AND b.deleted_at IS NULL
            AND b.status IN (${BOOKING_STATUS.ACTIVE}, ${BOOKING_STATUS.COMPLETED})
            AND COALESCE(b.actual_pickup_at, b.pickup_at) < ${end}
            AND (b.status = ${BOOKING_STATUS.ACTIVE}
                 OR COALESCE(b.actual_return_at, b.return_at) > ${window.start})
        )::float8 AS used
    `;

    const capacity = Number(row?.capacity ?? 0);
    if (!Number.isFinite(capacity) || capacity <= 0) return null;
    const used = Math.max(0, Number(row?.used ?? 0));
    return Math.min(100, Math.round((used / capacity) * 1000) / 10);
  }

  // ── Xe trên chợ ───────────────────────────────────────────────────────────────────────────

  private async market(tenantId: string, scope: BranchScope): Promise<PartnerDashboardMarketDto> {
    const [onMarket, byStatus] = await Promise.all([
      this.prisma.publicListing.count({
        where: { tenantId, status: LISTING_STATUS.ACTIVE, ...vehicleBranchWhere(scope) },
      }),
      this.prisma.vehicle.groupBy({
        by: ['publicStatus'],
        where: { tenantId, deletedAt: null, branchId: scope },
        _count: { _all: true },
      }),
    ]);
    const countOf = (status: string) =>
      byStatus.find((g) => g.publicStatus === status)?._count._all ?? 0;

    return {
      onMarket,
      inReview: countOf(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW),
      needsRevision: countOf(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION),
      draft: countOf(VEHICLE_PUBLIC_STATUS.DRAFT),
    };
  }
}

/** Đơn chờ giao xe trong phạm vi — câu của màn "Chờ giao xe", không chép lại. */
function awaitingPickupWhere(tenantId: string, scope: BranchScope): Prisma.BookingWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...vehicleBranchWhere(scope),
    AND: [presetWhere(BOOKING_LIST_PRESET.AWAITING_PICKUP)],
  };
}

function activeWhere(tenantId: string, scope: BranchScope): Prisma.BookingWhereInput {
  return { tenantId, deletedAt: null, status: BOOKING_STATUS.ACTIVE, ...vehicleBranchWhere(scope) };
}

/** Trọn ngày lịch Việt Nam chứa `now` — biên đóng hai đầu, như hàng đợi chuyến của nền tảng. */
function vnDayBounds(now: Date): { gte: Date; lte: Date } {
  const key = vnDateKey(now);
  return { gte: dayStartUtc(key)!, lte: dayEndUtc(key)! };
}

function toAgendaItem(
  row: AgendaRow,
  kind: (typeof DASHBOARD_AGENDA_KIND)[keyof typeof DASHBOARD_AGENDA_KIND],
): PartnerDashboardAgendaItemDto {
  return {
    kind,
    at: (kind === DASHBOARD_AGENDA_KIND.PICKUP ? row.pickupAt : row.returnAt).toISOString(),
    bookingId: row.id,
    code: row.code,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicle.name,
    plateNumber: row.vehicle.plateNumber,
    customerName: row.customerName,
    serviceType: row.serviceType as ServiceType,
  };
}
