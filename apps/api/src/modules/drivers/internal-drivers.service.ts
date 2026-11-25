import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BOOKING_STATUS_OCCUPYING,
  DRIVER_OPERATION_FILTER,
  toLocalVnPhone,
} from '@xeprime/types';
import { maskName, maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isTenantInternalDriverPhotoUrl } from '../storage/object-keys';
import { bookingTripSearchOr, vnMonthRange } from './driver-trip-query';
import type { DriverCurrentTripDto, InternalDriverOverviewDto } from './dto/driver.dto';
import {
  AssignableInternalDriversDto,
  AssignableInternalDriversQueryDto,
  CreateInternalDriverDto,
  INTERNAL_DRIVER_DEFAULT_LIMIT,
  InternalDriverDto,
  InternalDriverListQueryDto,
  InternalDriverPageDto,
  InternalDriverTripListQueryDto,
  InternalDriverTripPageDto,
  UpdateInternalDriverDto,
} from './dto/internal-driver.dto';

type Db = PrismaService | Prisma.TransactionClient;

const OCCUPYING: string[] = [...BOOKING_STATUS_OCCUPYING];
/** Trần bộ chọn gán đơn — như bộ chọn tài xế liên kết; nhiều hơn thì gõ tìm. */
const ASSIGNABLE_MAX = 200;
const PAGE_MAX = 100;
/** Số đơn đang gán liệt kê ở trang chi tiết — cùng trần với tài xế liên kết. */
const CURRENT_TRIPS_SHOWN = 20;

