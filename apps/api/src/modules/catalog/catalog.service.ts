import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import { CATALOG_TYPE, CATALOG_TYPE_LABEL, type CatalogType } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CatalogAdminQueryDto,
  CatalogItemAdminDto,
  CatalogItemDto,
  CatalogQueryDto,
  CreateCatalogItemDto,
  ReorderCatalogDto,
  UpdateCatalogItemDto,
} from './dto/catalog.dto';

const SELECT = {
  id: true,
  type: true,
  key: true,
  label: true,
  description: true,
  iconUrl: true,
  sortOrder: true,
  active: true,
} as const;

/** Nhãn chiều danh mục dùng trong thông báo lỗi validate — "Hãng xe \"kiaa\" không có". */
const LABEL_OF = CATALOG_TYPE_LABEL;

/**
 * Danh mục lọc dùng chung — hãng xe / kiểu dáng / nhiên liệu / tiện ích.
 *
 * ĐƯỜNG GHI DUY NHẤT của `catalog_items`. Ba nơi đọc: bộ lọc marketplace (công khai), form
 * tạo/sửa xe (gian hàng) và màn quản trị (platform). Trước đây mỗi nơi đọc một hằng số riêng
 * trong `@xeprime/types` nên admin không sửa được và ba màn dễ lệch nhau.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Mục đang bật, đã sắp thứ tự — dùng cho bộ lọc công khai và form tạo xe. */
  async list(query: CatalogQueryDto): Promise<CatalogItemDto[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { active: true, ...(query.type ? { type: query.type } : {}) },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: SELECT,
    });
    return rows as CatalogItemDto[];
  }

  /** Bản quản trị: kèm mục đã tắt và số xe đang dùng (để chặn xoá nhầm). */
  async listForAdmin(query: CatalogAdminQueryDto): Promise<CatalogItemAdminDto[]> {
    const includeInactive = query.includeInactive !== false;
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: SELECT,
    });

    const usage = await this.usageCounts();
    return rows.map((row) => ({
      ...(row as CatalogItemDto),
      usageCount: usage.get(`${row.type}:${row.key}`) ?? 0,
    }));
  }

  async create(actorUserId: string, dto: CreateCatalogItemDto): Promise<CatalogItemDto> {
    const duplicate = await this.prisma.catalogItem.findUnique({
      where: { type_key: { type: dto.type, key: dto.key } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(`Mã "${dto.key}" đã tồn tại trong danh mục này`);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.catalogItem.create({
        data: {
          id: newId(),
          type: dto.type,
          key: dto.key,
          label: dto.label.trim(),
          description: dto.description?.trim() || null,
          iconUrl: dto.iconUrl?.trim() || null,
          sortOrder: dto.sortOrder ?? (await this.nextSortOrder(dto.type)),
          active: dto.active ?? true,
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.create',
          targetType: 'catalog_item',
          targetId: created.id,
          after: { type: dto.type, key: dto.key, label: created.label },
        },
        tx,
      );
      return created;
    });
    return row as CatalogItemDto;
  }

  async update(
    actorUserId: string,
    id: string,
    dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemDto> {
    const current = await this.load(id);

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.catalogItem.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...('description' in dto ? { description: dto.description?.trim() || null } : {}),
          ...('iconUrl' in dto ? { iconUrl: dto.iconUrl?.trim() || null } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.update',
          targetType: 'catalog_item',
          targetId: id,
          before: { label: current.label, active: current.active, iconUrl: current.iconUrl },
          after: { label: updated.label, active: updated.active, iconUrl: updated.iconUrl },
        },
        tx,
      );
      return updated;
    });
    return row as CatalogItemDto;
  }

  /**
   * Xoá hẳn — CHỈ khi chưa xe nào dùng. Mục đã có xe thì tắt (`active=false`): xoá sẽ để lại
   * `vehicles.brand = 'kia'` không tra được nhãn, tức mất dữ liệu hiển thị của xe người khác.
   */
  async remove(actorUserId: string, id: string): Promise<void> {
    const current = await this.load(id);
    const used = await this.usageOf(current.type as CatalogType, current.key);
    if (used > 0) {
      throw new ConflictException(
        `Đang có ${used} xe dùng mục này — hãy tắt thay vì xoá để xe cũ vẫn hiển thị đúng tên`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.catalogItem.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.delete',
          targetType: 'catalog_item',
          targetId: id,
          before: { type: current.type, key: current.key, label: current.label },
        },
        tx,
      );
    });
  }

  /** Ghi lại trọn thứ tự một chiều trong một transaction — không để nửa chừng lệch số. */
  async reorder(actorUserId: string, dto: ReorderCatalogDto): Promise<CatalogItemAdminDto[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { type: dto.type },
      select: { id: true },
    });
    const known = new Set(rows.map((r) => r.id));
    const unknown = dto.ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Id không thuộc danh mục "${dto.type}": ${unknown.join(', ')}`);
    }
    if (dto.ids.length !== rows.length) {
      throw new BadRequestException('Phải gửi đủ toàn bộ mục của danh mục theo thứ tự mới');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.ids.entries()) {
        await tx.catalogItem.update({ where: { id }, data: { sortOrder: index } });
      }
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.reorder',
          targetType: 'catalog_item',
          after: { type: dto.type, ids: dto.ids },
        },
        tx,
      );
    });

    return this.listForAdmin({ type: dto.type });
  }

  /**
   * Chặn xe lưu giá trị không có trong danh mục — lý do bộ lọc ngoài chợ không bao giờ mọc ra
   * ô "trống không tên" hay hai dòng "VinFast"/"vinfast" cho cùng một hãng.
   *
   * Kiểm tra key CÓ TỒN TẠI, không đòi `active`. Tắt một mục là để ẩn khỏi ô chọn, không phải
   * để khoá cứng mọi xe cũ đang dùng nó: chủ shop sửa lại mô tả xe không nên bị chặn vì admin
   * vừa ẩn một hãng. Ngược lại, chọn MỚI một mục đã tắt thì picker không đưa ra.
   */
  async assertVehicleValues(input: {
    brand?: string | null;
    bodyType?: string | null;
    fuelType?: string | null;
    features?: readonly string[];
  }): Promise<void> {
    const wanted: Array<{ type: CatalogType; keys: string[] }> = [
      { type: CATALOG_TYPE.VEHICLE_BRAND, keys: input.brand ? [input.brand] : [] },
      { type: CATALOG_TYPE.BODY_TYPE, keys: input.bodyType ? [input.bodyType] : [] },
      { type: CATALOG_TYPE.FUEL_TYPE, keys: input.fuelType ? [input.fuelType] : [] },
      { type: CATALOG_TYPE.VEHICLE_FEATURE, keys: [...new Set(input.features ?? [])] },
    ].filter((entry) => entry.keys.length > 0);

    if (wanted.length === 0) return;

    const rows = await this.prisma.catalogItem.findMany({
      where: { OR: wanted.map(({ type, keys }) => ({ type, key: { in: keys } })) },
      select: { type: true, key: true },
    });
    const known = new Set(rows.map((r) => `${r.type}:${r.key}`));

    const invalid = wanted.flatMap(({ type, keys }) =>
      keys.filter((key) => !known.has(`${type}:${key}`)).map((key) => `${LABEL_OF[type]} "${key}"`),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Giá trị không có trong danh mục: ${invalid.join(', ')}. Danh mục do quản trị nền tảng cấu hình.`,
      );
    }
  }

  private async load(id: string) {
    const row = await this.prisma.catalogItem.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException('Không tìm thấy mục danh mục');
    return row;
  }

  private async nextSortOrder(type: string): Promise<number> {
    const last = await this.prisma.catalogItem.findFirst({
      where: { type },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  private async usageOf(type: CatalogType, key: string): Promise<number> {
    switch (type) {
      case CATALOG_TYPE.VEHICLE_BRAND:
        return this.prisma.vehicle.count({ where: { brand: key, deletedAt: null } });
      case CATALOG_TYPE.BODY_TYPE:
        return this.prisma.vehicle.count({ where: { bodyType: key, deletedAt: null } });
      case CATALOG_TYPE.FUEL_TYPE:
        return this.prisma.vehicle.count({ where: { fuelType: key, deletedAt: null } });
      case CATALOG_TYPE.VEHICLE_FEATURE:
        return this.prisma.vehicleFeature.count({
          where: { featureKey: key, vehicle: { deletedAt: null } },
        });
    }
  }

  /**
   * Số xe dùng từng key, gom trong 4 lượt groupBy thay vì một count mỗi dòng — bảng danh mục
   * có ~45 dòng nên cách kia là 45 round-trip cho một lần mở màn hình.
   */
  private async usageCounts(): Promise<Map<string, number>> {
    const [brands, bodies, fuels, features] = await Promise.all([
      this.prisma.vehicle.groupBy({
        by: ['brand'],
        where: { deletedAt: null, brand: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['bodyType'],
        where: { deletedAt: null, bodyType: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['fuelType'],
        where: { deletedAt: null, fuelType: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.vehicleFeature.groupBy({
        by: ['featureKey'],
        where: { vehicle: { deletedAt: null } },
        _count: { _all: true },
      }),
    ]);

    const map = new Map<string, number>();
    for (const r of brands)
      if (r.brand) map.set(`${CATALOG_TYPE.VEHICLE_BRAND}:${r.brand}`, r._count._all);
    for (const r of bodies)
      if (r.bodyType) map.set(`${CATALOG_TYPE.BODY_TYPE}:${r.bodyType}`, r._count._all);
    for (const r of fuels)
      if (r.fuelType) map.set(`${CATALOG_TYPE.FUEL_TYPE}:${r.fuelType}`, r._count._all);
    for (const r of features)
      map.set(`${CATALOG_TYPE.VEHICLE_FEATURE}:${r.featureKey}`, r._count._all);
    return map;
  }
}
