import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_OCCUPYING,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_TRIP_TAB,
  toLocalVnPhone,
  DRIVER_LINK_SCOPE,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import {
  resolveStorefront,
  storefrontTenantSelect,
} from '../../common/storefront/storefront-identity';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DRIVER_DEFAULT_LIMIT,
  DRIVER_MAX_LIMIT,
  DriverEmployerDto,
  DriverPendingCountsDto,
  DriverTripDetailDto,
  DriverTripDto,
  DriverTripListQueryDto,
  DriverTripPageDto,
  MyDriverLinkDto,
  MyDriverLinkListQueryDto,
  MyDriverLinkPageDto,
} from './dto/driver.dto';

const OCCUPYING: string[] = [...BOOKING_STATUS_OCCUPYING];
const OPEN_LINK: string[] = [...DRIVER_LINK_OPEN_STATUSES];

function tripSelect(now: Date) {
  return {
    id: true,
    code: true,
    status: true,
    driverAssignmentStatus: true,
    driverAssignedAt: true,
    driverRespondedAt: true,
    driverRespondBy: true,
    pickupAt: true,
    returnAt: true,
    routeType: true,
    pickupAddress: true,
    destination: true,
    customerName: true,
    customerPhone: true,
    driverUserId: true,
    vehicle: { select: { name: true, plateNumber: true, mainImageUrl: true } },
    tenant: { select: storefrontTenantSelect(now) },
  } satisfies Prisma.BookingSelect;
}

const DETAIL_EXTRA = {
  pickupLatitude: true,
  pickupLongitude: true,
  destinationLatitude: true,
  destinationLongitude: true,
  actualPickupAt: true,
  actualReturnAt: true,
} satisfies Prisma.BookingSelect;

type TripRow = Prisma.BookingGetPayload<{ select: ReturnType<typeof tripSelect> }>;

/**
 * Tài khoản KHÁCH trong vai tài xế (ADR 0063) — bề mặt ĐỌC. Ghi (trả lời lời mời, rời bên thuê,
 * nhận/từ chối chuyến) đi qua `DriversService`, writer duy nhất của liên kết và lượt gán.
 *
 * Danh tính luôn là `userId` của phiên. Mọi truy vấn khoá `drivers.user_id` / `bookings.
 * driver_user_id` = người gọi, nên id của một chuyến không phải của mình trả 404 — không tiết lộ
 * nó có tồn tại hay không. Chuyến trả theo một DTO HẸP: không tiền, không giấy tờ khách, không
 * ghi chú nội bộ; SĐT khách chỉ khi chuyến còn là của tài xế đó (đang giao hoặc đã hoàn thành).
 */
@Injectable()
export class DriverSelfService {
  constructor(private readonly prisma: PrismaService) {}

  async links(userId: string, query: MyDriverLinkListQueryDto): Promise<MyDriverLinkPageDto> {
    const paging = resolvePaging(query, DRIVER_DEFAULT_LIMIT, DRIVER_MAX_LIMIT);
    const closed = query.scope === DRIVER_LINK_SCOPE.CLOSED;
    const where: Prisma.DriverWhereInput = {
      userId,
      linkStatus: closed ? { notIn: OPEN_LINK } : { in: OPEN_LINK },
    };
    const now = new Date();
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({
        where,
        orderBy: closed
          ? [{ updatedAt: 'desc' }, { id: 'desc' }]
          : [{ linkStatus: 'asc' }, { invitedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          driverType: true,
          linkStatus: true,
          invitedAt: true,
          respondedAt: true,
          endedAt: true,
          endedByParty: true,
          tenant: { select: storefrontTenantSelect(now) },
        },
      }),
    ]);

    const counts = rows.length
      ? await this.prisma.booking.groupBy({
          by: ['driverId'],
          where: {
            driverId: { in: rows.map((r) => r.id) },
            driverUserId: userId,
            deletedAt: null,
            status: { in: OCCUPYING },
          },
          _count: { _all: true },
        })
      : [];
    const countOf = new Map(counts.map((c) => [c.driverId as string, c._count._all]));

