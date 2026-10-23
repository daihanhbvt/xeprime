import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  CATALOG_MARKET_STATUS,
  VEHICLE_TYPE,
  catalogModelKey,
  catalogModelMissingSpecs,
  isMotorbikeCategory,
  normalizeCatalogSearch,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesForFuels,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  CatalogModelAdminDto,
  CatalogModelAdminQueryDto,
  CatalogModelBrandSummaryDto,
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
  seatCounts: true,
  yearFrom: true,
  yearTo: true,
  active: true,
} as const;

const ADMIN_SELECT = { ...SELECT, sourceUrl: true, verifiedAt: true } as const;

/** Mẫu chưa bị xoá mềm — mọi đường đọc đều đi qua điều kiện này. */
const NOT_DELETED = { deletedAt: null } as const;

/**
 * Trần số mẫu trả về một lượt. Một hãng đông mẫu nhất hiện có ~36 dòng, nên 200 là thoải mái cho
 * cả trường hợp "mọi hãng của một loại xe"; ô tìm kiếm thu hẹp phần còn lại.
 */
const MAX_MODELS = 200;

/** Thông số mà một lượt ghi có thể đổi — gom lại để create/update/restore dùng chung một phép kiểm. */
interface SpecInput {
  motorbikeCategory: string | null;
  seatCounts: number[];
  fuelTypes: string[];
  transmissions: string[];
  yearFrom: number | null;
  yearTo: number | null;
}