const SELECT = {
  id: true,
  name: true,
  phone: true,
  note: true,
  photoUrl: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.TenantInternalDriverSelect;

/** Bộ lọc dùng chung với danh sách GỘP của màn Tài xế (`DriversService.roster`). */
export interface InternalRosterFilter {
  q?: string;
  operation?: string;
}

const TRIP_SELECT = {
  id: true,
  code: true,
  status: true,
  pickupAt: true,
  returnAt: true,
  customerName: true,
  customerPhone: true,
  vehicle: { select: { name: true, plateNumber: true, mainImageUrl: true } },
} satisfies Prisma.BookingSelect;

type Row = Prisma.TenantInternalDriverGetPayload<{ select: typeof SELECT }>;

const AUDIT_ACTION = {
  CREATE: 'internal_driver.create',
  UPDATE: 'internal_driver.update',
  ARCHIVE: 'internal_driver.archive',
  RESTORE: 'internal_driver.restore',
} as const;

/**
 * Danh bạ tài xế NỘI BỘ của bên thuê (ADR 0108) — writer duy nhất của `tenant_internal_drivers`.
 *
 * Gán người trong danh bạ vào ĐƠN vẫn đi qua `DriversService` (writer duy nhất của mọi cột tài xế trên
 * `bookings`); service này chỉ cấp cho nó phép đọc "người gán được" và phép kiểm bận.
 */
@Injectable()
export class InternalDriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string, query: InternalDriverListQueryDto): Promise<InternalDriverPageDto> {
    const paging = resolvePaging(query, INTERNAL_DRIVER_DEFAULT_LIMIT, PAGE_MAX);
    const where: Prisma.TenantInternalDriverWhereInput = {
      tenantId,
      archivedAt: query.archived ? { not: null } : null,
      ...(query.q?.trim() ? { OR: searchOr(query.q.trim()) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.tenantInternalDriver.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
      this.prisma.tenantInternalDriver.count({ where }),
    ]);
    const active = await this.activeTripCounts(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toDto(r, active.get(r.id) ?? 0)),
      meta: paginationMeta(paging, total),
    };
  }

  /** Bộ chọn gán đơn: người ĐANG DÙNG, kèm cờ bận theo khung giờ của đơn (bỏ qua chính đơn đó). */
  async assignable(
    tenantId: string,
    query: AssignableInternalDriversQueryDto,
  ): Promise<AssignableInternalDriversDto> {
    const rows = await this.prisma.tenantInternalDriver.findMany({
      where: {
        tenantId,
        archivedAt: null,
        ...(query.q?.trim() ? { OR: searchOr(query.q.trim()) } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: ASSIGNABLE_MAX,
      select: { id: true, name: true, phone: true, photoUrl: true },
    });
    const busy = await this.busyIds(
      this.prisma,
      tenantId,
      rows.map((r) => r.id),
      {
        pickupAt: new Date(query.pickupAt),
        returnAt: new Date(query.returnAt),
        excludeBookingId: query.excludeBookingId,
      },
    );
    return { data: rows.map((r) => ({ ...r, busy: busy.has(r.id) })) };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateInternalDriverDto,
  ): Promise<InternalDriverDto> {
    this.assertPhoto(tenantId, dto.photoUrl ?? null, null);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tenantInternalDriver.create({
          data: {
            id: newId(),
            tenantId,
            name: dto.name,
            phone: dto.phone,
            note: dto.note ?? null,
            photoUrl: dto.photoUrl ?? null,
            createdBy: userId,
          },
          select: SELECT,
        });
        await this.record(
          tx,
          tenantId,
          userId,
          AUDIT_ACTION.CREATE,
          created.id,
          null,
          masked(created),
        );
        return created;
      });
      return toDto(row, 0);
    } catch (err) {
      throw mapPhoneTaken(err);
    }
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateInternalDriverDto,
  ): Promise<InternalDriverDto> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await this.findOwned(tx, tenantId, id);
        if (current.archivedAt) throw archived();
        if (dto.photoUrl !== undefined) this.assertPhoto(tenantId, dto.photoUrl, current.photoUrl);
        const updated = await tx.tenantInternalDriver.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.note !== undefined ? { note: dto.note } : {}),
            ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
          },
          select: SELECT,
        });
        await this.record(
          tx,
          tenantId,
          userId,
          AUDIT_ACTION.UPDATE,
          id,
          masked(current),
          masked(updated),
        );
        return updated;
      });
      const active = await this.activeTripCounts([row.id]);
      return toDto(row, active.get(row.id) ?? 0);
    } catch (err) {
      throw mapPhoneTaken(err);
    }
  }

  /**
   * Lưu trữ — thay cho xoá (dòng đã gán vào đơn bị FK giữ lại). Đơn đã gán giữ nguyên người này;
   * bộ chọn không còn hiện. Gọi lại khi đã lưu trữ là no-op.
   */
  async archive(tenantId: string, userId: string, id: string): Promise<InternalDriverDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOwned(tx, tenantId, id);
      if (current.archivedAt) return current;
      const updated = await tx.tenantInternalDriver.update({
        where: { id },
        data: { archivedAt: new Date() },
        select: SELECT,
      });
      await this.record(tx, tenantId, userId, AUDIT_ACTION.ARCHIVE, id, null, null);
      return updated;
    });
    const active = await this.activeTripCounts([row.id]);
    return toDto(row, active.get(row.id) ?? 0);
  }

  /** Khôi phục — SĐT đã bị một dòng đang dùng khác chiếm ⇒ 409 `INTERNAL_DRIVER_PHONE_TAKEN`. */
  async restore(tenantId: string, userId: string, id: string): Promise<InternalDriverDto> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await this.findOwned(tx, tenantId, id);
        if (!current.archivedAt) return current;
        const updated = await tx.tenantInternalDriver.update({
          where: { id },
          data: { archivedAt: null },
          select: SELECT,
        });
        await this.record(tx, tenantId, userId, AUDIT_ACTION.RESTORE, id, null, null);
        return updated;
      });
      const active = await this.activeTripCounts([row.id]);
      return toDto(row, active.get(row.id) ?? 0);
    } catch (err) {
      throw mapPhoneTaken(err);
    }
  }

  /**
   * Trang chi tiết MỘT tài xế nội bộ: hồ sơ + các đơn đang gán còn chiếm lịch (sớm nhất trước). Đọc
   * được cả người đã lưu trữ — đơn cũ vẫn trỏ về họ.
   */
  async detail(tenantId: string, id: string): Promise<InternalDriverOverviewDto> {
    const row = await this.findOwned(this.prisma, tenantId, id);
    const where: Prisma.BookingWhereInput = {
      tenantId,
      internalDriverId: id,
      deletedAt: null,
      status: { in: OCCUPYING },
    };
    const [total, current] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: [{ pickupAt: 'asc' }, { id: 'asc' }],
        take: CURRENT_TRIPS_SHOWN,
        select: TRIP_SELECT,
      }),
    ]);
    return {
      driver: toDto(row, total),
      current: current.map(
        (b): DriverCurrentTripDto => ({
          ...tripFields(b),
          // Người nội bộ coi như đã nhận ngay, không có lượt chờ và không có tiền công (ADR 0108).
          assignmentStatus: null,
          wageAmount: null,
        }),
      ),
    };
  }

  /** Các đơn đã gán người này, TRẢ XE trong tháng (giờ VN) — phân trang, tìm và lọc ở server. */
  async trips(
    tenantId: string,
    id: string,
    query: InternalDriverTripListQueryDto,
  ): Promise<InternalDriverTripPageDto> {
    await this.findOwned(this.prisma, tenantId, id);
    const paging = resolvePaging(query, INTERNAL_DRIVER_DEFAULT_LIMIT, PAGE_MAX);
    const { from, to } = vnMonthRange(query.month);
    const search = query.q ? bookingTripSearchOr(query.q) : [];
    const where: Prisma.BookingWhereInput = {
      tenantId,
      internalDriverId: id,
      deletedAt: null,
      returnAt: { gte: from, lt: to },
      ...(query.status ? { status: query.status } : {}),
      ...(search.length > 0 ? { OR: search } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: [{ returnAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: TRIP_SELECT,
      }),
    ]);
    return { data: rows.map(tripFields), meta: paginationMeta(paging, total) };
  }

  /**
   * Ứng viên tài xế nội bộ của danh sách GỘP — chỉ các trường dùng để sắp xếp. `archived`: `false` =
   * đang dùng, `true` = đã lưu trữ, `null` = cả hai. Hydrate trang đã cắt bằng `dtosByIds`.
   */
  rosterCandidates(
    tenantId: string,
    filter: InternalRosterFilter,
    archived: boolean | null,
    take: number,
  ): Promise<{ id: string; name: string; createdAt: Date; archivedAt: Date | null }[]> {
    return this.prisma.tenantInternalDriver.findMany({
      where: {
        ...rosterWhere(tenantId, filter),
        ...(archived === null ? {} : { archivedAt: archived ? { not: null } : null }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: { id: true, name: true, createdAt: true, archivedAt: true },
    });
  }

  /** Số đếm của dải đầu màn Tài xế — đang dùng / đã lưu trữ, áp cùng bộ lọc chung. */
  async rosterCounts(
    tenantId: string,
    filter: InternalRosterFilter,
  ): Promise<{ active: number; archived: number }> {
    const where = rosterWhere(tenantId, filter);
    const [active, archivedCount] = await Promise.all([
      this.prisma.tenantInternalDriver.count({ where: { ...where, archivedAt: null } }),
      this.prisma.tenantInternalDriver.count({ where: { ...where, archivedAt: { not: null } } }),
    ]);
    return { active, archived: archivedCount };
  }

  /** `InternalDriverDto` đầy đủ cho một tập id của bên thuê — một phép đếm chuyến cho cả tập. */
  async dtosByIds(tenantId: string, ids: string[]): Promise<Map<string, InternalDriverDto>> {
    if (ids.length === 0) return new Map();
    const [rows, active] = await Promise.all([
      this.prisma.tenantInternalDriver.findMany({
        where: { tenantId, id: { in: ids } },
        select: SELECT,
      }),
      this.activeTripCounts(ids),
    ]);
    return new Map(rows.map((r) => [r.id, toDto(r, active.get(r.id) ?? 0)]));
  }

  /**
   * Người gán được vào đơn — gọi TRONG transaction gán của `DriversService`. Khoá dòng (`FOR SHARE`)
   * để một lượt lưu trữ song song không lọt giữa phép kiểm và lượt ghi đơn.
   */
  async lockAssignable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<{ id: string; name: string; phone: string }> {
    const rows = await tx.$queryRaw<
      { id: string; name: string; phone: string; archived_at: Date | null }[]
    >`SELECT id, name, phone, archived_at FROM tenant_internal_drivers
       WHERE id = ${id} AND tenant_id = ${tenantId} FOR SHARE`;
    const row = rows[0];
    if (!row) throw notFound();
    if (row.archived_at) throw archived();
    return { id: row.id, name: row.name, phone: row.phone };
  }

  /** Người đã có đơn chiếm lịch giao khung giờ — cùng ngữ nghĩa nửa hở với EXCLUDE ở DB. */
  async busyIds(
    db: Db,
    tenantId: string,
    ids: string[],
    window: { pickupAt: Date; returnAt: Date; excludeBookingId?: string },
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await db.booking.findMany({
      where: {
        tenantId,
        internalDriverId: { in: ids },
        deletedAt: null,
        status: { in: OCCUPYING },
        ...(window.excludeBookingId ? { id: { not: window.excludeBookingId } } : {}),
        pickupAt: { lt: window.returnAt },
        returnAt: { gt: window.pickupAt },
      },
      select: { internalDriverId: true },
    });
    return new Set(rows.map((r) => r.internalDriverId).filter((v): v is string => v != null));
  }

  private async activeTripCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.booking.groupBy({
      by: ['internalDriverId'],
      where: { internalDriverId: { in: ids }, deletedAt: null, status: { in: OCCUPYING } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.internalDriverId as string, g._count._all]));
  }

  /**
   * Ảnh chỉ nhận URL vừa presign dưới kho của CHÍNH bên thuê — không cho trỏ ảnh của bên khác hay
   * một host ngoài. Giữ nguyên ảnh đang có (cùng URL) thì không kiểm lại.
   */
  private assertPhoto(tenantId: string, url: string | null, current: string | null): void {
    if (url === null || url === current) return;
    const base = this.config.get<string>('R2_PUBLIC_BASE_URL');
    if (!isTenantInternalDriverPhotoUrl(url, base, tenantId)) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODE.INTERNAL_DRIVER_PHOTO_INVALID,
        message: 'Ảnh tài xế không hợp lệ - tải ảnh lên lại',
      });
    }
  }

  private async findOwned(tx: Db, tenantId: string, id: string): Promise<Row> {
    const row = await tx.tenantInternalDriver.findFirst({
      where: { id, tenantId },
      select: SELECT,
    });
    if (!row) throw notFound();
    return row;
  }

  private record(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    action: string,
    targetId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    return this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action,
        targetType: AUDIT_TARGET_TYPE.INTERNAL_DRIVER,
        targetId,
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
      },
      tx,
    );
  }
}

