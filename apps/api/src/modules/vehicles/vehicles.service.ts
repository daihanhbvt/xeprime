import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, type PaginationMeta } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VEHICLE_DEFAULT_LIMIT,
  VEHICLE_MAX_LIMIT,
  VehicleDetailDto,
  VehicleListItemDto,
  VehicleListQueryDto,
} from './dto/vehicle.dto';

/** Cột dùng cho một dòng bảng — không kéo `description` dài. */
const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  plateNumber: true,
  vehicleType: true,
  serviceType: true,
  brand: true,
  model: true,
  manufactureYear: true,
  seatCount: true,
  operationStatus: true,
  publicStatus: true,
  mainImageUrl: true,
  weekdayPrice: true,
  weekendPrice: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  color: true,
  fuelType: true,
  description: true,
  createdAt: true,
} satisfies Prisma.VehicleSelect;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: VehicleListQueryDto,
  ): Promise<{ data: VehicleListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(VEHICLE_MAX_LIMIT, Math.max(1, query.limit ?? VEHICLE_DEFAULT_LIMIT));

    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.operationStatus ? { operationStatus: query.operationStatus } : {}),
      ...(query.publicStatus ? { publicStatus: query.publicStatus } : {}),
      ...(query.q ? { OR: searchOr(query.q) } : {}),
    };

    // Đếm và lấy trang trong một transaction: total khớp data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy: orderByOf(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(tenantId: string, id: string): Promise<VehicleDetailDto> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();
    return toDetail(row);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateVehicleDto,
  ): Promise<VehicleDetailDto> {
    await this.assertCodeFree(tenantId, dto.code);

    const row = await this.prisma.vehicle.create({
      data: {
        id: newId(),
        tenantId,
        createdBy: userId,
        code: dto.code,
        name: dto.name,
        vehicleType: dto.vehicleType,
        ...writableFields(dto),
      },
      select: DETAIL_SELECT,
    });
    return toDetail(row);
  }

  async update(tenantId: string, id: string, dto: UpdateVehicleDto): Promise<VehicleDetailDto> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, code: true },
    });
    if (!current) throw notFound();

    // Đổi mã thì mã mới phải còn trống trong gian hàng (unique DB là chốt chặn cuối).
    if (dto.code !== undefined && dto.code !== current.code) {
      await this.assertCodeFree(tenantId, dto.code);
    }

    const row = await this.prisma.vehicle.update({
      where: { id: current.id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
        ...writableFields(dto),
      },
      select: DETAIL_SELECT,
    });
    return toDetail(row);
  }

  /**
   * Xoá mềm. Chặn nếu xe còn lịch hiện tại/tương lai — occupancies là nguồn sự thật của
   * "xe bận" (ADR 0006); xoá xe đang có đơn sẽ để lại lịch mồ côi.
   */
  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw notFound();

    const activeSchedule = await this.prisma.vehicleOccupancy.count({
      where: { vehicleId: id, tenantId, endAt: { gt: new Date() } },
    });
    if (activeSchedule > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Xe đang có lịch hiện tại hoặc sắp tới, không thể xoá. Hãy huỷ/kết thúc lịch trước.',
      });
    }

    await this.prisma.vehicle.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });
    return { id: current.id };
  }

  private async assertCodeFree(tenantId: string, code: string): Promise<void> {
    const clash = await this.prisma.vehicle.findFirst({
      where: { tenantId, code, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: `Mã xe "${code}" đã tồn tại trong gian hàng`,
      });
    }
  }
}

function searchOr(q: string): Prisma.VehicleWhereInput[] {
  const contains = { contains: q, mode: 'insensitive' } as const;
  return [
    { name: contains },
    { code: contains },
    { plateNumber: contains },
    { brand: contains },
    { model: contains },
  ];
}

function orderByOf(sort: VehicleListQueryDto['sort']): Prisma.VehicleOrderByWithRelationInput {
  switch (sort) {
    case 'name_asc':
      return { name: 'asc' };
    case 'code_asc':
      return { code: 'asc' };
    case 'price_asc':
      return { weekdayPrice: 'asc' };
    case 'price_desc':
      return { weekdayPrice: 'desc' };
    default:
      return { createdAt: 'desc' };
  }
}

/** Các trường scalar tuỳ chọn — kiểu thuần nên assign được cho cả `create` lẫn `update`. */
interface VehicleWritableFields {
  serviceType?: string;
  plateNumber?: string;
  brand?: string;
  model?: string;
  manufactureYear?: number;
  color?: string;
  seatCount?: number;
  fuelType?: string;
  operationStatus?: string;
  description?: string;
  mainImageUrl?: string;
  weekdayPrice?: string;
  weekendPrice?: string;
}

/**
 * Các trường tuỳ chọn cho phép ghi khi create/update — gom một chỗ để hai đường không lệch nhau.
 * KHÔNG gồm `code`/`name`/`vehicleType` (create bắt buộc) và tuyệt đối không `publicStatus`/`tenantId`.
 */
function writableFields(dto: CreateVehicleDto | UpdateVehicleDto): VehicleWritableFields {
  return {
    ...(dto.serviceType !== undefined ? { serviceType: dto.serviceType } : {}),
    ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
    ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
    ...(dto.model !== undefined ? { model: dto.model } : {}),
    ...(dto.manufactureYear !== undefined ? { manufactureYear: dto.manufactureYear } : {}),
    ...(dto.color !== undefined ? { color: dto.color } : {}),
    ...(dto.seatCount !== undefined ? { seatCount: dto.seatCount } : {}),
    ...(dto.fuelType !== undefined ? { fuelType: dto.fuelType } : {}),
    ...(dto.operationStatus !== undefined ? { operationStatus: dto.operationStatus } : {}),
    ...(dto.description !== undefined ? { description: dto.description } : {}),
    ...(dto.mainImageUrl !== undefined ? { mainImageUrl: dto.mainImageUrl } : {}),
    ...(dto.weekdayPrice !== undefined ? { weekdayPrice: dto.weekdayPrice } : {}),
    ...(dto.weekendPrice !== undefined ? { weekendPrice: dto.weekendPrice } : {}),
  };
}

/** Decimal → string do ResponseInterceptor lo (ADR 0007); ở đây giữ nguyên kiểu. */
type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof DETAIL_SELECT }>;

function toListItem(v: Prisma.VehicleGetPayload<{ select: typeof LIST_SELECT }>): VehicleListItemDto {
  return {
    id: v.id,
    code: v.code,
    name: v.name,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    serviceType: v.serviceType,
    brand: v.brand,
    model: v.model,
    manufactureYear: v.manufactureYear,
    seatCount: v.seatCount,
    operationStatus: v.operationStatus,
    publicStatus: v.publicStatus,
    mainImageUrl: v.mainImageUrl,
    weekdayPrice: v.weekdayPrice as unknown as string | null,
    weekendPrice: v.weekendPrice as unknown as string | null,
    updatedAt: v.updatedAt as unknown as string,
  };
}

function toDetail(v: VehicleRow): VehicleDetailDto {
  return {
    ...toListItem(v),
    color: v.color,
    fuelType: v.fuelType,
    description: v.description,
    createdAt: v.createdAt as unknown as string,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy xe',
  });
}
