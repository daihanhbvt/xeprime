import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, OCCUPANCY_SOURCE_TYPE } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OccupancyService } from './occupancy.service';
import {
  CreateVehicleBlockDto,
  UpdateVehicleBlockDto,
  VehicleBlockDto,
} from './dto/vehicle-block.dto';

const BLOCK_SELECT = {
  id: true,
  vehicleId: true,
  startAt: true,
  endAt: true,
  reason: true,
  note: true,
  rowVersion: true,
  createdAt: true,
  updatedAt: true,
  vehicle: { select: { name: true, plateNumber: true } },
  creator: { select: { displayName: true } },
} satisfies Prisma.VehicleBlockSelect;

type BlockRow = Prisma.VehicleBlockGetPayload<{ select: typeof BLOCK_SELECT }>;

/**
 * Khoá xe thủ công — writer DUY NHẤT của `vehicle_blocks`.
 *
 * Block và chỗ của nó trên `vehicle_occupancies` sống/chết trong CÙNG transaction, ghi lịch
 * qua `OccupancyService` (ADR 0006). KHÔNG SELECT check trùng trước khi ghi — exclusion
 * constraint ném `23P01`, `AllExceptionsFilter` dịch thành BOOKING_SCHEDULE_CONFLICT / 409.
 * Preview trùng lịch (nếu FE muốn cảnh báo sớm) đi qua `POST /calendar/check-conflict`.
 */
@Injectable()
export class VehicleBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    private readonly audit: AuditService,
  ) {}

  async getOne(tenantId: string, id: string): Promise<VehicleBlockDto> {
    const row = await this.prisma.vehicleBlock.findFirst({
      where: { id, tenantId },
      select: BLOCK_SELECT,
    });
    if (!row) throw notFound();
    return toDto(row);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateVehicleBlockDto,
  ): Promise<VehicleBlockDto> {
    assertRange(dto.startAt, dto.endAt);

    // Xe phải thuộc gian hàng và chưa xoá — id đoán được của shop khác ra 404, không lộ gì.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy xe',
      });
    }

    const id = newId();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicleBlock.create({
        data: {
          id,
          tenantId,
          vehicleId: dto.vehicleId,
          startAt: dto.startAt,
          endAt: dto.endAt,
          reason: dto.reason,
          note: dto.note?.trim() || null,
          createdBy: userId,
        },
        select: BLOCK_SELECT,
      });

      // Trùng đơn thuê / bảo dưỡng / block khác → constraint từ chối, rollback cả block.
      await this.occupancy.reserve(tx, {
        tenantId,
        vehicleId: dto.vehicleId,
        sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
        sourceId: id,
        startAt: dto.startAt,
        endAt: dto.endAt,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.block.create',
          targetType: 'vehicle_block',
          targetId: id,
          after: {
            vehicleId: dto.vehicleId,
            startAt: dto.startAt.toISOString(),
            endAt: dto.endAt.toISOString(),
            reason: dto.reason,
          },
        },
        tx,
      );

      return created;
    });

    return toDto(row);
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateVehicleBlockDto,
  ): Promise<VehicleBlockDto> {
    assertRange(dto.startAt, dto.endAt);

    const current = await this.prisma.vehicleBlock.findFirst({
      where: { id, tenantId },
      select: { id: true, vehicleId: true, startAt: true, endAt: true, reason: true, note: true },
    });
    if (!current) throw notFound();

    const row = await this.prisma.$transaction(async (tx) => {
      // Điều kiện rowVersion trong WHERE: người khác vừa sửa thì 0 dòng khớp → 409, không ghi đè.
      const claimed = await tx.vehicleBlock.updateMany({
        where: { id, tenantId, rowVersion: dto.expectedRowVersion },
        data: {
          startAt: dto.startAt,
          endAt: dto.endAt,
          reason: dto.reason,
          note: dto.note?.trim() || null,
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Lịch khoá vừa được người khác cập nhật — tải lại rồi thử lại',
        });
      }

      const timeChanged =
        current.startAt.getTime() !== dto.startAt.getTime() ||
        current.endAt.getTime() !== dto.endAt.getTime();
      if (timeChanged) {
        await this.occupancy.reschedule(
          tx,
          OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
          id,
          dto.startAt,
          dto.endAt,
        );
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.block.update',
          targetType: 'vehicle_block',
          targetId: id,
          before: {
            startAt: current.startAt.toISOString(),
            endAt: current.endAt.toISOString(),
            reason: current.reason,
          },
          after: {
            startAt: dto.startAt.toISOString(),
            endAt: dto.endAt.toISOString(),
            reason: dto.reason,
          },
        },
        tx,
      );

      return tx.vehicleBlock.findFirstOrThrow({ where: { id, tenantId }, select: BLOCK_SELECT });
    });

    return toDto(row);
  }

  /** Gỡ khoá: xoá block + NHẢ chỗ trên lịch trong cùng transaction. */
  async remove(tenantId: string, id: string, userId: string): Promise<void> {
    const current = await this.prisma.vehicleBlock.findFirst({
      where: { id, tenantId },
      select: { id: true, vehicleId: true, startAt: true, endAt: true, reason: true },
    });
    if (!current) throw notFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleBlock.delete({ where: { id: current.id } });
      await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE, id);
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.block.delete',
          targetType: 'vehicle_block',
          targetId: id,
          before: {
            vehicleId: current.vehicleId,
            startAt: current.startAt.toISOString(),
            endAt: current.endAt.toISOString(),
            reason: current.reason,
          },
        },
        tx,
      );
    });
  }
}

function toDto(row: BlockRow): VehicleBlockDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicle.name,
    vehiclePlate: row.vehicle.plateNumber,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    reason: row.reason,
    note: row.note,
    rowVersion: row.rowVersion,
    createdByName: row.creator?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertRange(startAt: Date, endAt: Date): void {
  if (!(endAt.getTime() > startAt.getTime())) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Thời điểm kết thúc khoá phải sau thời điểm bắt đầu',
    });
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy lịch khoá xe',
  });
}
