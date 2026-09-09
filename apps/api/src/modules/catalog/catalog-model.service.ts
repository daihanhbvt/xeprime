import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import {
  CATALOG_MARKET_STATUS,
  VEHICLE_TYPE,
  catalogModelKey,
  isMotorbikeCategory,
  normalizeCatalogSearch,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CatalogModelAdminDto,
  CatalogModelAdminQueryDto,
  CatalogModelDto,
  CatalogModelQueryDto,
  CreateCatalogModelDto,
  UpdateCatalogModelDto,
} from './dto/catalog.dto';

const SELECT = {
  id: true,
  key: true,
  label: true,
  brandKey: true,
  vehicleType: true,
  marketStatus: true,
  motorbikeCategory: true,
  fuelTypes: true,
  transmissions: true,
  engineDisplacementCc: true,
  seatCount: true,
  yearFrom: true,
  yearTo: true,
  active: true,
} as const;

const ADMIN_SELECT = { ...SELECT, sourceUrl: true, verifiedAt: true } as const;

/**
 * Trần số mẫu trả về một lượt. Một hãng đông mẫu nhất hiện có ~36 dòng, nên 200 là thoải mái cho
 * cả trường hợp "mọi hãng của một loại xe"; ô tìm kiếm thu hẹp phần còn lại.
 */
const MAX_MODELS = 200;

/**
 * MẪU XE của danh mục — đường ghi DUY NHẤT của `vehicle_catalog_models`.
 *
 * Vì sao tách khỏi `CatalogService`: bảng này có ràng buộc riêng (mẫu thuộc một hãng CÓ THẬT,
 * phân khúc chỉ dành cho xe máy, số chỗ chỉ dành cho ô tô) và một vai trò mà bốn chiều kia không
 * có — nó là nguồn CHUẨN HOÁ cặp (hãng, mẫu) khi lưu xe. Nhét vào một service đã 300 dòng thì
 * hai trách nhiệm đó dính vào nhau.
 */