/** Bỏ trùng và sắp tăng dần — "7, 5, 7" và "5, 7" là cùng một mẫu, phải lưu cùng một mảng. */
function uniqueSortedNumbers(values: readonly number[] | undefined): number[] {
  return [...new Set(values ?? [])].sort((a, b) => a - b);
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

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

  /**
   * Số mẫu theo HÃNG của một loại xe — cột trái của màn quản trị.
   *
   * Đọc đúng các cột cần để đếm rồi gộp ở tầng app: "thiếu thông số" là một luật trên bốn cột mảng
   * (`catalogModelMissingSpecs`) mà viết lại bằng SQL là tạo bản thứ hai của cùng một luật. Bảng
   * chỉ vài trăm dòng mỗi loại xe, nên một lượt quét là đủ rẻ.
   */
  async brandSummary(vehicleType: string): Promise<CatalogModelBrandSummaryDto[]> {
    const rows = await this.prisma.vehicleCatalogModel.findMany({
      where: { vehicleType, ...NOT_DELETED },
      select: {
        brandKey: true,
        vehicleType: true,
        active: true,
        seatCounts: true,
        motorbikeCategory: true,
        fuelTypes: true,
        transmissions: true,
      },
    });

    const byBrand = new Map<string, CatalogModelBrandSummaryDto>();
    for (const row of rows) {
      const entry = byBrand.get(row.brandKey) ?? {
        brandKey: row.brandKey,
        total: 0,
        active: 0,
        missingSpecs: 0,
      };
      entry.total += 1;
      if (row.active) entry.active += 1;
      if (catalogModelMissingSpecs(row).length > 0) entry.missingSpecs += 1;
      byBrand.set(row.brandKey, entry);
    }
    return [...byBrand.values()];
  }

  /**
   * Thêm mẫu. Nếu đúng mẫu đó (cùng khoá hoặc cùng tên trong hãng) từng bị XOÁ MỀM, khôi phục
   * dòng cũ với dữ liệu mới thay vì báo trùng: với admin, "thêm lại một mẫu đã xoá" là thêm mẫu.
   */
  async create(actorUserId: string, dto: CreateCatalogModelDto): Promise<CatalogModelDto> {
    await this.assertBrandExists(dto.brandKey, dto.vehicleType);
    const label = dto.label.trim();
    const spec = this.validateSpec(dto.vehicleType, {
      motorbikeCategory: dto.motorbikeCategory ?? null,
      seatCounts: uniqueSortedNumbers(dto.seatCounts),
      fuelTypes: uniqueStrings(dto.fuelTypes),
      transmissions: uniqueStrings(dto.transmissions),
      yearFrom: dto.yearFrom ?? null,
      yearTo: dto.yearTo ?? null,
    });

    const key = catalogModelKey(dto.brandKey, label);
    // Có thể khớp HAI dòng (một theo `key`, một theo tên) — dòng nào còn sống thì là trùng thật;
    // chỉ khi mọi dòng khớp đều đã xoá mới khôi phục.
    const matches = await this.prisma.vehicleCatalogModel.findMany({
      where: {
        OR: [{ key }, { brandKey: dto.brandKey, vehicleType: dto.vehicleType, label }],
      },
      select: { id: true, deletedAt: true },
    });
    if (matches.some((m) => !m.deletedAt)) throw this.duplicate(label);
    if (matches.length > 1) throw this.duplicate(label);
    const existing = matches[0] ?? null;

    const sourceUrl = dto.sourceUrl?.trim() || null;
    const data = {
      label,
      marketStatus: dto.marketStatus ?? CATALOG_MARKET_STATUS.CURRENT,
      ...spec,
      engineDisplacementCc: dto.engineDisplacementCc ?? null,
      sourceUrl,
      // Người thêm tay là người đang nhìn nguồn — ngày xác minh là hôm nay, không phải một
      // ô để trống rồi không ai biết dữ liệu cũ tới đâu.
      verifiedAt: sourceUrl ? new Date() : null,
      active: dto.active ?? true,
      adminEditedAt: new Date(),
    };

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.vehicleCatalogModel.update({
            where: { id: existing.id },
            // `key` không mang loại xe, nên dòng đã xoá có thể là mẫu xe máy cùng tên mà nay admin
            // thêm cho ô tô. Ghi lại hãng + loại xe để CHECK và danh sách cùng nói một điều; dòng đã
            // xoá không có xe nào gắn (xoá bị chặn khi còn xe), nên đổi loại không động tới ai.
            data: {
              ...data,
              brandKey: dto.brandKey,
              vehicleType: dto.vehicleType,
              deletedAt: null,
              sortOrder: await this.nextSortOrder(dto.brandKey, dto.vehicleType),
            },
            select: SELECT,
          })
        : await tx.vehicleCatalogModel.create({
            data: {
              id: newId(),
              key,
              brandKey: dto.brandKey,
              vehicleType: dto.vehicleType,
              ...data,
              sortOrder: await this.nextSortOrder(dto.brandKey, dto.vehicleType),
            },
            select: SELECT,
          });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: existing ? 'catalog.model.restore' : 'catalog.model.create',
          targetType: 'vehicle_catalog_model',
          targetId: saved.id,
          after: {
            key: saved.key,
            label: saved.label,
            brandKey: dto.brandKey,
            vehicleType: dto.vehicleType,
            ...spec,
          },
        },
        tx,
      );
      return saved;
    });
    return row as CatalogModelDto;
  }

  async update(
    actorUserId: string,
    id: string,
    dto: UpdateCatalogModelDto,
  ): Promise<CatalogModelDto> {
    const current = await this.load(id);
    // Kiểm trên trạng thái SAU khi gộp: đổi nguồn năng lượng mà giữ hộp số cũ phải bị bắt, dù
    // request không gửi lại `transmissions`.
    // Trường không gửi là `undefined` trên instance DTO (ValidationPipe `transform`) — so `!== undefined`,
    // không dùng `'x' in dto` (luôn đúng), nếu không một lượt sửa thiếu trường sẽ xoá trắng chúng.
    const spec = this.validateSpec(current.vehicleType, {
      motorbikeCategory:
        dto.motorbikeCategory !== undefined
          ? (dto.motorbikeCategory ?? null)
          : current.motorbikeCategory,
      seatCounts:
        dto.seatCounts !== undefined ? uniqueSortedNumbers(dto.seatCounts) : current.seatCounts,
      fuelTypes: dto.fuelTypes !== undefined ? uniqueStrings(dto.fuelTypes) : current.fuelTypes,
      transmissions:
        dto.transmissions !== undefined ? uniqueStrings(dto.transmissions) : current.transmissions,
      yearFrom: dto.yearFrom !== undefined ? (dto.yearFrom ?? null) : current.yearFrom,
      yearTo: dto.yearTo !== undefined ? (dto.yearTo ?? null) : current.yearTo,
    });

    const label = dto.label?.trim();
    if (label && label !== current.label) await this.assertLabelFree(current, label);

    /*
     * Ngày đối chiếu chỉ đổi khi NGUỒN đổi. Form luôn gửi kèm `sourceUrl`, nên đóng dấu "hôm nay"
     * mỗi lần lưu thì bật/tắt một mẫu cũng biến nó thành "vừa kiểm tra" — xoá mất thứ duy nhất
     * nói được dữ liệu này cũ tới đâu.
     */
    const nextSourceUrl =
      dto.sourceUrl !== undefined ? dto.sourceUrl?.trim() || null : current.sourceUrl;
    const sourceChanged = nextSourceUrl !== current.sourceUrl;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicleCatalogModel.update({
        where: { id },
        data: {
          ...(label ? { label } : {}),
          ...(dto.marketStatus !== undefined ? { marketStatus: dto.marketStatus } : {}),
          ...spec,
          ...(dto.engineDisplacementCc !== undefined
            ? { engineDisplacementCc: dto.engineDisplacementCc ?? null }
            : {}),
          ...(sourceChanged
            ? { sourceUrl: nextSourceUrl, verifiedAt: nextSourceUrl ? new Date() : null }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          adminEditedAt: new Date(),
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
          before: this.auditShape(current),
          after: this.auditShape({ ...updated, sourceUrl: nextSourceUrl }),
        },
        tx,
      );
      return updated;
    });
    return row as CatalogModelDto;
  }

  /**
   * Xoá MỀM — chỉ khi chưa xe nào gắn. Đã có xe thì TẮT: gỡ mẫu khỏi danh mục khi xe của người
   * khác còn trỏ vào là để họ mở form và thấy ô "Mẫu xe" của mình biến mất.
   *
   * Mềm chứ không cứng vì seed đồng bộ danh mục theo `key`: dòng biến mất thì lần chạy seed sau
   * tạo lại đúng mẫu admin vừa gỡ.
   */
  async remove(actorUserId: string, id: string): Promise<void> {
    const current = await this.load(id);

    await this.prisma.$transaction(async (tx) => {
      // Khoá dòng mẫu rồi mới ĐẾM, trong cùng transaction: đếm ngoài thì một chiếc xe gắn vào giữa
      // lúc đếm và lúc xoá sẽ trỏ vào một mẫu đã biến mất khỏi danh mục.
      await tx.$queryRaw`SELECT id FROM vehicle_catalog_models WHERE id = ${id} FOR UPDATE`;
      const used = await tx.vehicle.count({
        where: { vehicleCatalogModelId: id, deletedAt: null },
      });
      if (used > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CATALOG_MODEL_IN_USE,
          message: `Đang có ${used} xe gắn mẫu này — hãy tắt thay vì xoá để xe cũ vẫn giữ liên kết`,
        });
      }
      await tx.vehicleCatalogModel.update({
        where: { id },
        data: { deletedAt: new Date(), active: false, adminEditedAt: new Date() },
      });
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

    const model = await this.prisma.vehicleCatalogModel.findFirst({
      where: { id: modelId, ...NOT_DELETED },
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
        ...NOT_DELETED,
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

    const attached = await this.prisma.vehicleCatalogModel.findFirst({
      where: { id: query.includeId, ...NOT_DELETED },
      select: ADMIN_SELECT,
    });
    // Mẫu đang gắn nhưng thuộc loại xe khác thì KHÔNG chèn vào: nó không phải lựa chọn hợp lệ
    // cho form hiện tại, và hiện ra sẽ mời người dùng lưu lại đúng cái sai đang có.
    if (attached && attached.vehicleType !== query.vehicleType) return filtered;
    return attached ? [attached, ...filtered] : filtered;
  }

  private async load(id: string) {
    const row = await this.prisma.vehicleCatalogModel.findFirst({
      where: { id, ...NOT_DELETED },
      select: { ...SELECT, sourceUrl: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy mẫu xe');
    return row;
  }

  /** Đổi tên không được đụng một mẫu khác của cùng hãng — kể cả mẫu đã xoá mềm (giữ unique). */
  private async assertLabelFree(
    current: { id: string; brandKey: string; vehicleType: string },
    label: string,
  ): Promise<void> {
    const clash = await this.prisma.vehicleCatalogModel.findFirst({
      where: {
        brandKey: current.brandKey,
        vehicleType: current.vehicleType,
        label,
        id: { not: current.id },
      },
      select: { id: true },
    });
    if (clash) throw this.duplicate(label);
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

  /**
   * Luật hình dạng của một mẫu — trả lại chính bộ thông số đã kiểm để nơi gọi ghi đúng thứ vừa kiểm.
   *
   * Các luật DB đang giữ bằng CHECK được kiểm lại ở đây để báo lỗi có nghĩa thay vì để Postgres ném
   * 500. Hai luật còn lại (nguồn năng lượng theo loại xe, hộp số theo nguồn năng lượng) dùng CHÍNH
   * các hàm mà form đăng xe dùng, nên danh mục không chứa được một tổ hợp form sẽ từ chối.
   */
  private validateSpec(vehicleType: string, spec: SpecInput): SpecInput {
    const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;
    if (spec.motorbikeCategory && !isMotorbike) {
      throw this.invalidSpec('Phân khúc xe máy chỉ áp dụng cho mẫu xe máy');
    }
    if (spec.motorbikeCategory && !isMotorbikeCategory(spec.motorbikeCategory)) {
      throw this.invalidSpec(`Phân khúc xe máy không hợp lệ: ${spec.motorbikeCategory}`);
    }
    if (spec.seatCounts.length > 0 && isMotorbike) {
      throw this.invalidSpec('Số chỗ ngồi chỉ áp dụng cho mẫu ô tô');
    }

    const allowedFuels = vehicleFuelTypesFor(vehicleType) as readonly string[];
    const badFuel = spec.fuelTypes.find((fuel) => !allowedFuels.includes(fuel));
    if (badFuel) {
      throw this.invalidSpec(`Nguồn năng lượng "${badFuel}" không dùng cho loại xe này`);
    }
    const allowedTransmissions = vehicleTransmissionTypesForFuels(
      vehicleType,
      spec.fuelTypes,
    ) as readonly string[];
    const badTransmission = spec.transmissions.find((t) => !allowedTransmissions.includes(t));
    if (badTransmission) {
      throw this.invalidSpec(
        `Hộp số "${badTransmission}" không khớp nguồn năng lượng đã chọn của mẫu xe`,
      );
    }

    if (spec.yearFrom != null && spec.yearTo != null && spec.yearTo < spec.yearFrom) {
      throw this.invalidSpec('Năm kết thúc bán phải sau năm bắt đầu bán');
    }
    return spec;
  }

  private duplicate(label: string): ConflictException {
    return new ConflictException({
      code: API_ERROR_CODE.CATALOG_MODEL_DUPLICATE,
      message: `Mẫu xe "${label}" của hãng này đã có trong danh mục`,
    });
  }

  private invalidSpec(message: string): BadRequestException {
    return new BadRequestException({ code: API_ERROR_CODE.CATALOG_MODEL_SPEC_INVALID, message });
  }

  private auditShape(row: {
    label: string;
    active: boolean;
    marketStatus: string;
    seatCounts: number[];
    fuelTypes: string[];
    transmissions: string[];
    motorbikeCategory: string | null;
    sourceUrl: string | null;
  }) {
    return {
      label: row.label,
      active: row.active,
      marketStatus: row.marketStatus,
      seatCounts: row.seatCounts,
      fuelTypes: row.fuelTypes,
      transmissions: row.transmissions,
      motorbikeCategory: row.motorbikeCategory,
      sourceUrl: row.sourceUrl,
    };
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
