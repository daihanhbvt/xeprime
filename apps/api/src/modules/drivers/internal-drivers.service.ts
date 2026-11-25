import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BOOKING_STATUS_OCCUPYING,
} from '@xeprime/types';
import { maskName, maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AssignableInternalDriversDto,
  AssignableInternalDriversQueryDto,
  CreateInternalDriverDto,
  INTERNAL_DRIVER_DEFAULT_LIMIT,
  InternalDriverDto,
  InternalDriverListQueryDto,
  InternalDriverPageDto,
  UpdateInternalDriverDto,
} from './dto/internal-driver.dto';

type Db = PrismaService | Prisma.TransactionClient;

const OCCUPYING: string[] = [...BOOKING_STATUS_OCCUPYING];
/** Trần bộ chọn gán đơn — như bộ chọn tài xế liên kết; nhiều hơn thì gõ tìm. */
const ASSIGNABLE_MAX = 200;
const PAGE_MAX = 100;

const SELECT = {
  id: true,
  name: true,
  phone: true,
  note: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.TenantInternalDriverSelect;

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
      select: { id: true, name: true, phone: true },
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
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tenantInternalDriver.create({
          data: {
            id: newId(),
            tenantId,
            name: dto.name,
            phone: dto.phone,
            note: dto.note ?? null,
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
        const updated = await tx.tenantInternalDriver.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.note !== undefined ? { note: dto.note } : {}),
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
    archivedAt: r.archivedAt?.toISOString() ?? null,
    activeTripCount,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Audit không ghi PII trần của bên thứ ba. */
function masked(r: Row): Record<string, unknown> {
  return { name: maskName(r.name), phone: maskPhone(r.phone), hasNote: Boolean(r.note) };
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