    const data: MyDriverLinkDto[] = rows.map((r) => ({
      id: r.id,
      employer: employerOf(r.tenant, now),
      driverType: r.driverType,
      linkStatus: r.linkStatus,
      invitedAt: r.invitedAt.toISOString(),
      respondedAt: r.respondedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      endedByParty: r.endedByParty,
      activeTripCount: countOf.get(r.id) ?? 0,
    }));
    return { data, meta: paginationMeta(paging, total) };
  }

  async pendingCounts(userId: string): Promise<DriverPendingCountsDto> {
    const [invites, trips, anyLink] = await Promise.all([
      this.prisma.driver.count({ where: { userId, linkStatus: DRIVER_LINK_STATUS.INVITED } }),
      this.prisma.booking.count({
        where: {
          driverUserId: userId,
          driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
          status: { in: OCCUPYING },
          deletedAt: null,
        },
      }),
      this.prisma.driver.findFirst({ where: { userId }, select: { id: true } }),
    ]);
    return { invites, trips, hasLinks: anyLink !== null };
  }

  /**
   * "Chuyến tôi lái".
   *
   * - `upcoming` = đơn ĐANG giao cho tôi và còn chiếm lịch, sớm nhất trước — đọc thẳng `bookings`.
   * - `past` = MỌI đơn tôi từng được giao mà lượt của tôi đã kết thúc: hoàn thành, huỷ, khách không
   *   đến, bị gỡ, tôi từ chối. Đọc sổ `booking_driver_assignments`, CHỈ lượt hiện hành
   *   (`superseded = false`) — bên thuê đổi qua lại nhiều lần thì đơn vẫn hiện MỘT lần với kết quả
   *   cuối. Index `booking_driver_assignments_driver_past_idx`.
   */
  async trips(userId: string, query: DriverTripListQueryDto): Promise<DriverTripPageDto> {
    const paging = resolvePaging(query, DRIVER_DEFAULT_LIMIT, DRIVER_MAX_LIMIT);
    const upcoming = (query.tab ?? DRIVER_TRIP_TAB.UPCOMING) === DRIVER_TRIP_TAB.UPCOMING;
    const now = new Date();

    if (upcoming) {
      const where: Prisma.BookingWhereInput = {
        driverUserId: userId,
        deletedAt: null,
        status: { in: OCCUPYING },
      };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.booking.count({ where }),
        this.prisma.booking.findMany({
          where,
          orderBy: [{ pickupAt: 'asc' }, { id: 'asc' }],
          skip: paging.skip,
          take: paging.take,
          select: tripSelect(now),
        }),
      ]);
      return {
        data: rows.map((r) => toTrip(r, userId, null, now)),
        meta: paginationMeta(paging, total),
      };
    }

    const where: Prisma.BookingDriverAssignmentWhereInput = {
      driverUserId: userId,
      superseded: false,
      outcome: { not: DRIVER_ASSIGNMENT_OUTCOME.OPEN },
      booking: { deletedAt: null },
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingDriverAssignment.count({ where }),
      this.prisma.bookingDriverAssignment.findMany({
        where,
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: { ...EPISODE_SELECT, booking: { select: tripSelect(now) } },
      }),
    ]);
    return {
      data: rows.map((r) => toTrip(r.booking, userId, r, now)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Chi tiết một chuyến — của tôi HIỆN TẠI, hoặc đã từng là của tôi (lượt hiện hành trong sổ). Đơn
   * chưa bao giờ giao cho tôi trả 404, không tiết lộ nó có tồn tại hay không.
   */
  async trip(userId: string, bookingId: string): Promise<DriverTripDetailDto> {
    const now = new Date();
    const [row, episode] = await Promise.all([
      this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          deletedAt: null,
          OR: [
            { driverUserId: userId },
            { driverAssignments: { some: { driverUserId: userId, superseded: false } } },
          ],
        },
        select: { ...tripSelect(now), ...DETAIL_EXTRA },
      }),
      this.prisma.bookingDriverAssignment.findFirst({
        where: { bookingId, driverUserId: userId, superseded: false },
        select: EPISODE_SELECT,
      }),
    ]);
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy chuyến',
      });
    }
    return {
      ...toTrip(row, userId, episode, now),
      pickupLatitude: numberOrNull(row.pickupLatitude),
      pickupLongitude: numberOrNull(row.pickupLongitude),
      destinationLatitude: numberOrNull(row.destinationLatitude),
      destinationLongitude: numberOrNull(row.destinationLongitude),
      actualPickupAt: row.actualPickupAt?.toISOString() ?? null,
      actualReturnAt: row.actualReturnAt?.toISOString() ?? null,
    };
  }
}

