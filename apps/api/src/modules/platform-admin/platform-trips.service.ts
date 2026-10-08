import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PLATFORM_TRIP_QUEUE,
  TRIP_HOLD_URGENT_MINUTES,
  TRIP_PICKUP_WINDOW_HOURS,
  TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES,
  TRIP_REQUEST_URGENT_MINUTES,
  type PaginationMeta,
} from '@xeprime/types';
import { dayEndUtc, dayStartUtc, vnDateKey } from '../../common/day-range';
import { maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  PLATFORM_TRIP_DEFAULT_LIMIT,
  PLATFORM_TRIP_MAX_LIMIT,
  PlatformTripRemindResultDto,
  PlatformTripRequestDto,
  PlatformTripRequestListQueryDto,
  PlatformTripSummaryDto,
  PlatformTripSummaryQueryDto,
} from './dto/platform-trip.dto';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Hành động audit của lượt nền tảng nhắc tay chủ xe — đọc lại để kể "đã nhắc lúc" và để gác cooldown. */
const REMIND_ACTION = 'booking_request.platform_remind';
const REMIND_TARGET = 'booking_request';

/** Đơn "sắp giao xe": đã có đơn, xe chưa rời bãi. `confirmed` chỉ còn ở dữ liệu cũ (ADR 0047). */
const UPCOMING_STATUSES: string[] = [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED];

const REQUEST_SELECT = {
  id: true,
  status: true,
  customerName: true,
  customerPhone: true,
  serviceType: true,
  pickupAt: true,
  returnAt: true,
  longTermPackageMonths: true,
  pickupPreference: true,
  requestedPickupDate: true,
  pickupWindowStartDate: true,
  pickupWindowEndDate: true,
  createdAt: true,
  respondBy: true,
  firstRemindedAt: true,
  finalRemindedAt: true,
  decidedAt: true,
  tenantId: true,
  vehicleId: true,
  tenant: {
    select: { name: true, status: true, owner: { select: { displayName: true, phone: true } } },
  },
  vehicle: { select: { name: true, plateNumber: true, mainImageUrl: true, vehicleType: true } },
  hold: { select: { expiresAt: true, amount: true } },
} satisfies Prisma.BookingRequestSelect;

type RequestRow = Prisma.BookingRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

/**
 * VẬN HÀNH CHUYẾN cho nhân sự nền tảng — chỉ ĐỌC, trừ một việc: nhắc tay chủ xe.
 *
 * Bốn hàng đợi là bốn chặng của một chuyến (ADR 0044), và thứ tự trong mỗi hàng đợi là thứ tự
 * GẤP: hạn gần nhất lên đầu. Nền tảng không chuyển trạng thái yêu cầu/đơn ở đây (ADR 0006 — lịch
 * chỉ có một đường ghi, của gian hàng); nó nhìn để biết chỗ nào đang kẹt và gọi đúng người.
 *
 * Số đếm KHẨN dùng đúng ngưỡng mà worker gửi nhắc (`TRIP_*_URGENT_MINUTES`): một yêu cầu đã qua
 * mốc nhắc cuối mà vẫn chưa có câu trả lời là việc của người trực, không còn là việc của máy.
 */
