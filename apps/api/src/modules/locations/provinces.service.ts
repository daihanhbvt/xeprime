import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PROVINCE_ADMINISTRATIVE_TYPE,
  normalizeProvinceAlias,
  provinceSlug,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateProvinceDto,
  PlatformProvinceDto,
  ProvinceDto,
  UpdateProvinceDto,
} from './dto/province.dto';

const PROVINCE_SELECT = {
  code: true,
  name: true,
  administrativeType: true,
  slug: true,
} satisfies Prisma.ProvinceSelect;

/**
 * Danh mục hành chính — nguồn sự thật cho MỌI vị trí trong hệ thống.
 *
 * Vì sao là service riêng chứ không phải vài câu query rải rác: ba nơi cần cùng một luật (đăng
 * ký shop, tạo/sửa chi nhánh, lọc marketplace), và luật đó có hai cờ dễ nhầm — `isEnabled` (chọn
 * MỚI được không) khác `isPublicVisible` (khách có thấy không). Tắt nhầm cờ là cả một vùng biến
 * mất khỏi marketplace, nên chỗ quyết định phải có đúng một.
 */
@Injectable()
export class ProvincesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Tỉnh được phép CHỌN MỚI — dùng cho đăng ký shop và form chi nhánh. */
  async listEnabled(): Promise<ProvinceDto[]> {
    return this.prisma.province.findMany({
      where: { isEnabled: true },
      select: PROVINCE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Xác nhận một mã tỉnh dùng được để GẮN VÀO dữ liệu mới.
   *
   * Trả về bản ghi (để caller lấy tên chuẩn) thay vì boolean: gần như mọi caller cần tên ngay
   * sau đó, và tách hai lượt query là chỗ để chúng lệch nhau.
   */
  async assertSelectable(code: string): Promise<ProvinceDto> {
    const province = await this.prisma.province.findUnique({
      where: { code },
      select: { ...PROVINCE_SELECT, isEnabled: true },
    });
    if (!province) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Tỉnh/thành không hợp lệ',
        details: { field: 'provinceCode' },
      });
    }
    if (!province.isEnabled) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Tỉnh/thành "${province.name}" hiện không nhận đăng ký mới`,
        details: { field: 'provinceCode' },
      });
    }
    const { isEnabled: _isEnabled, ...rest } = province;
    return rest;
  }

  /**
   * Quy một chuỗi địa danh tự do về mã chuẩn qua bảng bí danh. `null` = KHÔNG xác định được —
   * caller phải xử lý như "chưa biết", tuyệt đối không thay bằng một tỉnh mặc định.
   */
  async resolveCode(raw: string | null | undefined): Promise<string | null> {
    if (!raw) return null;
    const normalized = normalizeProvinceAlias(raw);
    if (!normalized) return null;
    const alias = await this.prisma.provinceAlias.findUnique({
      where: { normalizedAlias: normalized },
      select: { provinceCode: true },
    });
    return alias?.provinceCode ?? null;
  }

  // ─── Quản trị nền tảng ───────────────────────────────────────────────────

  /**
   * Danh mục đầy đủ cho admin, KÈM số liệu tác động.
   *
   * Đếm bằng `groupBy` chứ không đếm trong vòng lặp: 34 tỉnh × 3 con số = 102 query nếu làm ngây
   * thơ, trong khi ba câu groupBy là đủ và không phụ thuộc số tỉnh (danh mục sẽ còn thay đổi).
   */
  async listForPlatform(q?: string): Promise<PlatformProvinceDto[]> {
    const provinces = await this.prisma.province.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { aliases: { select: { alias: true }, orderBy: { alias: 'asc' } } },
    });

    const [branchGroups, vehicleRows, publicRows] = await Promise.all([
      this.prisma.tenantBranch.groupBy({
        by: ['provinceCode'],
        where: { deletedAt: null, provinceCode: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ province_code: string; count: bigint }[]>`
        SELECT b."province_code" AS province_code, count(*)::bigint AS count
        FROM "vehicles" v
        JOIN "tenant_branches" b ON b."id" = v."branch_id"
        WHERE v."deleted_at" IS NULL AND b."province_code" IS NOT NULL
        GROUP BY b."province_code"`,
      this.prisma.publicListing.groupBy({
        by: ['provinceCode'],
        where: { status: 'active', provinceCode: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const branchBy = new Map(branchGroups.map((g) => [g.provinceCode, g._count._all]));
    const vehicleBy = new Map(vehicleRows.map((r) => [r.province_code, Number(r.count)]));
    const publicBy = new Map(publicRows.map((g) => [g.provinceCode, g._count._all]));

    const needle = q ? normalizeProvinceAlias(q) : '';
    return provinces
      .filter((p) => {
        if (!q) return true;
        // Tìm theo MÃ khớp thẳng (mã không qua chuẩn hoá được — '01' là '01').
        if (p.code.includes(q.trim())) return true;
        if (!needle) return false;
        if (normalizeProvinceAlias(p.name).includes(needle)) return true;
        return p.aliases.some((a) => normalizeProvinceAlias(a.alias).includes(needle));
      })
      .map((p) => ({
        code: p.code,
        name: p.name,
        administrativeType: p.administrativeType,
        slug: p.slug,
        isEnabled: p.isEnabled,
        isPublicVisible: p.isPublicVisible,
        sortOrder: p.sortOrder,
        branchCount: branchBy.get(p.code) ?? 0,
        vehicleCount: vehicleBy.get(p.code) ?? 0,
        publicVehicleCount: publicBy.get(p.code) ?? 0,
        aliases: p.aliases.map((a) => a.alias),
      }));
  }

  /**
   * Sửa metadata hiển thị + hai cờ điều khiển. KHÔNG đụng tới xe/chi nhánh nào — đổi tên hiển
   * thị chỉ là đổi nhãn, và ẩn một tỉnh không có nghĩa là xoá dữ liệu ở đó.
   *
   * Đổi TÊN kéo theo đồng bộ tên đã denormalize trong `public_listings` (không thì marketplace
   * còn hiện tên cũ tới lần sync sau).
   */
  async update(code: string, actorUserId: string, dto: UpdateProvinceDto): Promise<PlatformProvinceDto> {
    const before = await this.prisma.province.findUnique({ where: { code } });
    if (!before) throw provinceNotFound();

    const renamed = dto.name !== undefined && dto.name !== before.name;
    if (renamed) {
      const clash = await this.prisma.province.findFirst({
        where: { name: dto.name, NOT: { code } },
        select: { code: true },
      });
      if (clash) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: `Tên "${dto.name!}" đã thuộc tỉnh ${clash.code}`,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.province.update({
        where: { code },
        data: {
          ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
          ...(dto.isPublicVisible !== undefined ? { isPublicVisible: dto.isPublicVisible } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(renamed ? { name: dto.name!, slug: provinceSlug(dto.name!) } : {}),
        },
      });

      if (renamed) {
        // Bí danh cho tên mới để dữ liệu/URL cũ vẫn quy về đúng tỉnh.
        const normalized = normalizeProvinceAlias(dto.name!);
        const existingAlias = await tx.provinceAlias.findUnique({
          where: { normalizedAlias: normalized },
          select: { id: true, provinceCode: true },
        });
        if (!existingAlias) {
          await tx.provinceAlias.create({
            data: {
              id: newId(),
              provinceCode: code,
              alias: dto.name!,
              normalizedAlias: normalized,
              aliasType: 'display_variant',
            },
          });
        }
        // Đồng bộ tên đã denormalize trong snapshot công khai — một câu UPDATE theo MÃ, không
        // phải vòng lặp từng listing.
        await tx.publicListing.updateMany({
          where: { provinceCode: code },
          data: { provinceName: dto.name! },
        });
        await tx.tenantProfile.updateMany({
          where: { provinceCode: code },
          data: { provinceName: dto.name! },
        });
      }
    });

    await this.audit.record({
      actorUserId,
      actorScope: 'platform',
      action: 'platform.location.update',
      targetType: 'province',
      targetId: code,
      before: {
        name: before.name,
        isEnabled: before.isEnabled,
        isPublicVisible: before.isPublicVisible,
        sortOrder: before.sortOrder,
      },
      after: {
        name: dto.name ?? before.name,
        isEnabled: dto.isEnabled ?? before.isEnabled,
        isPublicVisible: dto.isPublicVisible ?? before.isPublicVisible,
        sortOrder: dto.sortOrder ?? before.sortOrder,
      },
    });

    const [updated] = await this.listForPlatform(code);
    if (!updated) throw provinceNotFound();
    return updated;
  }

  /** Thêm đơn vị hành chính mới (hiếm — khi có quyết định mới). Mã bất biến sau khi tạo. */
  async create(actorUserId: string, dto: CreateProvinceDto): Promise<PlatformProvinceDto> {
    const types = Object.values(PROVINCE_ADMINISTRATIVE_TYPE) as string[];
    if (!types.includes(dto.administrativeType)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Loại đơn vị hành chính không hợp lệ',
        details: { field: 'administrativeType' },
      });
    }

    const existing = await this.prisma.province.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
      select: { code: true },
    });
    if (existing) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: `Đã tồn tại tỉnh/thành với mã hoặc tên này (${existing.code})`,
      });
    }

    const normalized = normalizeProvinceAlias(dto.name);
    await this.prisma.$transaction(async (tx) => {
      await tx.province.create({
        data: {
          code: dto.code,
          name: dto.name,
          administrativeType: dto.administrativeType,
          slug: provinceSlug(dto.name),
          sortOrder: dto.sortOrder ?? 999,
        },
      });
      const clash = await tx.provinceAlias.findUnique({
        where: { normalizedAlias: normalized },
        select: { id: true },
      });
      if (!clash) {
        await tx.provinceAlias.create({
          data: {
            id: newId(),
            provinceCode: dto.code,
            alias: dto.name,
            normalizedAlias: normalized,
            aliasType: 'canonical_name',
          },
        });
      }
    });

    await this.audit.record({
      actorUserId,
      actorScope: 'platform',
      action: 'platform.location.create',
      targetType: 'province',
      targetId: dto.code,
      after: { code: dto.code, name: dto.name, administrativeType: dto.administrativeType },
    });

    const [created] = await this.listForPlatform(dto.code);
    if (!created) throw provinceNotFound();
    return created;
  }
}

function provinceNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy tỉnh/thành',
  });
}