const EPISODE_SELECT = {
  outcome: true,
  assignedAt: true,
  acceptedAt: true,
  endedAt: true,
} satisfies Prisma.BookingDriverAssignmentSelect;

type EpisodeRow = Prisma.BookingDriverAssignmentGetPayload<{ select: typeof EPISODE_SELECT }>;

function employerOf(tenant: Parameters<typeof resolveStorefront>[0], now: Date): DriverEmployerDto {
  const s = resolveStorefront(tenant, now);
  return {
    name: s.name,
    phone: s.phone ? toLocalVnPhone(s.phone) : null,
    avatarUrl: s.avatarUrl,
    kind: s.kind,
  };
}

/**
 * Một chuyến nhìn từ tài xế. `episode` = lượt gán của CHÍNH người này trong sổ (null ⇒ đơn đang
 * giao cho họ, đọc cột trên đơn). Đơn không còn là của họ (bị gỡ / từ chối / đã giao người khác)
 * thì KHÔNG trả SĐT khách — họ không còn việc gì để gọi.
 */
function toTrip(r: TripRow, userId: string, episode: EpisodeRow | null, now: Date): DriverTripDto {
  const current = r.driverUserId === userId;
  const outcome = episode?.outcome ?? DRIVER_ASSIGNMENT_OUTCOME.OPEN;
  const contactAllowed =
    current &&
    (outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN || outcome === DRIVER_ASSIGNMENT_OUTCOME.COMPLETED);
  const acceptedAt = current ? r.driverRespondedAt : (episode?.acceptedAt ?? null);
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    // Đơn đã khép lại vẫn giữ trạng thái lượt gán cuối cùng làm lịch sử.
    assignmentStatus: current
      ? (r.driverAssignmentStatus ?? DRIVER_ASSIGNMENT_STATUS.PENDING)
      : acceptedAt
        ? DRIVER_ASSIGNMENT_STATUS.ACCEPTED
        : DRIVER_ASSIGNMENT_STATUS.PENDING,
    outcome,
    assignedAt: (current
      ? (r.driverAssignedAt ?? r.pickupAt)
      : (episode?.assignedAt ?? r.pickupAt)
    ).toISOString(),
    respondedAt: acceptedAt?.toISOString() ?? null,
    // Hạn chỉ có nghĩa khi chuyến còn chờ CHÍNH tôi trả lời (ADR 0066).
    respondBy:
      current && outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN
        ? (r.driverRespondBy?.toISOString() ?? null)
        : null,
    endedAt: episode?.endedAt?.toISOString() ?? null,
    pickupAt: r.pickupAt.toISOString(),
    returnAt: r.returnAt.toISOString(),
    routeType: r.routeType,
    pickupAddress: r.pickupAddress,
    destination: r.destination,
    vehicle: {
      name: r.vehicle.name,
      plateNumber: r.vehicle.plateNumber,
      mainImageUrl: r.vehicle.mainImageUrl,
    },
    employer: employerOf(r.tenant, now),
    customer: {
      name: r.customerName,
      // Tài xế thấy SĐT khách ngay từ lúc được gán — để gọi xác nhận trước khi nhận chuyến.
      phone: contactAllowed && r.customerPhone ? toLocalVnPhone(r.customerPhone) : null,
      contactVisibleFrom: null,
    },
  };
}

function numberOrNull(v: Prisma.Decimal | null): number | null {
  return v == null ? null : Number(v);
}