function toDto(r: Row, activeTripCount: number): InternalDriverDto {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    note: r.note,
    photoUrl: r.photoUrl,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    activeTripCount,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Audit không ghi PII trần của bên thứ ba. */
function masked(r: Row): Record<string, unknown> {
  return {
    name: maskName(r.name),
    phone: maskPhone(r.phone),
    hasNote: Boolean(r.note),
    hasPhoto: Boolean(r.photoUrl),
  };
}

function rosterWhere(
  tenantId: string,
  filter: InternalRosterFilter,
): Prisma.TenantInternalDriverWhereInput {
  const onTrip: Prisma.BookingWhereInput = { deletedAt: null, status: { in: OCCUPYING } };
  return {
    tenantId,
    ...(filter.q?.trim() ? { OR: searchOr(filter.q.trim()) } : {}),
    ...(filter.operation === DRIVER_OPERATION_FILTER.ON_TRIP ? { bookings: { some: onTrip } } : {}),
    ...(filter.operation === DRIVER_OPERATION_FILTER.IDLE ? { bookings: { none: onTrip } } : {}),
  };
}

type TripRow = Prisma.BookingGetPayload<{ select: typeof TRIP_SELECT }>;

/** Phần chung của một dòng chuyến (đơn) — bảng chuyến và "Chuyến sắp tới" của trang chi tiết. */
function tripFields(b: TripRow) {
  return {
    bookingId: b.id,
    bookingCode: b.code,
    bookingStatus: b.status,
    pickupAt: b.pickupAt.toISOString(),
    returnAt: b.returnAt.toISOString(),
    vehicleName: b.vehicle.name,
    vehiclePlate: b.vehicle.plateNumber,
    vehicleImageUrl: b.vehicle.mainImageUrl,
    customerName: b.customerName,
    customerPhone: b.customerPhone ? toLocalVnPhone(b.customerPhone) : null,
  };
}

function searchOr(q: string): Prisma.TenantInternalDriverWhereInput[] {
  const digits = q.replace(/\D/g, '');
  return [
    { name: { contains: q, mode: 'insensitive' } },
    ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
  ];
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.INTERNAL_DRIVER_NOT_FOUND,
    message: 'Không tìm thấy tài xế nội bộ',
  });
}

function archived(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.INTERNAL_DRIVER_ARCHIVED,
    message: 'Tài xế nội bộ đã lưu trữ - khôi phục trước khi dùng',
  });
}

/** Partial unique `(tenant_id, phone) WHERE archived_at IS NULL` ⇒ 409 rõ nghĩa. */
function mapPhoneTaken(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictException({
      code: API_ERROR_CODE.INTERNAL_DRIVER_PHONE_TAKEN,
      message: 'Số điện thoại này đã có trong danh bạ tài xế nội bộ',
    });
  }
  return err;
}