@Injectable()
export class CatalogModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Mẫu đang bật của một loại xe (và một hãng nếu có).
   *
   * Sắp xếp: `current` trước `legacy`, rồi thứ tự admin đặt, rồi theo tên. Nhóm hiển thị ở form
   * đọc thẳng `marketStatus`, nên thứ tự này quyết định luôn thứ tự trong nhóm.
   *
   * `includeId` là mẫu đang gắn với chiếc xe đang mở: nó luôn có mặt kể cả khi đã tắt. Không có
   * nó thì mở form sửa một chiếc xe gắn mẫu vừa bị admin ẩn sẽ thấy ô "Mẫu xe" trống — và lần
   * lưu tiếp theo sẽ âm thầm xoá liên kết.
   */
  async list(query: CatalogModelQueryDto): Promise<CatalogModelDto[]> {
    const rows = await this.query(query, { activeOnly: true });
    // Bỏ `sourceUrl`/`verifiedAt`: chúng là dấu vết quản trị, không thuộc hợp đồng công khai —
    // và một trường không khai trong DTO là một trường không ai biết đang đi ra ngoài.
    return rows.map(({ sourceUrl: _s, verifiedAt: _v, ...rest }) => rest);
  }

  /** Bản quản trị: kèm mẫu đã tắt, nguồn tra cứu và số xe đang gắn. */
  async listForAdmin(query: CatalogModelAdminQueryDto): Promise<CatalogModelAdminDto[]> {
    const rows = await this.query(query, { activeOnly: query.includeInactive === false });

    const usage = await this.usageCounts(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...row,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      usageCount: usage.get(row.id) ?? 0,
    }));
  }

  async create(actorUserId: string, dto: CreateCatalogModelDto): Promise<CatalogModelDto> {
    await this.assertBrandExists(dto.brandKey, dto.vehicleType);
    this.assertShape(dto.vehicleType, dto.motorbikeCategory ?? null, dto.seatCount ?? null);

    const key = catalogModelKey(dto.brandKey, dto.label);
    const duplicate = await this.prisma.vehicleCatalogModel.findFirst({
      where: {
        OR: [{ key }, { brandKey: dto.brandKey, vehicleType: dto.vehicleType, label: dto.label.trim() }],
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(`Mẫu xe "${dto.label}" của hãng này đã có trong danh mục`);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicleCatalogModel.create({
        data: {
          id: newId(),
          key,
          label: dto.label.trim(),
          brandKey: dto.brandKey,
          vehicleType: dto.vehicleType,
          marketStatus: dto.marketStatus ?? CATALOG_MARKET_STATUS.CURRENT,
          motorbikeCategory: dto.motorbikeCategory ?? null,
          fuelTypes: dto.fuelTypes ?? [],
          transmissions: dto.transmissions ?? [],
          engineDisplacementCc: dto.engineDisplacementCc ?? null,
          seatCount: dto.seatCount ?? null,
          yearFrom: dto.yearFrom ?? null,
          yearTo: dto.yearTo ?? null,
          sourceUrl: dto.sourceUrl?.trim() || null,
          // Người thêm tay là người đang nhìn nguồn — ngày xác minh là hôm nay, không phải một
          // ô để trống rồi không ai biết dữ liệu cũ tới đâu.
          verifiedAt: dto.sourceUrl?.trim() ? new Date() : null,
          sortOrder: await this.nextSortOrder(dto.brandKey, dto.vehicleType),
          active: dto.active ?? true,
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.model.create',
          targetType: 'vehicle_catalog_model',
          targetId: created.id,
          after: { key, label: created.label, brandKey: dto.brandKey, vehicleType: dto.vehicleType },
        },
        tx,
      );
      return created;
    });
    return row as CatalogModelDto;
  }

  async update(
    actorUserId: string,
    id: string,
    dto: UpdateCatalogModelDto,
  ): Promise<CatalogModelDto> {
    const current = await this.load(id);
    this.assertShape(
      current.vehicleType,
      'motorbikeCategory' in dto ? (dto.motorbikeCategory ?? null) : current.motorbikeCategory,
      'seatCount' in dto ? (dto.seatCount ?? null) : current.seatCount,
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicleCatalogModel.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.marketStatus !== undefined ? { marketStatus: dto.marketStatus } : {}),
          ...('motorbikeCategory' in dto
            ? { motorbikeCategory: dto.motorbikeCategory ?? null }
            : {}),
          ...(dto.fuelTypes !== undefined ? { fuelTypes: dto.fuelTypes } : {}),
          ...(dto.transmissions !== undefined ? { transmissions: dto.transmissions } : {}),
          ...('engineDisplacementCc' in dto
            ? { engineDisplacementCc: dto.engineDisplacementCc ?? null }
            : {}),
          ...('seatCount' in dto ? { seatCount: dto.seatCount ?? null } : {}),
          ...('yearFrom' in dto ? { yearFrom: dto.yearFrom ?? null } : {}),
          ...('yearTo' in dto ? { yearTo: dto.yearTo ?? null } : {}),
          ...('sourceUrl' in dto
            ? { sourceUrl: dto.sourceUrl?.trim() || null, verifiedAt: dto.sourceUrl?.trim() ? new Date() : null }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.model.update',
          targetType: 'vehicle_catalog_model',
          targetId: id,
          before: { label: current.label, active: current.active, marketStatus: current.marketStatus },
          after: { label: updated.label, active: updated.active, marketStatus: updated.marketStatus },
        },
        tx,
      );
      return updated;
    });
    return row as CatalogModelDto;
  }

  /**
   * Xoá hẳn — chỉ khi chưa xe nào gắn. Đã có xe thì TẮT: xoá sẽ gỡ liên kết của xe người khác
   * (FK `ON DELETE SET NULL`), và họ không hề biết mẫu xe của mình vừa biến mất khỏi danh mục.
   */
  async remove(actorUserId: string, id: string): Promise<void> {
    const current = await this.load(id);
    const used = await this.prisma.vehicle.count({
      where: { vehicleCatalogModelId: id, deletedAt: null },
    });
    if (used > 0) {
      throw new ConflictException(
        `Đang có ${used} xe gắn mẫu này — hãy tắt thay vì xoá để xe cũ vẫn giữ liên kết`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleCatalogModel.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'catalog.model.delete',
          targetType: 'vehicle_catalog_model',
          targetId: id,
          before: { key: current.key, label: current.label, brandKey: current.brandKey },
        },
        tx,
      );
    });
  }

  /**
   * CHUẨN HOÁ cặp (hãng, mẫu) khi lưu xe — điểm cốt lõi của cả tính năng này.
   *
   * Client gửi `vehicleCatalogModelId`, KHÔNG gửi cặp chữ. Backend đọc mẫu từ DB rồi tự chép
   * `brand`/`model` xuống. Nhờ vậy không tồn tại đường nào tạo ra một chiếc `motorbike` mang
   * `brand='toyota'`, `model='Vios'`: cặp đó không phải thứ client nói ra được nữa.
   *
   * Trả `null` khi không gắn mẫu — xe khai tay vẫn hợp lệ (mẫu chưa có trong danh mục, xe nhập
   * lẻ, dữ liệu cũ).
   */
  async resolveForVehicle(
    modelId: string | null | undefined,
    vehicleType: string,
  ): Promise<{
    id: string;
    brand: string;
    model: string;
    motorbikeCategory: string | null;
  } | null> {
    if (!modelId) return null;

    const model = await this.prisma.vehicleCatalogModel.findUnique({
      where: { id: modelId },
      select: { id: true, label: true, brandKey: true, vehicleType: true, motorbikeCategory: true },
    });
    if (!model) {
      throw new BadRequestException('Mẫu xe không có trong danh mục');
    }
    if (model.vehicleType !== vehicleType) {
      throw new BadRequestException(
        `Mẫu xe "${model.label}" thuộc loại phương tiện khác — chọn lại mẫu cho loại xe đang khai`,
      );
    }

    return {
      id: model.id,
      brand: model.brandKey,
      model: model.label,
      motorbikeCategory: model.motorbikeCategory,
    };
  }

  // ── nội bộ ───────────────────────────────────────────────────────────────

  /**
   * Luôn đọc bộ cột đầy đủ rồi để nơi gọi cắt bớt.
   *
   * Hai bộ `select` khác nhau ở đây chỉ tiết kiệm hai cột trên vài trăm dòng, nhưng bắt hàm này
   * mang generic để chiều cả hai — và generic đó là thứ khiến kiểu trả về không còn đọc được.
   */
  private async query(query: CatalogModelQueryDto, opts: { activeOnly: boolean }) {
    const search = query.search ? normalizeCatalogSearch(query.search) : '';
    const rows = await this.prisma.vehicleCatalogModel.findMany({
      where: {
        vehicleType: query.vehicleType,
        ...(query.brandKey ? { brandKey: query.brandKey } : {}),
        ...(opts.activeOnly ? { active: true } : {}),
      },
      orderBy: [{ marketStatus: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      take: MAX_MODELS,
      select: ADMIN_SELECT,
    });

    // Lọc bỏ dấu làm ở tầng app: Postgres không có `unaccent` trong bộ mặc định, và thêm một
    // extension chỉ để phục vụ một ô tìm kiếm trên vài trăm dòng là đổi hạ tầng lấy tiện tay.
    // `normalizeCatalogSearch` dùng chung với web nên hai bên khớp từng ký tự.
    const filtered = search
      ? rows.filter((r) => normalizeCatalogSearch(r.label).includes(search))
      : rows;

    if (!query.includeId || filtered.some((r) => r.id === query.includeId)) return filtered;

    const attached = await this.prisma.vehicleCatalogModel.findUnique({
      where: { id: query.includeId },
      select: ADMIN_SELECT,
    });
    // Mẫu đang gắn nhưng thuộc loại xe khác thì KHÔNG chèn vào: nó không phải lựa chọn hợp lệ
    // cho form hiện tại, và hiện ra sẽ mời người dùng lưu lại đúng cái sai đang có.
    if (attached && attached.vehicleType !== query.vehicleType) return filtered;
    return attached ? [attached, ...filtered] : filtered;
  }

  private async load(id: string) {
    const row = await this.prisma.vehicleCatalogModel.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException('Không tìm thấy mẫu xe');
    return row;
  }

  /**
   * Hãng phải có trong danh mục VÀ phải bán loại xe đó. Bỏ vế thứ hai thì admin tạo được
   * "Toyota / xe máy", và danh sách hãng lọc theo loại xe lập tức nói dối.
   */
  private async assertBrandExists(brandKey: string, vehicleType: string): Promise<void> {
    const brand = await this.prisma.catalogItem.findUnique({
      where: { type_key: { type: 'vehicle_brand', key: brandKey } },
      select: { label: true, vehicleTypes: true },
    });
    if (!brand) {
      throw new BadRequestException(`Hãng xe "${brandKey}" không có trong danh mục`);
    }
    if (brand.vehicleTypes.length > 0 && !brand.vehicleTypes.includes(vehicleType)) {
      throw new BadRequestException(
        `Hãng ${brand.label} không được đánh dấu là có bán loại xe này — sửa chiều áp dụng của hãng trước`,
      );
    }
  }

  /** Cùng hai luật mà DB đang giữ bằng CHECK — báo lỗi có nghĩa thay vì để Postgres ném 500. */
  private assertShape(
    vehicleType: string,
    motorbikeCategory: string | null,
    seatCount: number | null,
  ): void {
    const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;
    if (motorbikeCategory && !isMotorbike) {
      throw new BadRequestException('Phân khúc xe máy chỉ áp dụng cho mẫu xe máy');
    }
    if (motorbikeCategory && !isMotorbikeCategory(motorbikeCategory)) {
      throw new BadRequestException(`Phân khúc xe máy không hợp lệ: ${motorbikeCategory}`);
    }
    if (seatCount != null && isMotorbike) {
      throw new BadRequestException('Số chỗ ngồi chỉ áp dụng cho mẫu ô tô');
    }
  }

  private async nextSortOrder(brandKey: string, vehicleType: string): Promise<number> {
    const last = await this.prisma.vehicleCatalogModel.findFirst({
      where: { brandKey, vehicleType },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  /** Một lượt groupBy thay vì một count mỗi dòng — màn quản trị mở ra là 200 dòng. */
  private async usageCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.vehicle.groupBy({
      by: ['vehicleCatalogModelId'],
      where: { vehicleCatalogModelId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.vehicleCatalogModelId) map.set(r.vehicleCatalogModelId, r._count._all);
    }
    return map;
  }
}