@Injectable()
export class PlatformTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async summary(
    query: PlatformTripSummaryQueryDto = {},
    now: Date = new Date(),
  ): Promise<PlatformTripSummaryDto> {
    const todayKey = vnDateKey(now);
    const today = { gte: dayStartUtc(todayKey)!, lte: dayEndUtc(todayKey)! };
    const pickupHorizon = new Date(now.getTime() + TRIP_PICKUP_WINDOW_HOURS * HOUR_MS);
    const requestUrgentBy = new Date(now.getTime() + TRIP_REQUEST_URGENT_MINUTES * MINUTE_MS);
    const holdUrgentBy = new Date(now.getTime() + TRIP_HOLD_URGENT_MINUTES * MINUTE_MS);
    const scope = query.tenantId ? { tenantId: query.tenantId } : {};

    const pending: Prisma.BookingRequestWhereInput = {
      ...scope,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    };
    const awaiting: Prisma.BookingRequestWhereInput = {
      ...scope,
      status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    };
    const pickupSoon: Prisma.BookingWhereInput = {
      ...scope,
      deletedAt: null,
      status: { in: UPCOMING_STATUSES },
      pickupAt: { lte: pickupHorizon },
    };
    const active: Prisma.BookingWhereInput = {
      ...scope,
      deletedAt: null,
      status: BOOKING_STATUS.ACTIVE,
    };
    const live: Prisma.BookingWhereInput = {
      ...scope,
      deletedAt: null,
      status: { in: [...UPCOMING_STATUSES, BOOKING_STATUS.ACTIVE] },
    };

    const [
      pendingCount,
      pendingUrgent,
      awaitingCount,
      awaitingUrgent,
      pickupCount,
      pickupOverdue,
      activeCount,
      activeOverdue,
      pickupsToday,
      returnsToday,
    ] = await Promise.all([
      this.prisma.bookingRequest.count({ where: pending }),
      this.prisma.bookingRequest.count({
        where: { ...pending, respondBy: { lte: requestUrgentBy } },
      }),
      this.prisma.bookingRequest.count({ where: awaiting }),
      this.prisma.bookingRequest.count({
        where: { ...awaiting, hold: { is: { expiresAt: { lte: holdUrgentBy } } } },
      }),
      this.prisma.booking.count({ where: pickupSoon }),
      // Quá giờ giao mà đơn vẫn "chờ giao xe": xe chưa rời bãi, hoặc gian hàng quên bàn giao.
      this.prisma.booking.count({ where: { ...pickupSoon, pickupAt: { lt: now } } }),
      this.prisma.booking.count({ where: active }),
      this.prisma.booking.count({ where: { ...active, returnAt: { lt: now } } }),
      this.prisma.booking.count({ where: { ...live, pickupAt: today } }),
      this.prisma.booking.count({ where: { ...live, returnAt: today } }),
    ]);

    return {
      generatedAt: now.toISOString(),
      today: { pickups: pickupsToday, returns: returnsToday },
      queues: {
        [PLATFORM_TRIP_QUEUE.PENDING_APPROVAL]: { count: pendingCount, urgentCount: pendingUrgent },
        [PLATFORM_TRIP_QUEUE.AWAITING_HOLD]: { count: awaitingCount, urgentCount: awaitingUrgent },
        [PLATFORM_TRIP_QUEUE.PICKUP_SOON]: { count: pickupCount, urgentCount: pickupOverdue },
        [PLATFORM_TRIP_QUEUE.ACTIVE]: { count: activeCount, urgentCount: activeOverdue },
      },
    };
  }

  /** Hàng đợi yêu cầu — `pending_approval` xếp theo hạn trả lời, `awaiting_hold` theo hạn giữ chỗ. */
  async requests(
    query: PlatformTripRequestListQueryDto,
  ): Promise<{ data: PlatformTripRequestDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_TRIP_DEFAULT_LIMIT, PLATFORM_TRIP_MAX_LIMIT);
    const q = query.q?.trim();
    const isPending = query.queue === PLATFORM_TRIP_QUEUE.PENDING_APPROVAL;

    const where: Prisma.BookingRequestWhereInput = {
      status: isPending
        ? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL
        : BOOKING_REQUEST_STATUS.AWAITING_HOLD,
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q, mode: 'insensitive' } },
              { vehicle: { name: { contains: q, mode: 'insensitive' } } },
              { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
              { tenant: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.BookingRequestOrderByWithRelationInput[] = isPending
      ? [{ respondBy: 'asc' }, { id: 'asc' }]
      : [{ hold: { expiresAt: 'asc' } }, { id: 'asc' }];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bookingRequest.count({ where }),
      this.prisma.bookingRequest.findMany({
        where,
        orderBy,
        skip: paging.skip,
        take: paging.take,
        select: REQUEST_SELECT,
      }),
    ]);

    const lastReminds = await this.lastPlatformReminds(rows.map((row) => row.id));
    return {
      data: rows.map((row) => toRequestItem(row, lastReminds.get(row.id) ?? null)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Nhắc tay chủ xe về một yêu cầu đang chờ họ — một thông báo tới mọi thành viên gian hàng, một
   * dòng audit. Không đổi trạng thái gì.
   *
   * Cooldown gác bằng chính dòng audit gần nhất (không thêm cột), và phép kiểm nằm TRONG
   * transaction sau một khoá tư vấn theo yêu cầu: hai người trực cùng bấm một giây thì gian hàng
   * chỉ nhận một tin.
   */
  async remind(
    id: string,
    actorUserId: string,
    now: Date = new Date(),
  ): Promise<PlatformTripRemindResultDto> {
    const req = await this.prisma.bookingRequest.findFirst({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        customerName: true,
        respondBy: true,
        vehicle: { select: { name: true } },
      },
    });
    if (!req) throw notFound();
    if (req.status !== BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Chỉ nhắc được yêu cầu đang chờ chủ xe duyệt',
      });
    }

    const remainingMinutes = Math.max(
      0,
      Math.ceil((req.respondBy.getTime() - now.getTime()) / MINUTE_MS),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trip-remind:${id}`}))`;

      const last = await tx.auditLog.findFirst({
        where: { action: REMIND_ACTION, targetType: REMIND_TARGET, targetId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const cooldownMs = TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES * MINUTE_MS;
      if (last && now.getTime() - last.createdAt.getTime() < cooldownMs) {
        throw new HttpException(
          {
            code: API_ERROR_CODE.TRIP_REMIND_TOO_SOON,
            message: `Vừa nhắc chủ xe lúc ${last.createdAt.toISOString()} — đợi ${TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES} phút rồi nhắc lại`,
            details: { retryAt: new Date(last.createdAt.getTime() + cooldownMs).toISOString() },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Cùng loại với tin worker gửi ("yêu cầu sắp hết hạn") — gian hàng thấy nó ở đúng chỗ, với
      // tiêu đề nói rõ lần này là NGƯỜI của XePrime nhắc.
      await this.notifications.emitToTenantMembers(
        req.tenantId,
        {
          type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING,
          title: `XePrime nhắc: ${req.customerName} đang chờ bạn trả lời`,
          body:
            remainingMinutes > 0
              ? `${req.vehicle.name} · còn ${remainingMinutes} phút để trả lời`
              : req.vehicle.name,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: req.id,
          // Tin có đồng hồ thì có hạn dùng: quá hạn phản hồi là tin này vô nghĩa (cùng luật worker).
          pushExpiresAt: req.respondBy,
        },
        tx,
      );

      await this.audit.record(
        {
          tenantId: req.tenantId,
          actorUserId,
          actorScope: 'platform',
          action: REMIND_ACTION,
          targetType: REMIND_TARGET,
          targetId: req.id,
          after: { remainingMinutes },
        },
        tx,
      );
    });

    return { requestId: req.id, remindedAt: now.toISOString() };
  }

  /** Lần nhắc tay gần nhất của từng yêu cầu — một truy vấn cho cả trang, không N+1. */
  private async lastPlatformReminds(ids: readonly string[]): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.auditLog.findMany({
      where: { action: REMIND_ACTION, targetType: REMIND_TARGET, targetId: { in: [...ids] } },
      orderBy: { createdAt: 'desc' },
      select: { targetId: true, createdAt: true },
    });
    for (const row of rows) {
      if (row.targetId && !out.has(row.targetId)) out.set(row.targetId, row.createdAt);
    }
    return out;
  }
}

/** `@db.Date` về từ Prisma là 00:00 UTC của đúng ngày đó — cắt 10 ký tự là ra `YYYY-MM-DD`. */
function dateKey(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toRequestItem(r: RequestRow, lastPlatformRemindAt: Date | null): PlatformTripRequestDto {
  return {
    id: r.id,
    status: r.status,
    customerName: r.customerName,
    customerPhoneMasked: maskPhone(r.customerPhone),
    serviceType: r.serviceType,
    pickupAt: iso(r.pickupAt),
    returnAt: iso(r.returnAt),
    longTermPackageMonths: r.longTermPackageMonths,
    pickupPreference: r.pickupPreference,
    requestedPickupDate: dateKey(r.requestedPickupDate),
    pickupWindowStartDate: dateKey(r.pickupWindowStartDate),
    pickupWindowEndDate: dateKey(r.pickupWindowEndDate),
    createdAt: r.createdAt.toISOString(),
    respondBy: r.respondBy.toISOString(),
    firstRemindedAt: iso(r.firstRemindedAt),
    finalRemindedAt: iso(r.finalRemindedAt),
    decidedAt: iso(r.decidedAt),
    holdExpiresAt: iso(r.hold?.expiresAt ?? null),
    holdAmount: r.hold ? (r.hold.amount as unknown as string) : null,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    tenantStatus: r.tenant.status,
    ownerName: r.tenant.owner?.displayName ?? null,
    ownerPhone: r.tenant.owner?.phone ?? null,
    vehicleId: r.vehicleId,
    vehicleName: r.vehicle.name,
    vehiclePlateNumber: r.vehicle.plateNumber,
    vehicleImageUrl: r.vehicle.mainImageUrl,
    vehicleType: r.vehicle.vehicleType,
    lastPlatformRemindAt: iso(lastPlatformRemindAt),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu thuê',
  });
}
