import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, BOOKING_STATUS, DRIVER_STATUS } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateDriverDto,
  DRIVER_DEFAULT_LIMIT,
  DRIVER_MAX_LIMIT,
  DriverDto,
  DriverListQueryDto,
  DriverPageDto,
  UpdateDriverDto,
} from './dto/driver.dto';

const SELECT = {
  id: true,
  name: true,
  phone: true,
  driverType: true,
  status: true,
  licenseNo: true,
  idNo: true,
  note: true,
  createdAt: true,
} satisfies Prisma.DriverSelect;

type DriverRow = Prisma.DriverGetPayload<{ select: typeof SELECT }>;

/** Đơn còn "sống" — tài xế đang bận với nó, tính vào activeBookingCount. */
const ACTIVE_BOOKING_STATUSES: string[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

/**
 * Hồ sơ tài xế của gian hàng (17/08 — nghiệp vụ xe có tài xế, mức tối thiểu: hồ sơ + gán vào
 * đơn). `tenant_id` luôn từ scope; xoá là SOFT-delete (tài xế nghỉ vẫn giữ lịch sử đơn đã
 * chạy — composite FK từ bookings chặn xoá cứng). Giấy tờ/lịch bận tài xế: đợt sau.
 */
@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: DriverListQueryDto): Promise<DriverPageDto> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DRIVER_DEFAULT_LIMIT, DRIVER_MAX_LIMIT);

    const where: Prisma.DriverWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.driverType ? { driverType: query.driverType } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { licenseNo: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: SELECT,
      }),
    ]);

    const counts = await this.activeBookingCounts(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toDto(r, counts.get(r.id) ?? 0)),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async create(tenantId: string, userId: string, dto: CreateDriverDto): Promise<DriverDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: {
          id: newId(),
          tenantId,
          name: dto.name.trim(),
          phone: dto.phone,
          ...(dto.driverType ? { driverType: dto.driverType } : {}),
          licenseNo: dto.licenseNo?.trim() || null,
          idNo: dto.idNo?.trim() || null,
          note: dto.note?.trim() || null,
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'driver.create',
          targetType: 'driver',
          targetId: created.id,
          after: { name: created.name, phone: created.phone },
        },
        tx,
      );
      return created;
    });
    return toDto(row, 0);
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    await this.assertExists(tenantId, id);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.driver.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.driverType !== undefined ? { driverType: dto.driverType } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.licenseNo !== undefined ? { licenseNo: dto.licenseNo?.trim() || null } : {}),
          ...(dto.idNo !== undefined ? { idNo: dto.idNo?.trim() || null } : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'driver.update',
          targetType: 'driver',
          targetId: id,
        },
        tx,
      );
      return updated;
    });
    const counts = await this.activeBookingCounts([id]);
    return toDto(row, counts.get(id) ?? 0);
  }

  /** Soft-delete. Còn đơn "sống" đang gán thì chặn — gỡ tài xế khỏi đơn trước. */
  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    await this.assertExists(tenantId, id);
    const activeCount = await this.prisma.booking.count({
      where: { driverId: id, deletedAt: null, status: { in: ACTIVE_BOOKING_STATUSES } },
    });
    if (activeCount > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: `Tài xế đang được gán vào ${activeCount} đơn chưa hoàn tất — gỡ khỏi đơn trước khi xoá`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.driver.update({
        where: { id },
        data: { deletedAt: new Date(), status: DRIVER_STATUS.INACTIVE },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'driver.delete',
          targetType: 'driver',
          targetId: id,
        },
        tx,
      );
    });
  }

  /**
   * Tài xế GÁN ĐƯỢC vào đơn: cùng tenant, chưa xoá, đang `active`. Trả về cho BookingsService
   * dùng khi gán — một nơi định nghĩa "gán được", không rải điều kiện.
   */
  async findAssignable(
    tenantId: string,
    driverId: string,
  ): Promise<{ id: string; name: string; phone: string }> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId, deletedAt: null, status: DRIVER_STATUS.ACTIVE },
      select: { id: true, name: true, phone: true },
    });
    if (!driver) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy tài xế đang hoạt động',
      });
    }
    return driver;
  }

  private async assertExists(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.driver.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy tài xế',
      });
    }
  }

  /** Số đơn "sống" theo tài xế — một groupBy cho cả trang, không N+1. */
  private async activeBookingCounts(driverIds: string[]): Promise<Map<string, number>> {
    if (driverIds.length === 0) return new Map();
    const rows = await this.prisma.booking.groupBy({
      by: ['driverId'],
      where: {
        driverId: { in: driverIds },
        deletedAt: null,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.driverId as string, r._count._all]));
  }
}

function toDto(r: DriverRow, activeBookingCount: number): DriverDto {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    driverType: r.driverType,
    status: r.status,
    licenseNo: r.licenseNo,
    idNo: r.idNo,
    note: r.note,
    activeBookingCount,
    createdAt: r.createdAt as unknown as string,
  };
}
