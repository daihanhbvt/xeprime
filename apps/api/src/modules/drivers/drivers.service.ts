import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CLEARED_DRIVER_ASSIGNMENT,
  CLEARED_EXTERNAL_DRIVER,
  closeOpenDriverAssignment,
  expirePendingDriverAssignment,
  isUniqueViolation,
  markDriverMissingAlertCovered,
  newId,
  Prisma,
} from '@xeprime/prisma';
import {
  driverDisplayName,
  driverReassignPushExpiresAt,
  driverResponseExpiredEmployerCopy,
  driverTripDeclinedEmployerCopy,
} from '@xeprime/domain';
import {
  driverRespondByFor,
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  DRIVER_ASSIGNMENT_AUDIT_ACTION,
  BOOKING_STATUS,
  BOOKING_STATUS_OCCUPYING,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_LICENCE_STATE,
  DRIVER_LICENCE_STATUS,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_ANY,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  USER_STATUS,
  toLocalVnPhone,
  type DriverLinkEndParty,
  DRIVER_REASSIGNABLE_BOOKING_STATUSES,
  DRIVER_ASSIGNMENT_OUTCOME,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { vnDateKey } from '../../common/day-range';
import { fromDateOnly } from '../../common/date-only';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { maskName, maskPhone } from '../../common/mask';
import { normalizePhone } from '../../common/phone';
import { piiSearch } from '../../common/support/support-search';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  AssignableDriverDto,
  DRIVER_DEFAULT_LIMIT,
  DRIVER_MAX_LIMIT,
  DriverDto,
  BookingDriverHistoryItemDto,
  DriverLicenceSummaryDto,
  DriverListQueryDto,
  DriverPageDto,
  InviteDriverDto,
  UpdateDriverDto,
} from './dto/driver.dto';

type Db = Prisma.TransactionClient | PrismaService;

const OCCUPYING: string[] = [...BOOKING_STATUS_OCCUPYING];
const OPEN_LINK: string[] = [...DRIVER_LINK_OPEN_STATUSES];
/** Đơn chưa giao xe — còn đổi/gỡ tài xế được; cũng là tập bị ảnh hưởng khi liên kết chấm dứt. */
const REASSIGNABLE: string[] = [...DRIVER_REASSIGNABLE_BOOKING_STATUSES];
const DAY_MS = 86_400_000;
/** Trần số liên kết đọc cho bộ chọn gán / tự gán — một bên thuê thực tế có vài chục tài xế. */
const DRIVER_ASSIGNABLE_MAX = 200;
/** "Đặt ngay" chia việc theo số chuyến của mỗi tài xế trong ±N ngày quanh giờ nhận. */
const DRIVER_AUTO_ASSIGN_LOAD_WINDOW_DAYS = 7;
/** Số chuyến đã nhận liệt kê trong lỗi chặn "ngừng làm tài xế" — đủ để tài xế biết gọi ai. */
const LEAVE_BLOCKING_TRIPS_SHOWN = 20;

const LINK_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  name: true,
  phone: true,
  driverType: true,
  note: true,
  linkStatus: true,
  invitedAt: true,
  respondedAt: true,
  endedAt: true,
  endedByParty: true,
  user: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.DriverSelect;

type LinkRow = Prisma.DriverGetPayload<{ select: typeof LINK_SELECT }>;

/**
 * Tài xế LIÊN KẾT — ADR 0063. Writer DUY NHẤT của bảng `drivers` và của bốn cột tài xế trên
 * `bookings` (`driver_id`, `driver_user_id`, `driver_assignment_status`, `driver_*_at`) — kể cả hai
 * cột tài xế NGOÀI HỆ THỐNG `external_driver_name`/`external_driver_phone` (ADR 0067).
 *
 * Hai bề mặt gọi vào đây: khu quản lý của BÊN THUÊ (`DriversController`, `BookingsService`) và
 * tài khoản KHÁCH trong vai tài xế (`DriverSelfService`). Mọi luật "gán được", "gỡ thì báo ai",
 * "kết thúc liên kết thì đơn nào phải nhả" nằm MỘT chỗ — hai bề mặt chỉ là hai cửa vào.
 *
 * Ngoại lệ có tên (ADR 0066): worker `driver-assignment-expiry` trả lượt QUÁ HẠN trả lời về bên
 * thuê — qua CÙNG hàm `expirePendingDriverAssignment` (`@xeprime/prisma`) mà lượt Từ chối muộn ở
 * đây dùng, nên hai đường xoá đúng một tập cột và khép sổ cùng một kết cục.
 *
 * Chốt chặn trùng lịch là `bookings_driver_user_schedule_excl` ở DB (theo NGƯỜI, xuyên mọi bên
 * thuê). Các phép kiểm ở đây chỉ để thông điệp lỗi cụ thể; hai lượt gán đua nhau thì constraint
 * từ chối kẻ đến sau.
 */
