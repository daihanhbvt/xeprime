import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  DEFAULT_PARTNER_VEHICLE_SORT,
  PARTNER_PICKUP_SOON_HOURS,
  PARTNER_VEHICLE_SORT,
  PLATFORM_PARTNER_KIND,
  TENANT_STATUS,
  auditActionCategoryOf,
  auditCategoriesFor,
  resolveMarketplaceVisibility,
  sortVehicleAlerts,
  supportSessionStatusOf,
  type PaginationMeta,
  type PartnerVehicleSort,
  type VehicleAlertKind,
} from '@xeprime/types';
import { dayRangeFilter } from '../../common/day-range';
import { maskName, maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import type { PlatformContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { VehicleAlertsService } from '../vehicles/vehicle-alerts.service';
import {
  PARTNER_DETAIL_DEFAULT_LIMIT,
  PARTNER_DETAIL_MAX_LIMIT,
  type PartnerActivityDto,
  type PartnerActivityQueryDto,
  type PartnerBookingDto,
  type PartnerBookingListQueryDto,
  type PartnerBookingRequestDto,
  type PartnerBookingRequestListQueryDto,
  type PartnerBookingSummaryDto,
  type PartnerBookingSummaryQueryDto,
  type PartnerSupportSessionDto,
  type PartnerSupportSessionQueryDto,
  type PartnerVehicleDto,
  type PartnerVehicleListQueryDto,
} from './dto/platform-partner.dto';
import { auditCategoriesExclusionWhere, auditCategoryWhere } from './audit-category-where';
import {
  PARTNER_HIDDEN_ALERT_KINDS,
  PLATFORM_PARTNER_ALERT_SCOPE,
  canViewPartnerMoney,
  loadPartner,
  type PartnerRef,
} from './partner-scope';

type Page<T> = { data: T[]; meta: PaginationMeta };

const VEHICLE_ORDER_BY: Readonly<
  Record<PartnerVehicleSort, Prisma.VehicleOrderByWithRelationInput[]>
> = {
  [PARTNER_VEHICLE_SORT.UPDATED]: [{ updatedAt: 'desc' }, { id: 'desc' }],
  [PARTNER_VEHICLE_SORT.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [PARTNER_VEHICLE_SORT.NAME]: [{ name: 'asc' }, { id: 'asc' }],
};

const VEHICLE_SELECT = {
  id: true,
  code: true,
  name: true,
  plateNumber: true,
  mainImageUrl: true,
  vehicleType: true,
  serviceTypes: true,
  operationStatus: true,
  publicStatus: true,
  marketplaceEnabled: true,
  deletedAt: true,
  updatedAt: true,
  branch: {
    select: {
      name: true,
      province: { select: { name: true } },
      ward: { select: { name: true } },
    },
  },
} satisfies Prisma.VehicleSelect;

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>;

const BOOKING_SELECT = {
  id: true,
  code: true,
  status: true,
  serviceType: true,
  customerName: true,
  customerPhone: true,
  pickupAt: true,
  returnAt: true,
  totalAmount: true,
  vehicle: { select: { id: true, name: true, plateNumber: true, mainImageUrl: true } },
} satisfies Prisma.BookingSelect;

/** Đơn đã chốt, chưa nhận xe — "sắp nhận xe". `confirmed` là trạng thái cũ vẫn còn dữ liệu. */
const UPCOMING_STATUSES: string[] = [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED];
const CANCELLED_STATUSES: string[] = [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW];
const HOUR_MS = 60 * 60 * 1000;

/**
 * Dữ liệu VẬN HÀNH của một đối tác cho drawer Platform Admin — xe, đơn thuê, yêu cầu thuê, nhật
 * ký. Toàn bộ là ĐỌC: không service nào ở đây ghi DB, đánh dấu `used_features` hay mở phiên.
 *
 * Mọi hàm nhận `tenantId` từ URL và xác thực nó qua `loadPartner` trước khi đọc gì khác; mọi truy
 * vấn sau đó lọc theo đúng id đó (không có đường đọc chéo tenant).
 */
@Injectable()
export class PlatformPartnerOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: VehicleAlertsService,
  ) {}

  /* ───────────────────────────── Xe ───────────────────────────── */

  async vehicles(
    tenantId: string,
    query: PartnerVehicleListQueryDto,
  ): Promise<Page<PartnerVehicleDto>> {
    const partner = await loadPartner(this.prisma, tenantId, new Date());
    return this.vehiclesOf(partner, query);
  }

  /** Dùng lại cho "Xe gần đây" của tab Tổng quan — cùng hình dạng, cùng luật cảnh báo. */
  async vehiclesOf(
    partner: PartnerRef,
    query: PartnerVehicleListQueryDto,
  ): Promise<Page<PartnerVehicleDto>> {
    const paging = resolvePaging(query, PARTNER_DETAIL_DEFAULT_LIMIT, PARTNER_DETAIL_MAX_LIMIT);
    const q = query.q?.trim();
    const where: Prisma.VehicleWhereInput = {
      tenantId: partner.tenantId,
      deletedAt: null,
      ...(query.operationStatus ? { operationStatus: query.operationStatus } : {}),
      ...(query.publicStatus ? { publicStatus: query.publicStatus } : {}),
      ...(query.serviceType ? { serviceTypes: { has: query.serviceType } } : {}),
      // Chi nhánh là khái niệm của gian hàng — chủ xe cá nhân không lọc theo nó.
      ...(query.branchId && partner.partnerKind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP
        ? { branchId: query.branchId }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
              { plateNumber: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy: VEHICLE_ORDER_BY[query.sort ?? DEFAULT_PARTNER_VEHICLE_SORT],
        skip: paging.skip,
        take: paging.take,
        select: VEHICLE_SELECT,
      }),
    ]);

    const alertsById = await this.alertsFor(
      partner.tenantId,
      rows.map((row) => row.id),
    );
    const shopActive = partner.tenantStatus === TENANT_STATUS.ACTIVE;
    return {
      data: rows.map((row) => toVehicle(row, shopActive, alertsById.get(row.id) ?? [])),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Cảnh báo của một lô xe — MỘT nguồn (`VehicleAlertsService`, không N+1), scope nền tảng, bỏ
   * `title`/`detail`/`href` (câu tiếng Việt và link vào app gian hàng không thuộc về drawer này).
   */
  async alertsFor(
    tenantId: string,
    vehicleIds: string[],
  ): Promise<Map<string, { kind: string; severity: string }[]>> {
    const out = new Map<string, { kind: string; severity: string }[]>();
    if (vehicleIds.length === 0) return out;
    const rows = await this.alerts.forVehicles(tenantId, vehicleIds, PLATFORM_PARTNER_ALERT_SCOPE);
    for (const row of rows) {
      const visible = sortVehicleAlerts(
        row.alerts
          .filter((alert) => !PARTNER_HIDDEN_ALERT_KINDS.includes(alert.kind))
          .map((alert) => ({ kind: alert.kind as VehicleAlertKind, severity: alert.severity })),
      );
      out.set(row.vehicleId, visible);
    }
    return out;
  }

  /* ───────────────────────────── Đơn thuê ───────────────────────────── */

  async bookings(
    tenantId: string,
    query: PartnerBookingListQueryDto,
    platform: PlatformContext,
  ): Promise<Page<PartnerBookingDto>> {
    const partner = await loadPartner(this.prisma, tenantId, new Date());
    return this.bookingsOf(partner, query, platform);
  }

  async bookingsOf(
    partner: PartnerRef,
    query: PartnerBookingListQueryDto,
    platform: PlatformContext,
  ): Promise<Page<PartnerBookingDto>> {
    const paging = resolvePaging(query, PARTNER_DETAIL_DEFAULT_LIMIT, PARTNER_DETAIL_MAX_LIMIT);
    const q = query.q?.trim();
    const where: Prisma.BookingWhereInput = {
      tenantId: partner.tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...pickupRange(query.dateFrom, query.dateTo),
      ...(q
        ? {
            // Không tìm theo tên/SĐT khách: danh sách chỉ hiện dạng đã che, tìm theo PII là một
            // "oracle" dò ngược được dữ liệu bị che (ADR 0050 §11 cùng lý do).
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: [{ pickupAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: BOOKING_SELECT,
      }),
    ]);

    const showMoney = canViewPartnerMoney(platform);
    return {
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        serviceType: row.serviceType,
        vehicleId: row.vehicle.id,
        vehicleName: row.vehicle.name,
        vehiclePlateNumber: row.vehicle.plateNumber,
        vehicleImageUrl: row.vehicle.mainImageUrl,
        customerNameMasked: maskName(row.customerName),
        customerPhoneMasked: maskPhone(row.customerPhone),
        pickupAt: row.pickupAt.toISOString(),
        returnAt: row.returnAt.toISOString(),
        totalAmount: showMoney ? row.totalAmount.toFixed(2) : null,
      })),
      meta: paginationMeta(paging, total),
    };
  }

  async bookingSummary(
    tenantId: string,
    query: PartnerBookingSummaryQueryDto,
  ): Promise<PartnerBookingSummaryDto> {
    const now = new Date();
    const partner = await loadPartner(this.prisma, tenantId, now);
    const where: Prisma.BookingWhereInput = {
      tenantId: partner.tenantId,
      deletedAt: null,
      ...pickupRange(query.dateFrom, query.dateTo),
    };

    const [byStatus, pickupSoon, pendingRequests, totalRequests] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.booking.count({
        where: {
          tenantId: partner.tenantId,
          deletedAt: null,
          status: { in: UPCOMING_STATUSES },
          pickupAt: {
            gte: now,
            lte: new Date(now.getTime() + PARTNER_PICKUP_SOON_HOURS * HOUR_MS),
          },
        },
      }),
      this.prisma.bookingRequest.count({
        where: { tenantId: partner.tenantId, status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL },
      }),
      this.prisma.bookingRequest.count({ where: { tenantId: partner.tenantId } }),
    ]);

    const countOf = (statuses: string[]) =>
      byStatus
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      upcoming: countOf(UPCOMING_STATUSES),
      active: countOf([BOOKING_STATUS.ACTIVE]),
      completed: countOf([BOOKING_STATUS.COMPLETED]),
      cancelled: countOf(CANCELLED_STATUSES),
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      pickupSoon,
      pendingRequests,
      totalRequests,
    };
  }

  async bookingRequests(
    tenantId: string,
    query: PartnerBookingRequestListQueryDto,
  ): Promise<Page<PartnerBookingRequestDto>> {
    const partner = await loadPartner(this.prisma, tenantId, new Date());
    const paging = resolvePaging(query, PARTNER_DETAIL_DEFAULT_LIMIT, PARTNER_DETAIL_MAX_LIMIT);
    const where: Prisma.BookingRequestWhereInput = {
      tenantId: partner.tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          status: true,
          serviceType: true,
          customerName: true,
          customerPhone: true,
          pickupAt: true,
          returnAt: true,
          respondBy: true,
          createdAt: true,
          vehicle: { select: { id: true, name: true, plateNumber: true, mainImageUrl: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        serviceType: row.serviceType,
        vehicleId: row.vehicle.id,
        vehicleName: row.vehicle.name,
        vehiclePlateNumber: row.vehicle.plateNumber,
        vehicleImageUrl: row.vehicle.mainImageUrl,
        customerNameMasked: maskName(row.customerName),
        customerPhoneMasked: maskPhone(row.customerPhone),
        pickupAt: row.pickupAt?.toISOString() ?? null,
        returnAt: row.returnAt?.toISOString() ?? null,
        respondBy: row.respondBy.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  /* ───────────────────────────── Nhật ký ───────────────────────────── */

  /**
   * Nhật ký của MỘT đối tác — nhãn thân thiện theo nhóm hành động, KHÔNG có IP/user-agent (hai
   * trường đó chỉ ở chi tiết nhật ký hệ thống, sau quyền riêng của màn đó).
   *
   * Nhóm không áp dụng cho loại đối tác (chi nhánh/nhân sự/gói với chủ xe cá nhân) và nhóm tiền
   * (khi thiếu quyền tiền) bị loại Ở DB — trước phân trang và đếm.
   */
  async activity(
    tenantId: string,
    query: PartnerActivityQueryDto,
    platform: PlatformContext,
  ): Promise<Page<PartnerActivityDto>> {
    const partner = await loadPartner(this.prisma, tenantId, new Date());
    const paging = resolvePaging(query, PARTNER_DETAIL_DEFAULT_LIMIT, PARTNER_DETAIL_MAX_LIMIT);
    const allowed = auditCategoriesFor(partner.partnerKind, {
      canViewMoney: canViewPartnerMoney(platform),
    });
    const q = query.q?.trim();

    const and: Prisma.AuditLogWhereInput[] = [
      { tenantId: partner.tenantId },
      auditCategoriesExclusionWhere(allowed),
    ];
    if (query.category) {
      // Nhóm không được phép ⇒ không dòng nào, thay vì lặng lẽ bỏ qua bộ lọc.
      and.push(
        allowed.includes(query.category) ? auditCategoryWhere(query.category) : { id: { in: [] } },
      );
    }
    if (query.actorScope) and.push({ actorScope: query.actorScope });
    const createdAt = dayRangeFilter(query.dateFrom, query.dateTo);
    if (createdAt) and.push({ createdAt });
    if (q) {
      and.push({
        OR: [
          { action: { contains: q, mode: 'insensitive' } },
          // Tìm theo tên CHỈ với người thực hiện không phải khách: tên khách hiện ở dạng che, và
          // cho tìm theo tên thật là một "oracle" dò ngược PII bị che (cùng lý do với tab Đơn thuê).
          {
            actorScope: { not: AUDIT_ACTOR_SCOPE.CUSTOMER },
            actor: { displayName: { contains: q, mode: 'insensitive' } },
          },
        ],
      });
    }
    const where: Prisma.AuditLogWhereInput = { AND: and };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          action: true,
          actorScope: true,
          targetType: true,
          targetId: true,
          supportContextId: true,
          createdAt: true,
          actor: { select: { displayName: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        category: auditActionCategoryOf(row.action),
        actorScope: row.actorScope,
        // Khách thuê cũng ghi nhật ký vào tenant (huỷ yêu cầu, …) — tên của họ luôn đi ra ở dạng che.
        actorName: row.actor
          ? row.actorScope === AUDIT_ACTOR_SCOPE.CUSTOMER
            ? maskName(row.actor.displayName)
            : row.actor.displayName
          : null,
        targetType: row.targetType,
        targetId: row.targetId,
        viaSupport: row.supportContextId !== null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: paginationMeta(paging, total),
    };
  }

  async supportSessions(
    tenantId: string,
    query: PartnerSupportSessionQueryDto,
  ): Promise<Page<PartnerSupportSessionDto>> {
    const now = new Date();
    const partner = await loadPartner(this.prisma, tenantId, now);
    const paging = resolvePaging(query, PARTNER_DETAIL_DEFAULT_LIMIT, PARTNER_DETAIL_MAX_LIMIT);
    const where: Prisma.TenantSupportContextWhereInput = { tenantId: partner.tenantId };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenantSupportContext.count({ where }),
      this.prisma.tenantSupportContext.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        // KHÔNG chọn `sessionId`, `ipAddress`, `userAgent`, `capabilities`: id phiên đăng nhập và
        // dấu vết thiết bị của nhân sự không có chỗ trong một màn tổng quan.
        select: {
          id: true,
          mode: true,
          workspace: true,
          reason: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          actor: { select: { displayName: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        actorName: row.actor.displayName,
        mode: row.mode,
        workspace: row.workspace,
        reason: row.reason,
        status: supportSessionStatusOf(row, now),
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
      meta: paginationMeta(paging, total),
    };
  }
}

function toVehicle(
  row: VehicleRow,
  shopActive: boolean,
  alerts: { kind: string; severity: string }[],
): PartnerVehicleDto {
  const visibility = resolveMarketplaceVisibility({
    deletedAt: row.deletedAt,
    publicStatus: row.publicStatus,
    marketplaceEnabled: row.marketplaceEnabled,
    shopActive,
  });
  const area = [row.branch?.ward?.name, row.branch?.province?.name].filter(Boolean).join(', ');
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    plateNumber: row.plateNumber,
    mainImageUrl: row.mainImageUrl,
    vehicleType: row.vehicleType,
    serviceTypes: row.serviceTypes,
    operationStatus: row.operationStatus,
    publicStatus: row.publicStatus,
    isMarketplaceVisible: visibility.visible,
    branchName: row.branch?.name ?? null,
    pickupAreaName: area || null,
    alerts,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Biên giờ nhận xe — `YYYY-MM-DD` hiểu theo ngày lịch VN (`dayRangeFilter`), ISO đầy đủ đi thẳng. */
function pickupRange(dateFrom?: string, dateTo?: string): Prisma.BookingWhereInput {
  const pickupAt = dayRangeFilter(dateFrom, dateTo);
  return pickupAt ? { pickupAt } : {};
}