@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Bên thuê — danh sách + vòng đời liên kết
  // ───────────────────────────────────────────────────────────────────────────

  async list(tenantId: string, query: DriverListQueryDto): Promise<DriverPageDto> {
    const paging = resolvePaging(query, DRIVER_DEFAULT_LIMIT, DRIVER_MAX_LIMIT);
    const where: Prisma.DriverWhereInput = {
      tenantId,
      ...(query.linkStatus === DRIVER_LINK_STATUS_FILTER_ANY
        ? {}
        : { linkStatus: query.linkStatus ? query.linkStatus : { in: OPEN_LINK } }),
      ...(query.driverType ? { driverType: query.driverType } : {}),
      ...(query.q ? { OR: driverSearchOr(query.q) } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({
        where,
        // Lời mời chờ trả lời lên đầu (`invited` < `active` < `suspended` theo chữ cái), rồi tên.
        orderBy: [{ linkStatus: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: paging.skip,
        take: paging.take,
        select: LINK_SELECT,
      }),
    ]);

    const closedUserIds = rows
      .filter((r) => !OPEN_LINK.includes(r.linkStatus))
      .map((r) => r.userId);
    const [counts, licences, reopened] = await Promise.all([
      this.activeBookingCounts(rows.map((r) => r.id)),
      this.licenceSummaries(rows.map((r) => r.userId)),
      this.openLinkStatusByUser(tenantId, closedUserIds),
    ]);
    return {
      data: rows.map((r) =>
        toDto(
          r,
          counts.get(r.id) ?? 0,
          licences.get(r.userId),
          OPEN_LINK.includes(r.linkStatus) ? null : (reopened.get(r.userId) ?? null),
        ),
      ),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Mời một tài khoản KHÁCH làm tài xế. SĐT phải thuộc một tài khoản khách đang hoạt động, đã xác
   * minh số — không có thì CHẶN (quyết định sản phẩm 16/10/2026), không sinh lời mời treo cho
   * một người chưa tồn tại.
   */
  async invite(tenantId: string, actorUserId: string, dto: InviteDriverDto): Promise<DriverDto> {
    const phone = normalizePhone(dto.phone);
    const account = await this.prisma.user.findFirst({
      where: {
        realm: ACCOUNT_REALM.CUSTOMER,
        phone,
        phoneVerifiedAt: { not: null },
        status: USER_STATUS.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException({
        code: API_ERROR_CODE.DRIVER_ACCOUNT_NOT_FOUND,
        message:
          'Số điện thoại này chưa có tài khoản XePrime đã xác minh — nhờ tài xế đăng ký trước',
      });
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.driver.create({
          data: {
            id: newId(),
            tenantId,
            userId: account.id,
            name: dto.name.trim(),
            phone,
            ...(dto.driverType ? { driverType: dto.driverType } : {}),
            note: dto.note?.trim() || null,
            linkStatus: DRIVER_LINK_STATUS.INVITED,
            invitedBy: actorUserId,
          },
          select: LINK_SELECT,
        });
        await this.audit.record(
          {
            tenantId,
            actorUserId,
            actorScope: AUDIT_ACTOR_SCOPE.TENANT,
            action: 'driver.invite',
            targetType: 'driver',
            targetId: created.id,
            after: { name: created.name, phone: created.phone },
          },
          tx,
        );
        const employer = await this.employerName(tx, tenantId);
        await this.notifications.emitToUser(
          account.id,
          {
            type: NOTIFICATION_TYPE.DRIVER_INVITED,
            title: `${employer} mời bạn làm tài xế`,
            body: 'Mở XePrime để chấp nhận hoặc từ chối lời mời.',
            targetType: NOTIFICATION_TARGET_TYPE.DRIVER_LINK,
            targetId: created.id,
          },
          tx,
        );
        return created;
      });
      const licences = await this.licenceSummaries([row.userId]);
      return toDto(row, 0, licences.get(row.userId));
    } catch (err) {
      if (isUniqueViolation(err, 'drivers_one_open_link_key')) {
        throw new ConflictException({
          code: API_ERROR_CODE.DRIVER_ALREADY_LINKED,
          message: 'Tài khoản này đã có lời mời hoặc đang là tài xế của bạn',
        });
      }
      throw err;
    }
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    await this.openLinkOrThrow(this.prisma, tenantId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.driver.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.driverType !== undefined ? { driverType: dto.driverType } : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        },
        select: LINK_SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'driver.update',
          targetType: 'driver',
          targetId: id,
        },
        tx,
      );
      return updated;
    });
    return this.oneDto(row);
  }

  /** Tạm khoá / mở khoá một liên kết đang chạy. Tạm khoá giữ các chuyến đã gán, chặn gán mới. */
  async setSuspended(
    tenantId: string,
    actorUserId: string,
    id: string,
    suspended: boolean,
  ): Promise<DriverDto> {
    const from = suspended ? DRIVER_LINK_STATUS.ACTIVE : DRIVER_LINK_STATUS.SUSPENDED;
    const to = suspended ? DRIVER_LINK_STATUS.SUSPENDED : DRIVER_LINK_STATUS.ACTIVE;
    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.driver.updateMany({
        where: { id, tenantId, linkStatus: from },
        data: { linkStatus: to },
      });
      if (claimed.count === 0) await this.throwLinkState(tx, tenantId, id);
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: suspended ? 'driver.suspend' : 'driver.resume',
          targetType: 'driver',
          targetId: id,
        },
        tx,
      );
      return tx.driver.findUniqueOrThrow({ where: { id }, select: LINK_SELECT });
    });
    return this.oneDto(row);
  }

  /**
   * Bên thuê chấm dứt: thu hồi lời mời đang chờ, hoặc gỡ một tài xế đang liên kết. Còn chuyến
   * ĐANG CHẠY thì chặn — xe đang ngoài đường với tài xế này. Chuyến chưa nhận xe được gỡ tài xế
   * (bên thuê gán người khác) và tài xế được báo.
   */
  async endByEmployer(tenantId: string, actorUserId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const link = await this.openLinkOrThrow(tx, tenantId, id);
      await this.endWithinTx(tx, link, DRIVER_LINK_END_PARTY.EMPLOYER, actorUserId);
      await this.notifications.emitToUser(
        link.userId,
        {
          type: NOTIFICATION_TYPE.DRIVER_LINK_ENDED,
          title:
            link.linkStatus === DRIVER_LINK_STATUS.INVITED
              ? `${await this.employerName(tx, tenantId)} đã thu hồi lời mời làm tài xế`
              : `${await this.employerName(tx, tenantId)} đã kết thúc liên kết tài xế với bạn`,
          body: null,
          targetType: NOTIFICATION_TARGET_TYPE.DRIVER_LINK,
          targetId: link.id,
        },
        tx,
      );
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tài xế — trả lời lời mời / rời bên thuê (gọi từ DriverSelfService)
  // ───────────────────────────────────────────────────────────────────────────

  async respondToInvite(userId: string, id: string, accept: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.driver.updateMany({
        where: { id, userId, linkStatus: DRIVER_LINK_STATUS.INVITED },
        data: {
          linkStatus: accept ? DRIVER_LINK_STATUS.ACTIVE : DRIVER_LINK_STATUS.DECLINED,
          respondedAt: new Date(),
        },
      });
      const link = await tx.driver.findFirst({
        where: { id, userId },
        select: { id: true, tenantId: true, name: true },
      });
      if (!link) throw linkNotFound();
      if (claimed.count === 0) throw linkStateConflict();

      await this.audit.record(
        {
          tenantId: link.tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          action: accept ? 'driver.accept_invite' : 'driver.decline_invite',
          targetType: 'driver',
          targetId: id,
        },
        tx,
      );
      await this.notifications.emitToTenantMembers(
        link.tenantId,
        {
          type: accept
            ? NOTIFICATION_TYPE.DRIVER_INVITE_ACCEPTED
            : NOTIFICATION_TYPE.DRIVER_INVITE_DECLINED,
          title: accept
            ? `${link.name} đã đồng ý làm tài xế của bạn`
            : `${link.name} đã từ chối lời mời làm tài xế`,
          body: null,
          targetType: NOTIFICATION_TARGET_TYPE.DRIVER_LINK,
          targetId: id,
        },
        tx,
      );
    });
  }

  async leave(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const link = await tx.driver.findFirst({
        where: { id, userId },
        select: LINK_SELECT,
      });
      if (!link) throw linkNotFound();
      if (
        link.linkStatus !== DRIVER_LINK_STATUS.ACTIVE &&
        link.linkStatus !== DRIVER_LINK_STATUS.SUSPENDED
      ) {
        throw linkStateConflict();
      }
      /*
       * Chuyến ĐÃ NHẬN là một cam kết (19/10/2026): tài xế không tự rời khi còn chuyến đã nhận mà
       * chưa giao xe — bên thuê phải đổi người trước, nếu không N chuyến mất tài xế ngay sát giờ.
       * Chuyến chỉ đang CHỜ NHẬN thì vẫn cho rời (tự gỡ ở `endWithinTx`, tài xế chưa hứa gì).
       */
      const committed = await tx.booking.findMany({
        where: {
          driverId: link.id,
          status: { in: REASSIGNABLE },
          driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
          deletedAt: null,
        },
        orderBy: { pickupAt: 'asc' },
        take: LEAVE_BLOCKING_TRIPS_SHOWN,
        select: { id: true, code: true, pickupAt: true },
      });
      if (committed.length > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.DRIVER_HAS_ACCEPTED_TRIPS,
          message: `Bạn còn ${committed.length} chuyến đã nhận — liên hệ bên thuê để đổi tài xế trước khi ngừng`,
          details: {
            count: committed.length,
            trips: committed.map((b) => ({
              id: b.id,
              code: b.code,
              pickupAt: b.pickupAt.toISOString(),
            })),
          },
        });
      }
      await this.endWithinTx(tx, link, DRIVER_LINK_END_PARTY.DRIVER, userId);
      await this.notifications.emitToTenantMembers(
        link.tenantId,
        {
          type: NOTIFICATION_TYPE.DRIVER_LINK_ENDED,
          title: `${link.name} đã ngừng làm tài xế cho bạn`,
          body: 'Các chuyến chưa nhận xe của tài xế này đã được gỡ — hãy gán người khác.',
          targetType: NOTIFICATION_TARGET_TYPE.DRIVER_LINK,
          targetId: id,
        },
        tx,
      );
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Gán vào chuyến
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Bộ chọn gán đơn: mọi tài xế ĐANG LIÊN KẾT của bên thuê, kèm cờ bận (theo NGƯỜI, xuyên mọi
   * bên thuê) và mức bằng lái. Một truy vấn chiếm lịch cho cả danh sách — không N+1.
   */
  async assignable(
    tenantId: string,
    window: { pickupAt: Date; returnAt: Date; excludeBookingId?: string },
  ): Promise<AssignableDriverDto[]> {
    const links = await this.prisma.driver.findMany({
      where: { tenantId, linkStatus: DRIVER_LINK_STATUS.ACTIVE },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: DRIVER_ASSIGNABLE_MAX,
      select: { id: true, name: true, phone: true, userId: true },
    });
    if (links.length === 0) return [];
    const [busy, licences] = await Promise.all([
      this.busyUserIds(
        this.prisma,
        links.map((l) => l.userId),
        window,
      ),
      this.licenceSummaries(links.map((l) => l.userId)),
    ]);
    return links.map((l) => ({
      id: l.id,
      name: l.name,
      phone: toLocalVnPhone(l.phone),
      busy: busy.has(l.userId),
      licenceState: licences.get(l.userId)?.state ?? DRIVER_LICENCE_STATE.NONE,
    }));
  }

  /**
   * Bên thuê có ít nhất MỘT tài xế liên kết rảnh khung giờ này không — điều kiện để hệ thống tự
   * nhận chuyến có tài xế ("Đặt ngay"). Đơn tự nhận được GÁN SẴN người đó ở trạng thái chờ nhận
   * (`pickForAutoAssign`, 19/10/2026) — tài xế vẫn phải tự nhận, hệ thống không thay họ đồng ý.
   */
  async hasAvailableDriver(
    db: Db,
    tenantId: string,
    window: { pickupAt: Date; returnAt: Date },
  ): Promise<boolean> {
    return (await this.pickForAutoAssign(db, tenantId, window)) !== null;
  }

  /**
   * Tài xế để hệ thống TỰ GÁN khi "Đặt ngay" nhận một chuyến có tài xế (19/10/2026): liên kết
   * `active`, rảnh khung giờ (theo NGƯỜI, mọi bên thuê), không phải chính khách của chuyến, và
   * ÍT chuyến nhất trong ±7 ngày quanh giờ nhận — chia đều việc, không dồn cho người đứng đầu
   * danh sách. Lượt gán vẫn `pending`: tài xế phải tự nhận, hệ thống không thay họ đồng ý.
   */
  async pickForAutoAssign(
    db: Db,
    tenantId: string,
    window: { pickupAt: Date; returnAt: Date; excludeUserId?: string | null },
  ): Promise<{ id: string; userId: string } | null> {
    const links = await db.driver.findMany({
      where: {
        tenantId,
        linkStatus: DRIVER_LINK_STATUS.ACTIVE,
        ...(window.excludeUserId ? { userId: { not: window.excludeUserId } } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, userId: true },
      take: DRIVER_ASSIGNABLE_MAX,
    });
    if (links.length === 0) return null;
    const busy = await this.busyUserIds(
      db,
      links.map((l) => l.userId),
      window,
    );
    const free = links.filter((l) => !busy.has(l.userId));
    if (free.length === 0) return null;
    const loadWindowMs = DRIVER_AUTO_ASSIGN_LOAD_WINDOW_DAYS * DAY_MS;
    const load = await db.booking.groupBy({
      by: ['driverUserId'],
      where: {
        driverUserId: { in: free.map((l) => l.userId) },
        deletedAt: null,
        status: { in: OCCUPYING },
        pickupAt: { lt: new Date(window.pickupAt.getTime() + loadWindowMs) },
        returnAt: { gt: new Date(window.pickupAt.getTime() - loadWindowMs) },
      },
      _count: { _all: true },
    });
    const countOf = new Map(load.map((r) => [r.driverUserId as string, r._count._all]));
    // Ổn định: cùng số chuyến thì giữ thứ tự tên (sort của JS ổn định từ ES2019).
    return [...free].sort(
      (x, y) => (countOf.get(x.userId) ?? 0) - (countOf.get(y.userId) ?? 0),
    )[0]!;
  }

  async countActiveLinks(tenantId: string): Promise<number> {
    return this.prisma.driver.count({
      where: { tenantId, linkStatus: DRIVER_LINK_STATUS.ACTIVE },
    });
  }

  /**
   * Gán / đổi / bỏ gán tài xế của một đơn — chạy TRONG transaction của bên gọi.
   *
   * Lượt gán mới luôn ở `pending`: tài xế phải nhận. Lượt chờ vẫn giữ lịch của người đó (EXCLUDE
   * tính cả `pending`). Đổi người thì người cũ được báo đã bị gỡ, người mới được mời nhận.
   * Ném 23P01 nguyên trạng khi đua — bên gọi đổi thành `DRIVER_BUSY` (`isDriverScheduleConflict`).
   *
   * Gán tài xế liên kết hay bỏ gán (`driverId: null`) đều xoá tài xế NGOÀI HỆ THỐNG đang ghi trên
   * đơn (ADR 0067 — hai cách loại trừ nhau), kèm audit `booking.driver_external_cleared`.
   */
  async assignWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      bookingId: string;
      driverId: string | null;
      /** `null` = hệ thống (tự gán khi "Đặt ngay" nhận chuyến). */
      actorUserId: string | null;
    },
  ): Promise<void> {
    const booking = await this.lockBookingForDriverChange(tx, input.tenantId, input.bookingId);
    if (input.driverId === booking.driverId && !booking.externalDriverName) return;
    // Đã bàn giao (xe đang chạy) hoặc đơn đã khép ⇒ người cầm lái đã chốt, không đổi/gỡ nữa.
    if (!REASSIGNABLE.includes(booking.status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.DRIVER_ASSIGNMENT_LOCKED,
        message: 'Đơn đã giao xe hoặc đã kết thúc — không đổi tài xế được nữa',
      });
    }

    let link: { id: string; name: string; userId: string } | null = null;
    if (input.driverId) {
      if (booking.serviceType !== SERVICE_TYPE.WITH_DRIVER) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODE.DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED,
          message: 'Chỉ đơn thuê có tài xế mới gán tài xế được',
        });
      }
      const found = await tx.driver.findFirst({
        where: { id: input.driverId, tenantId: input.tenantId },
        select: { id: true, name: true, userId: true, linkStatus: true },
      });
      if (!found) throw linkNotFound();
      if (found.linkStatus !== DRIVER_LINK_STATUS.ACTIVE) {
        throw new ConflictException({
          code: API_ERROR_CODE.DRIVER_NOT_ASSIGNABLE,
          message: `${found.name} chưa ở trạng thái liên kết — chưa gán được`,
        });
      }
      if (found.userId === booking.bookingRequest?.customerUserId) {
        throw new ConflictException({
          code: API_ERROR_CODE.DRIVER_IS_TRIP_CUSTOMER,
          message: `${found.name} là khách của chính chuyến này — chọn tài xế khác`,
        });
      }
      const busy = await this.busyUserIds(tx, [found.userId], {
        pickupAt: booking.pickupAt,
        returnAt: booking.returnAt,
        excludeBookingId: booking.id,
      });
      if (busy.size > 0) throw driverBusy(found.name);
      link = found;
    }

    const now = new Date();
    // Hạn trả lời tính MỘT lần ở đây và lưu lại (ADR 0066) — client chỉ đọc mốc để đếm ngược.
    const respondBy = link ? driverRespondByFor(now, booking.pickupAt) : null;
    await tx.booking.update({
      where: { id: booking.id },
      // Tài xế ngoài hệ thống (nếu có) luôn về NULL: gán liên kết thì CHECK loại trừ đòi vậy, bỏ
      // gán thì đơn không còn ai (ADR 0067).
      data: link
        ? {
            driverId: link.id,
            driverUserId: link.userId,
            driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
            driverAssignedAt: now,
            driverRespondedAt: null,
            driverRespondBy: respondBy,
            ...CLEARED_EXTERNAL_DRIVER,
          }
        : { ...CLEARED_ASSIGNMENT, ...CLEARED_EXTERNAL_DRIVER },
    });

    // Sổ lịch sử: lượt cũ kết thúc là "đã gỡ", lượt mới mở ra (ADR 0063).
    if (booking.driverId) {
      await closeOpenAssignment(
        tx,
        booking.id,
        DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
        input.actorUserId,
      );
    }
    if (link) {
      await openAssignment(tx, {
        tenantId: input.tenantId,
        bookingId: booking.id,
        driverId: link.id,
        driverUserId: link.userId,
        assignedBy: input.actorUserId,
      });
    }

    const actorScope = input.actorUserId ? AUDIT_ACTOR_SCOPE.TENANT : AUDIT_ACTOR_SCOPE.SYSTEM;
    if (booking.externalDriverName) {
      await this.audit.record(
        {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          actorScope,
          action: DRIVER_ASSIGNMENT_AUDIT_ACTION.EXTERNAL_CLEARED,
          targetType: AUDIT_TARGET_TYPE.BOOKING,
          targetId: booking.id,
          before: { externalDriver: maskedExternalDriver(booking) },
          after: { externalDriver: null, driverId: link?.id ?? null },
        },
        tx,
      );
    }
    // Lượt gán LIÊN KẾT đổi thật mới ghi `driver_assign` — xoá riêng tài xế ngoài hệ thống đã có
    // dòng audit của nó ở trên.
    if (booking.driverId !== (link?.id ?? null)) {
      await this.audit.record(
        {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          actorScope,
          action: 'booking.driver_assign',
          targetType: 'booking',
          targetId: booking.id,
          before: { driverId: booking.driverId },
          after: { driverId: link?.id ?? null, ...(link ? { driverName: link.name } : {}) },
        },
        tx,
      );
    }

    if (booking.driverUserId) {
      await this.notifyUnassigned(tx, booking, 'Chuyến đã được giao cho tài xế khác.');
    }
    if (link && respondBy) {
      const employer = await this.employerName(tx, input.tenantId);
      await this.notifications.emitToUser(
        link.userId,
        {
          type: NOTIFICATION_TYPE.DRIVER_TRIP_ASSIGNED,
          title: `Bạn có chuyến mới từ ${employer} — vui lòng xác nhận`,
          body: `Chuyến ${booking.code} · nhận lúc ${formatVnDateTime(booking.pickupAt)} · trả lời trước ${formatVnDateTime(respondBy)}`,
          targetType: NOTIFICATION_TARGET_TYPE.DRIVER_TRIP,
          targetId: booking.id,
          // Rung máy sau hạn trả lời là mời tài xế nhận một chuyến đã không còn của họ.
          pushExpiresAt: respondBy,
        },
        tx,
      );
    }
  }

  /**
   * Ghi / đổi tài xế NGOÀI HỆ THỐNG trên đơn (ADR 0067) — chạy TRONG transaction của bên gọi.
   *
   * Không có lượt chờ: lưu là coi như đã nhận. Lượt gán LIÊN KẾT đang có (chờ hay đã nhận) bị đóng
   * như "bỏ gán" (`unassigned`) và người đó được báo — y như đổi sang tài xế liên kết khác. Không
   * chống trùng lịch (hệ thống không biết người này), không tạo hồ sơ dùng lại.
   *
   * `driver_missing_alerted_at` GIỮ NGUYÊN: đó là cột claim "đã nhắc một lần", không phải trạng
   * thái phủ — đơn đã có người thì phép quét tự bỏ qua, gỡ lại sau đó cũng không nhắc lần hai.
   */
  async setExternalWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      bookingId: string;
      name: string;
      phone: string;
      actorUserId: string;
    },
  ): Promise<void> {
    const booking = await this.lockBookingForDriverChange(tx, input.tenantId, input.bookingId);
    if (!REASSIGNABLE.includes(booking.status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.DRIVER_ASSIGNMENT_LOCKED,
        message: 'Đơn đã giao xe hoặc đã kết thúc — không đổi tài xế được nữa',
      });
    }
    if (booking.serviceType !== SERVICE_TYPE.WITH_DRIVER) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODE.DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED,
        message: 'Chỉ đơn thuê có tài xế mới gán tài xế được',
      });
    }

    const name = input.name.trim();
    const phone = normalizePhone(input.phone);
    // Gửi lại đúng người đang ghi ⇒ không đổi gì, không audit trùng.
    if (booking.externalDriverName === name && booking.externalDriverPhone === phone) return;

    const now = new Date();
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        ...CLEARED_ASSIGNMENT,
        externalDriverName: name,
        externalDriverPhone: phone,
        driverAssignedAt: now,
      },
    });
    if (booking.driverId) {
      await closeOpenAssignment(
        tx,
        booking.id,
        DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
        input.actorUserId,
      );
    }

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action: DRIVER_ASSIGNMENT_AUDIT_ACTION.EXTERNAL_SET,
        targetType: AUDIT_TARGET_TYPE.BOOKING,
        targetId: booking.id,
        before: {
          driverId: booking.driverId,
          externalDriver: maskedExternalDriver(booking),
        },
        after: {
          driverId: null,
          externalDriver: maskedExternalDriver({
            externalDriverName: name,
            externalDriverPhone: phone,
          }),
        },
      },
      tx,
    );

    if (booking.driverUserId) {
      await this.notifyUnassigned(tx, booking, 'Chuyến đã được giao cho tài xế khác.');
    }
  }

  /**
   * Đọc + KHOÁ dòng đơn trước khi đổi tài xế (`FOR UPDATE`). Hai lượt đổi song song (gán liên kết
   * ↔ ghi tài xế ngoài) nếu không khoá sẽ cùng đọc "chưa có ai" rồi kẻ thắng sau xoá lượt gán của
   * kẻ kia mà không khép sổ, không báo người bị gỡ. Khoá xếp hàng chúng; kẻ sau đọc đúng hiện trạng.
   */
  private async lockBookingForDriverChange(
    tx: Prisma.TransactionClient,
    tenantId: string,
    bookingId: string,
  ) {
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${bookingId} AND "tenant_id" = ${tenantId} FOR UPDATE`;
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        tenantId: true,
        status: true,
        serviceType: true,
        pickupAt: true,
        returnAt: true,
        driverId: true,
        driverUserId: true,
        externalDriverName: true,
        externalDriverPhone: true,
        bookingRequest: { select: { customerUserId: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đơn',
      });
    }
    return booking;
  }

  /**
   * Tài xế nhận / từ chối một chuyến được gán. Chỉ lượt đang `pending`, của CHÍNH người đó, trên
   * đơn còn chiếm lịch — điều kiện nằm trong WHERE nên lượt đua với bên thuê đổi người sẽ 409.
   */
  async respondToTrip(userId: string, bookingId: string, accept: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, driverUserId: userId, deletedAt: null },
        select: {
          id: true,
          code: true,
          tenantId: true,
          status: true,
          driverAssignmentStatus: true,
          driverRespondBy: true,
          driver: { select: { name: true } },
        },
      });
      if (!booking) {
        /*
         * Lượt của tôi đã bị hệ thống trả về vì quá hạn (ADR 0066) — đơn không còn mang tôi nên
         * phép đọc trên trả rỗng. Nói đúng lý do thay vì 404: Nhận ⇒ `DRIVER_ASSIGNMENT_EXPIRED`;
         * Từ chối ⇒ ý muốn "không lái" đã thành sự thật, trả thành công (idempotent).
         */
        const lapsed = await tx.bookingDriverAssignment.findFirst({
          where: {
            bookingId,
            driverUserId: userId,
            superseded: false,
            outcome: DRIVER_ASSIGNMENT_OUTCOME.EXPIRED,
          },
          select: { id: true },
        });
        if (!lapsed) throw tripNotFound();
        if (accept) throw assignmentExpired(null);
        return;
      }

      const driverName = driverDisplayName(booking.driver?.name);
      const pastDeadline =
        booking.driverAssignmentStatus === DRIVER_ASSIGNMENT_STATUS.PENDING &&
        booking.driverRespondBy !== null &&
        booking.driverRespondBy.getTime() <= now.getTime() &&
        REASSIGNABLE.includes(booking.status);
      if (pastDeadline) {
        // Quá hạn mà worker chưa kịp quét: Nhận bị từ chối; Từ chối thì làm đúng việc worker sắp
        // làm — trả lượt về bên thuê với kết cục `expired` (không phải `declined`: tài xế đã để
        // lỡ hạn, và bên thuê nhận đúng một loại tin khẩn dù ai về đích trước).
        if (accept) throw assignmentExpired(booking.driverRespondBy);
        const released = await expirePendingDriverAssignment(tx, {
          bookingId,
          driverUserId: userId,
          now,
          endedBy: userId,
        });
        if (!released) throw assignmentStateConflict();
        await this.audit.record(
          {
            tenantId: booking.tenantId,
            actorUserId: userId,
            actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
            action: DRIVER_ASSIGNMENT_AUDIT_ACTION.RESPONSE_EXPIRED,
            targetType: AUDIT_TARGET_TYPE.BOOKING,
            targetId: bookingId,
            after: { respondBy: booking.driverRespondBy?.toISOString(), lateDecline: true },
          },
          tx,
        );
        await this.notifications.emitToTenantMembers(
          booking.tenantId,
          {
            type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED,
            ...driverResponseExpiredEmployerCopy({ driverName, bookingCode: booking.code }),
            targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
            targetId: bookingId,
            pushExpiresAt: driverReassignPushExpiresAt(now),
          },
          tx,
        );
        return;
      }

      const claimed = await tx.booking.updateMany({
        where: {
          id: bookingId,
          driverUserId: userId,
          driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
          status: { in: OCCUPYING },
          deletedAt: null,
          // Hạn nằm TRONG WHERE (ADR 0066): lượt Nhận đua với worker quét hạn thì chỉ một bên
          // thắng. Đơn đã giao xe không bị worker trả về, nên hạn không còn chặn nó.
          OR: [{ driverRespondBy: { gt: now } }, { status: BOOKING_STATUS.ACTIVE }],
        },
        data: accept
          ? {
              driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
              driverRespondedAt: now,
              driverRespondBy: null,
            }
          : CLEARED_ASSIGNMENT,
      });
      if (claimed.count === 0) throw assignmentStateConflict();
      if (accept) {
        await tx.bookingDriverAssignment.updateMany({
          where: { bookingId, outcome: DRIVER_ASSIGNMENT_OUTCOME.OPEN },
          data: { acceptedAt: now },
        });
      } else {
        await closeOpenAssignment(tx, bookingId, DRIVER_ASSIGNMENT_OUTCOME.DECLINED, userId);
        // Tin "từ chối — gán tài xế khác" dưới đây đã là lời nhắc khẩn của chuyến nếu giờ nhận đã
        // trong cửa sổ 2 giờ: không để worker báo thêm "chưa có tài xế" (ADR 0067 điều 2).
        await markDriverMissingAlertCovered(tx, bookingId, now);
      }

      await this.audit.record(
        {
          tenantId: booking.tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          action: accept ? 'booking.driver_accept' : 'booking.driver_decline',
          targetType: 'booking',
          targetId: bookingId,
        },
        tx,
      );
      await this.notifications.emitToTenantMembers(
        booking.tenantId,
        accept
          ? {
              type: NOTIFICATION_TYPE.DRIVER_TRIP_ACCEPTED,
              title: `${driverName} đã nhận chuyến ${booking.code}`,
              body: null,
              targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
              targetId: bookingId,
            }
          : {
              type: NOTIFICATION_TYPE.DRIVER_TRIP_DECLINED,
              ...driverTripDeclinedEmployerCopy({ driverName, bookingCode: booking.code }),
              targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
              targetId: bookingId,
              pushExpiresAt: driverReassignPushExpiresAt(now),
            },
        tx,
      );
    });
  }

  /**
   * Hook của `BookingsService`: đơn rời hẳn vòng vận hành (huỷ / khách không đến) → báo tài xế
   * đang mang chuyến. Cột tài xế GIỮ NGUYÊN làm lịch sử; đơn không còn chiếm lịch nên EXCLUDE
   * tự nhả người đó.
   */
  async onBookingClosedWithinTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
    to: string,
  ): Promise<void> {
    if (
      to !== BOOKING_STATUS.CANCELLED &&
      to !== BOOKING_STATUS.NO_SHOW &&
      to !== BOOKING_STATUS.COMPLETED
    ) {
      return;
    }
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, code: true, tenantId: true, driverUserId: true },
    });
    if (!booking?.driverUserId) return;
    // Sổ lịch sử: lượt đang mở khép lại theo kết cục của đơn.
    const outcome = CLOSED_OUTCOME_BY_BOOKING_STATUS[to];
    if (outcome) await closeOpenAssignment(tx, booking.id, outcome, null);
    if (to === BOOKING_STATUS.COMPLETED) {
      // Chuyến xong — báo tài xế để danh sách "Chuyến tôi lái" chuyển nó sang "Đã qua" ngay.
      await this.notifications.emitToUser(
        booking.driverUserId,
        {
          type: NOTIFICATION_TYPE.DRIVER_TRIP_COMPLETED,
          title: `Chuyến ${booking.code} đã hoàn thành`,
          body: 'Bên thuê đã xác nhận trả xe. Cảm ơn bạn đã lái chuyến này.',
          targetType: NOTIFICATION_TARGET_TYPE.DRIVER_TRIP,
          targetId: booking.id,
        },
        tx,
      );
      return;
    }
    await this.notifyUnassigned(
      tx,
      booking,
      to === BOOKING_STATUS.CANCELLED ? 'Chuyến đã bị huỷ.' : 'Khách không đến nhận xe.',
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Nội bộ
  // ───────────────────────────────────────────────────────────────────────────

  /** Chấm dứt một liên kết đang mở + gỡ khỏi mọi chuyến chưa nhận xe. Bên gọi tự báo tin. */
  private async endWithinTx(
    tx: Prisma.TransactionClient,
    link: { id: string; tenantId: string; userId: string; linkStatus: string },
    party: DriverLinkEndParty,
    actorUserId: string,
  ): Promise<void> {
    const running = await tx.booking.count({
      where: { driverId: link.id, status: BOOKING_STATUS.ACTIVE, deletedAt: null },
    });
    if (running > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.DRIVER_HAS_ACTIVE_TRIP,
        message: `Tài xế đang chạy ${running} chuyến — chờ bàn giao trả xe xong rồi mới kết thúc liên kết`,
        details: { count: running },
      });
    }
    const claimed = await tx.driver.updateMany({
      where: { id: link.id, linkStatus: { in: OPEN_LINK } },
      data: {
        linkStatus: DRIVER_LINK_STATUS.ENDED,
        endedAt: new Date(),
        endedByParty: party,
      },
    });
    if (claimed.count === 0) throw linkStateConflict();

    // Sổ lịch sử: các lượt sắp bị gỡ kết thúc là "đã gỡ" — trước khi cột tài xế trên đơn bị xoá.
    await tx.bookingDriverAssignment.updateMany({
      where: {
        driverId: link.id,
        outcome: DRIVER_ASSIGNMENT_OUTCOME.OPEN,
        booking: { status: { in: REASSIGNABLE }, deletedAt: null },
      },
      data: {
        outcome: DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
        endedAt: new Date(),
        endedBy: actorUserId,
      },
    });
    const released = await tx.booking.updateMany({
      where: { driverId: link.id, status: { in: REASSIGNABLE }, deletedAt: null },
      data: CLEARED_ASSIGNMENT,
    });

    await this.audit.record(
      {
        tenantId: link.tenantId,
        actorUserId,
        actorScope:
          party === DRIVER_LINK_END_PARTY.EMPLOYER
            ? AUDIT_ACTOR_SCOPE.TENANT
            : AUDIT_ACTOR_SCOPE.CUSTOMER,
        action: 'driver.end',
        targetType: 'driver',
        targetId: link.id,
        after: { endedByParty: party, releasedBookings: released.count },
      },
      tx,
    );
  }

  private async notifyUnassigned(
    tx: Prisma.TransactionClient,
    booking: { id: string; code: string; tenantId: string; driverUserId: string | null },
    reason: string,
  ): Promise<void> {
    if (!booking.driverUserId) return;
    await this.notifications.emitToUser(
      booking.driverUserId,
      {
        type: NOTIFICATION_TYPE.DRIVER_TRIP_UNASSIGNED,
        title: `Chuyến ${booking.code} không còn giao cho bạn`,
        body: reason,
        targetType: NOTIFICATION_TARGET_TYPE.DRIVER_TRIP,
        targetId: booking.id,
      },
      tx,
    );
  }

  /** Người (theo tài khoản) đang có chuyến chiếm lịch giao khung giờ — ở MỌI bên thuê. */
  private async busyUserIds(
    db: Db,
    userIds: string[],
    window: { pickupAt: Date; returnAt: Date; excludeBookingId?: string },
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await db.booking.findMany({
      where: {
        driverUserId: { in: userIds },
        deletedAt: null,
        status: { in: OCCUPYING },
        ...(window.excludeBookingId ? { id: { not: window.excludeBookingId } } : {}),
        // Giao nhau nửa hở [pickup, return) — cùng ngữ nghĩa với tstzrange của EXCLUDE.
        pickupAt: { lt: window.returnAt },
        returnAt: { gt: window.pickupAt },
      },
      select: { driverUserId: true },
    });
    return new Set(rows.map((r) => r.driverUserId).filter((v): v is string => v != null));
  }

  /**
   * Lịch sử gán tài xế của một đơn (khu quản lý) — mọi lượt, cũ nhất trước, kèm tên người gán /
   * người kết thúc. Đơn thuộc tenant khác ⇒ mảng rỗng (bên gọi đã kiểm đơn tồn tại).
   */
  async history(tenantId: string, bookingId: string): Promise<BookingDriverHistoryItemDto[]> {
    const rows = await this.prisma.bookingDriverAssignment.findMany({
      where: { tenantId, bookingId },
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        outcome: true,
        assignedAt: true,
        assignedBy: true,
        acceptedAt: true,
        endedAt: true,
        endedBy: true,
        driver: { select: { id: true, name: true, phone: true } },
      },
    });
    const actorIds = [
      ...new Set(rows.flatMap((r) => [r.assignedBy, r.endedBy]).filter((v): v is string => !!v)),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const nameOf = new Map(actors.map((a) => [a.id, a.displayName]));
    return rows.map((r) => ({
      id: r.id,
      driverId: r.driver.id,
      driverName: r.driver.name,
      driverPhone: toLocalVnPhone(r.driver.phone),
      outcome: r.outcome,
      assignedAt: r.assignedAt.toISOString(),
      assignedByName: r.assignedBy ? (nameOf.get(r.assignedBy) ?? null) : null,
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      endedByName: r.endedBy ? (nameOf.get(r.endedBy) ?? null) : null,
    }));
  }

  /**
   * Mức bằng lái của từng tài khoản — đọc `customer_driver_licences` (writer là
   * `DriverLicencesService`; ở đây chỉ ĐỌC). Bằng đã xác thực còn hạn > đang đọc ảnh > chưa có.
   */
  async licenceSummaries(userIds: string[]): Promise<Map<string, DriverLicenceSummaryDto>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.customerDriverLicence.findMany({
      where: {
        userId: { in: ids },
        status: {
          in: [DRIVER_LICENCE_STATUS.VERIFIED, DRIVER_LICENCE_STATUS.PROCESSING],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        status: true,
        licenceClasses: true,
        expiresOn: true,
        fullName: true,
        kind: true,
      },
    });
    // "Hôm nay" theo giờ Việt Nam — UTC sẽ coi bằng hết hạn hôm qua là còn hạn tới 07:00.
    const today = new Date(vnDateKey(new Date()) + 'T00:00:00.000Z');
    const out = new Map<string, DriverLicenceSummaryDto>();
    for (const r of rows) {
      const current = out.get(r.userId);
      if (current?.state === DRIVER_LICENCE_STATE.VERIFIED) continue;
      if (r.status === DRIVER_LICENCE_STATUS.VERIFIED) {
        if (r.expiresOn && r.expiresOn.getTime() < today.getTime()) continue;
        out.set(r.userId, {
          state: DRIVER_LICENCE_STATE.VERIFIED,
          classes: r.licenceClasses,
          expiresOn: fromDateOnly(r.expiresOn),
          fullName: r.fullName,
          kind: r.kind,
        });
      } else if (!current) {
        out.set(r.userId, {
          state: DRIVER_LICENCE_STATE.PENDING,
          classes: [],
          expiresOn: null,
          fullName: null,
          kind: null,
        });
      }
    }
    return out;
  }

  /** Tên bên thuê để ghép vào câu thông báo — tên gian hàng, hoặc tên chủ xe ở tuyến hoa hồng. */
  async employerName(db: Db, tenantId: string): Promise<string> {
    const t = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, owner: { select: { displayName: true } } },
    });
    return t?.name || t?.owner.displayName || 'Chủ xe';
  }

  private async openLinkOrThrow(db: Db, tenantId: string, id: string) {
    const link = await db.driver.findFirst({
      where: { id, tenantId, linkStatus: { in: OPEN_LINK } },
      select: { id: true, tenantId: true, userId: true, linkStatus: true },
    });
    if (!link) throw linkNotFound();
    return link;
  }

  private async throwLinkState(db: Db, tenantId: string, id: string): Promise<never> {
    const exists = await db.driver.findFirst({ where: { id, tenantId }, select: { id: true } });
    throw exists ? linkStateConflict() : linkNotFound();
  }

  private async oneDto(row: LinkRow): Promise<DriverDto> {
    const [counts, licences] = await Promise.all([
      this.activeBookingCounts([row.id]),
      this.licenceSummaries([row.userId]),
    ]);
    return toDto(row, counts.get(row.id) ?? 0, licences.get(row.userId));
  }

  /**
   * Dòng LỊCH SỬ (đã từ chối / đã kết thúc) của một người mà bên thuê đã mời lại: trạng thái của
   * liên kết đang mở hiện tại, để giao diện hiện "Đã mời lại" / "Đang liên kết" thay cho nút
   * "Mời lại" (unique partial bảo đảm mỗi người có tối đa MỘT liên kết mở ở một bên thuê).
   */
  private async openLinkStatusByUser(
    tenantId: string,
    userIds: string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.driver.findMany({
      where: { tenantId, userId: { in: [...new Set(userIds)] }, linkStatus: { in: OPEN_LINK } },
      select: { userId: true, linkStatus: true },
    });
    return new Map(rows.map((r) => [r.userId, r.linkStatus]));
  }

  /** Số đơn "sống" theo liên kết — một groupBy cho cả trang, không N+1. */
  private async activeBookingCounts(driverIds: string[]): Promise<Map<string, number>> {
    if (driverIds.length === 0) return new Map();
    const rows = await this.prisma.booking.groupBy({
      by: ['driverId'],
      where: { driverId: { in: driverIds }, deletedAt: null, status: { in: OCCUPYING } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.driverId as string, r._count._all]));
  }
}

/**
 * Cột lượt gán + hạn trả lời về NULL cùng lúc — bản dùng chung với worker (`@xeprime/prisma`), để
 * hai đường trả lượt (từ chối ở API, quá hạn ở worker) xoá đúng cùng một tập cột.
 */
export const CLEARED_ASSIGNMENT = CLEARED_DRIVER_ASSIGNMENT;

/** Kết cục của lượt gán khi đơn khép lại — khoá là trạng thái ĐÍCH của đơn. */
const CLOSED_OUTCOME_BY_BOOKING_STATUS: Readonly<Record<string, DriverAssignmentOutcome>> = {
  [BOOKING_STATUS.CANCELLED]: DRIVER_ASSIGNMENT_OUTCOME.CANCELLED,
  [BOOKING_STATUS.NO_SHOW]: DRIVER_ASSIGNMENT_OUTCOME.NO_SHOW,
  [BOOKING_STATUS.COMPLETED]: DRIVER_ASSIGNMENT_OUTCOME.COMPLETED,
};

/**
 * Sổ `booking_driver_assignments` (ADR 0063) — ở API chỉ `DriversService` gọi hai hàm này, luôn
 * trong transaction đang đổi cột tài xế của đơn, để sổ và đơn không bao giờ lệch nhau. Phép khép
 * lượt dùng chung với worker quét hạn trả lời (ADR 0066).
 */
function closeOpenAssignment(
  tx: Prisma.TransactionClient,
  bookingId: string,
  outcome: DriverAssignmentOutcome,
  endedBy: string | null,
): Promise<void> {
  return closeOpenDriverAssignment(tx, bookingId, outcome, endedBy);
}

/**
 * Mở một lượt gán mới. Lượt cũ của CÙNG người trên CÙNG đơn bị đánh dấu `superseded` — tab "Đã
 * qua" của tài xế chỉ đọc lượt hiện hành, nên đổi qua lại nhiều lần họ vẫn thấy đơn MỘT lần.
 */
async function openAssignment(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    bookingId: string;
    driverId: string;
    driverUserId: string;
    assignedBy: string | null;
  },
): Promise<void> {
  await tx.bookingDriverAssignment.updateMany({
    where: { bookingId: input.bookingId, driverUserId: input.driverUserId, superseded: false },
    data: { superseded: true },
  });
  await tx.bookingDriverAssignment.create({
    data: { id: newId(), ...input, outcome: DRIVER_ASSIGNMENT_OUTCOME.OPEN },
  });
}

/**
 * Vi phạm `bookings_driver_user_schedule_excl` (23P01) — hai lượt gán/đổi lịch đua nhau và kẻ
 * đến sau bị DB từ chối. Prisma bọc lỗi nên dò theo TÊN constraint trong thông điệp.
 */
export function isDriverScheduleConflict(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes('bookings_driver_user_schedule_excl');
}

export function driverBusy(name?: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.DRIVER_BUSY,
    message: name
      ? `${name} đã có chuyến khác trong khung giờ này — chọn tài xế khác`
      : 'Tài xế đã có chuyến khác trong khung giờ này',
  });
}

function linkNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy liên kết tài xế',
  });
}

function linkStateConflict(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.DRIVER_LINK_STATE_CONFLICT,
    message: 'Liên kết tài xế đã đổi trạng thái — tải lại rồi thử lại',
  });
}

function assignmentStateConflict(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.DRIVER_ASSIGNMENT_STATE_CONFLICT,
    message: 'Chuyến này không còn chờ bạn xác nhận',
  });
}

/** Nhận chuyến sau hạn trả lời (ADR 0066). `respondBy` null khi lượt đã được trả về từ trước. */
function assignmentExpired(respondBy: Date | null): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.DRIVER_ASSIGNMENT_EXPIRED,
    message: 'Đã quá hạn xác nhận chuyến này — chuyến được trả lại cho bên thuê',
    ...(respondBy ? { details: { respondBy: respondBy.toISOString() } } : {}),
  });
}

function tripNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy chuyến',
  });
}

function toDto(
  r: LinkRow,
  activeBookingCount: number,
  licence: DriverLicenceSummaryDto | undefined,
  currentOpenLinkStatus: string | null = null,
): DriverDto {
  return {
    id: r.id,
    name: r.name,
    phone: toLocalVnPhone(r.phone),
    driverType: r.driverType,
    note: r.note,
    linkStatus: r.linkStatus,
    invitedAt: r.invitedAt.toISOString(),
    respondedAt: r.respondedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    endedByParty: r.endedByParty,
    account: { displayName: r.user.displayName, avatarUrl: r.user.avatarUrl },
    licence: licence ?? {
      state: DRIVER_LICENCE_STATE.NONE,
      classes: [],
      expiresOn: null,
      fullName: null,
      kind: null,
    },
    activeBookingCount,
    currentOpenLinkStatus,
  };
}

/** Tìm theo tên · SĐT. Trong phiên hỗ trợ (ADR 0050 §11) SĐT chỉ khớp đủ số. */
function driverSearchOr(q: string): Prisma.DriverWhereInput[] {
  const pii = piiSearch(q);
  if (pii.substring) {
    const digits = q.replace(/\D/g, '');
    return [
      { name: { contains: q, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
    ];
  }
  return [
    { name: { contains: q, mode: 'insensitive' } },
    ...(pii.phones.length > 0 ? [{ phone: { in: pii.phones.map((p) => normalizePhone(p)) } }] : []),
  ];
}

/** "20/10 08:00" giờ Việt Nam — câu thông báo dựng ở server, không phụ thuộc máy người nhận. */
function formatVnDateTime(d: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Tài xế ngoài hệ thống ĐÃ CHE cho audit (ADR 0067) — PII của bên thứ ba: sổ audit đọc được bởi
 * nhân sự nền tảng, nên chỉ giữ đủ để đối chiếu ("Nguyễn Văn T." · `090****567`).
 */
function maskedExternalDriver(b: {
  externalDriverName: string | null;
  externalDriverPhone: string | null;
}): { name: string; phone: string | null } | null {
  if (!b.externalDriverName) return null;
  return { name: maskName(b.externalDriverName), phone: maskPhone(b.externalDriverPhone) };
}
