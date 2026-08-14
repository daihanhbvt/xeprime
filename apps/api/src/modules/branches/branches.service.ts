import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_OCCUPYING,
  BRANCH_STATUS,
  type BranchStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { ProvincesService } from '../locations/provinces.service';
import { ListingsService } from '../public-listings/listings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BranchDto,
  BranchListDto,
  BranchListQueryDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto/branch.dto';

const BRANCH_SELECT = {
  id: true,
  code: true,
  name: true,
  provinceCode: true,
  address: true,
  phone: true,
  latitude: true,
  longitude: true,
  isDefault: true,
  status: true,
  needsLocationReview: true,
  legacyProvinceValue: true,
  createdAt: true,
  updatedAt: true,
  province: { select: { name: true } },
} satisfies Prisma.TenantBranchSelect;

type BranchRow = Prisma.TenantBranchGetPayload<{ select: typeof BRANCH_SELECT }>;

/**
 * Chi nhánh gian hàng — nơi xe thực sự nằm.
 *
 * Ba luật ở đây không phải "nên có" mà là điều kiện để marketplace nói đúng sự thật:
 *   1. Mỗi gian hàng luôn có ĐÚNG MỘT chi nhánh mặc định đang hoạt động (partial unique ở DB).
 *   2. Chi nhánh đổi tỉnh → mọi snapshot công khai của xe trong đó phải đổi theo NGAY, không đợi
 *      lần sửa xe tiếp theo.
 *   3. Ngừng hoạt động một chi nhánh còn xe/đơn thì DỪNG và nói rõ phải chuyển gì — không tự ý
 *      dời xe sang chi nhánh khác thay người dùng.
 *
 * `tenantId` luôn đến từ membership (guard), không bao giờ từ payload.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provinces: ProvincesService,
    private readonly listings: ListingsService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: BranchListQueryDto): Promise<BranchListDto> {
    const where: Prisma.TenantBranchWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.provinceCode ? { provinceCode: query.provinceCode } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q, mode: 'insensitive' } },
              { address: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.tenantBranch.findMany({
      where,
      select: BRANCH_SELECT,
      // Mặc định lên đầu, rồi đang hoạt động, rồi theo mã — danh sách đọc được mà không cần sort.
      orderBy: [{ isDefault: 'desc' }, { status: 'asc' }, { code: 'asc' }],
    });

    const counts = await this.vehicleCounts(
      tenantId,
      rows.map((r) => r.id),
    );

    // Tổng số đếm trên TOÀN BỘ chi nhánh của gian hàng, không theo bộ lọc: đây là "gian hàng có
    // bao nhiêu chi nhánh", không phải "kết quả tìm kiếm có bao nhiêu dòng".
    const [total, activeCount, needsReviewCount] = await Promise.all([
      this.prisma.tenantBranch.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.tenantBranch.count({
        where: { tenantId, deletedAt: null, status: BRANCH_STATUS.ACTIVE },
      }),
      this.prisma.tenantBranch.count({
        where: { tenantId, deletedAt: null, needsLocationReview: true },
      }),
    ]);

    return {
      items: rows.map((r) => toDto(r, counts.get(r.id) ?? 0)),
      total,
      activeCount,
      needsReviewCount,
    };
  }

  async get(tenantId: string, id: string): Promise<BranchDto> {
    const row = await this.findOwned(tenantId, id);
    const counts = await this.vehicleCounts(tenantId, [row.id]);
    return toDto(row, counts.get(row.id) ?? 0);
  }

  async create(tenantId: string, userId: string, dto: CreateBranchDto): Promise<BranchDto> {
    const province = await this.provinces.assertSelectable(dto.provinceCode);

    const branch = await this.prisma.$transaction(async (tx) => {
      const code = await nextBranchCode(tx, tenantId);
      // Gian hàng chưa có chi nhánh nào (dữ liệu lạ) → chi nhánh đầu tiên thành mặc định luôn,
      // để bất biến "luôn có một mặc định" không bao giờ hụt.
      const hasDefault = await tx.tenantBranch.count({
        where: { tenantId, isDefault: true, deletedAt: null },
      });

      return tx.tenantBranch.create({
        data: {
          id: newId(),
          tenantId,
          code,
          name: dto.name,
          provinceCode: province.code,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          isDefault: hasDefault === 0,
          status: BRANCH_STATUS.ACTIVE,
          createdBy: userId,
        },
        select: BRANCH_SELECT,
      });
    });

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'branch.create',
      targetType: 'tenant_branch',
      targetId: branch.id,
      after: { code: branch.code, name: branch.name, provinceCode: branch.provinceCode },
    });

    return toDto(branch, 0);
  }

  /**
   * Sửa chi nhánh. Đổi tỉnh là thay đổi có HỆ QUẢ RA NGOÀI: mọi xe của chi nhánh đang hiển thị
   * ở tỉnh cũ trên marketplace phải chuyển sang tỉnh mới trong cùng transaction.
   */
  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateBranchDto,
  ): Promise<BranchDto> {
    const before = await this.findOwned(tenantId, id);
    const provinceChanged =
      dto.provinceCode !== undefined && dto.provinceCode !== before.provinceCode;
    if (provinceChanged) await this.provinces.assertSelectable(dto.provinceCode!);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.tenantBranch.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.provinceCode !== undefined
            ? // Bổ sung được tỉnh thì cờ "cần rà soát vị trí" tắt luôn — đó chính là việc cần làm.
              { provinceCode: dto.provinceCode, needsLocationReview: false }
            : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        },
        select: BRANCH_SELECT,
      });

      if (provinceChanged) {
        await this.listings.syncBranchLocation(id, tx);
        if (row.isDefault) await this.syncProfileFromDefaultBranch(tx, tenantId);
      }
      return row;
    });

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'branch.update',
      targetType: 'tenant_branch',
      targetId: id,
      before: { name: before.name, provinceCode: before.provinceCode, address: before.address },
      after: { name: updated.name, provinceCode: updated.provinceCode, address: updated.address },
    });

    const counts = await this.vehicleCounts(tenantId, [id]);
    return toDto(updated, counts.get(id) ?? 0);
  }

  /** Đổi chi nhánh mặc định. Chi nhánh phải đang hoạt động và phải có tỉnh hợp lệ. */
  async setDefault(tenantId: string, id: string, userId: string): Promise<BranchDto> {
    const target = await this.findOwned(tenantId, id);
    if (target.isDefault) return this.get(tenantId, id);

    if (target.status !== BRANCH_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.BRANCH_DEFAULT_IMMUTABLE,
        message: 'Chi nhánh đang ngừng hoạt động — bật lại trước khi đặt làm mặc định',
      });
    }
    if (!target.provinceCode) {
      throw new ConflictException({
        code: API_ERROR_CODE.BRANCH_LOCATION_REQUIRED,
        message: 'Chi nhánh chưa có tỉnh/thành — bổ sung trước khi đặt làm mặc định',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Hạ cờ cũ TRƯỚC rồi mới dựng cờ mới: partial unique index chỉ cho tồn tại một mặc định,
      // làm ngược thứ tự là vi phạm ràng buộc ngay giữa transaction.
      await tx.tenantBranch.updateMany({
        where: { tenantId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
      const row = await tx.tenantBranch.update({
        where: { id },
        data: { isDefault: true },
        select: BRANCH_SELECT,
      });
      await this.syncProfileFromDefaultBranch(tx, tenantId);
      return row;
    });

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'branch.set_default',
      targetType: 'tenant_branch',
      targetId: id,
      after: { code: updated.code, name: updated.name },
    });

    const counts = await this.vehicleCounts(tenantId, [id]);
    return toDto(updated, counts.get(id) ?? 0);
  }

  /**
   * Ngừng hoạt động. Chặn khi còn xe hoặc còn đơn đang chạy/sắp tới, và trả về ĐÚNG con số để
   * người dùng biết phải xử lý gì — không tự dời xe hộ, vì "xe nằm ở đâu" là sự thật vật lý.
   */
  async deactivate(tenantId: string, id: string, userId: string): Promise<BranchDto> {
    const branch = await this.findOwned(tenantId, id);
    if (branch.status === BRANCH_STATUS.INACTIVE) return this.get(tenantId, id);

    if (branch.isDefault) {
      throw new ConflictException({
        code: API_ERROR_CODE.BRANCH_DEFAULT_IMMUTABLE,
        message:
          'Không thể ngừng chi nhánh mặc định. Hãy đặt một chi nhánh khác làm mặc định trước.',
      });
    }

    const [vehicleCount, activeBookings] = await Promise.all([
      this.prisma.vehicle.count({ where: { tenantId, branchId: id, deletedAt: null } }),
      this.prisma.booking.count({
        where: {
          tenantId,
          status: { in: [...BOOKING_STATUS_OCCUPYING] },
          vehicle: { branchId: id },
        },
      }),
    ]);

    if (vehicleCount > 0 || activeBookings > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.BRANCH_HAS_DEPENDENCIES,
        message:
          `Chi nhánh còn ${vehicleCount} xe và ${activeBookings} đơn đang chạy/sắp tới. ` +
          'Hãy chuyển xe sang chi nhánh khác và hoàn tất các đơn trước khi ngừng hoạt động.',
        details: { vehicleCount, activeBookings },
      });
    }

    const updated = await this.prisma.tenantBranch.update({
      where: { id },
      data: { status: BRANCH_STATUS.INACTIVE },
      select: BRANCH_SELECT,
    });

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'branch.deactivate',
      targetType: 'tenant_branch',
      targetId: id,
      before: { status: branch.status },
      after: { status: updated.status },
    });

    return toDto(updated, 0);
  }

  async activate(tenantId: string, id: string, userId: string): Promise<BranchDto> {
    const branch = await this.findOwned(tenantId, id);
    if (branch.status === BRANCH_STATUS.ACTIVE) return this.get(tenantId, id);

    const updated = await this.prisma.tenantBranch.update({
      where: { id },
      data: { status: BRANCH_STATUS.ACTIVE },
      select: BRANCH_SELECT,
    });

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'branch.activate',
      targetType: 'tenant_branch',
      targetId: id,
      before: { status: branch.status },
      after: { status: updated.status },
    });

    const counts = await this.vehicleCounts(tenantId, [id]);
    return toDto(updated, counts.get(id) ?? 0);
  }

  // ─── Dùng chung với module khác ──────────────────────────────────────────

  /**
   * Tạo chi nhánh mặc định lúc đăng ký gian hàng. Nhận `tx` vì đăng ký phải là MỘT transaction:
   * gian hàng có mà không có chi nhánh là trạng thái không hợp lệ.
   */
  async createDefaultBranch(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      userId: string;
      provinceCode: string;
      provinceName: string;
      phone?: string | null;
      address?: string | null;
    },
  ): Promise<{ id: string; code: string; name: string }> {
    const branch = await tx.tenantBranch.create({
      data: {
        id: newId(),
        tenantId: input.tenantId,
        code: 'CN01',
        name: `Chi nhánh ${input.provinceName}`,
        provinceCode: input.provinceCode,
        address: input.address ?? null,
        phone: input.phone ?? null,
        isDefault: true,
        status: BRANCH_STATUS.ACTIVE,
        createdBy: input.userId,
      },
      select: { id: true, code: true, name: true },
    });
    return branch;
  }

  /**
   * Đồng bộ hai cột tương thích ngược trên `tenant_profiles` từ chi nhánh MẶC ĐỊNH.
   *
   * Nguồn sự thật vận hành là chi nhánh; hai cột kia còn tồn tại vì hợp đồng, trang gian hàng và
   * màn giám sát của admin vẫn đọc chúng. Đặt đúng MỘT chỗ đồng bộ (hàm này) để không có nơi thứ
   * hai ghi lệch.
   */
  async syncProfileFromDefaultBranch(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const branch = await tx.tenantBranch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { provinceCode: true, address: true, province: { select: { name: true } } },
    });
    if (!branch) return;

    await tx.tenantProfile.updateMany({
      where: { tenantId },
      data: {
        provinceCode: branch.provinceCode,
        provinceName: branch.province?.name ?? null,
      },
    });
  }

  /**
   * Chi nhánh dùng được để GẮN XE: đúng gian hàng, đang hoạt động, chưa xoá.
   *
   * Trả 404 (không phải 403) khi id thuộc gian hàng khác — không tiết lộ chi nhánh đó có tồn tại.
   */
  async assertAssignable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
  ): Promise<{ id: string; provinceCode: string | null }> {
    const branch = await tx.tenantBranch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: { id: true, status: true, provinceCode: true },
    });
    if (!branch) throw branchNotFound();
    if (branch.status !== BRANCH_STATUS.ACTIVE) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chi nhánh đang ngừng hoạt động — chọn chi nhánh khác',
        details: { field: 'branchId' },
      });
    }
    return { id: branch.id, provinceCode: branch.provinceCode };
  }

  /** Chi nhánh mặc định của gian hàng — dùng làm giá trị chọn sẵn ở form tạo xe. */
  async defaultBranchId(tenantId: string): Promise<string | null> {
    const row = await this.prisma.tenantBranch.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  // ─── Nội bộ ─────────────────────────────────────────────────────────────

  private async findOwned(tenantId: string, id: string): Promise<BranchRow> {
    const row = await this.prisma.tenantBranch.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: BRANCH_SELECT,
    });
    if (!row) throw branchNotFound();
    return row;
  }

  /** Đếm xe theo chi nhánh bằng MỘT groupBy — không phải một query cho mỗi dòng. */
  private async vehicleCounts(tenantId: string, ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.vehicle.groupBy({
      by: ['branchId'],
      where: { tenantId, deletedAt: null, branchId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.branchId ?? '', g._count._all]));
  }
}

/**
 * Mã chi nhánh kế tiếp trong gian hàng (`CN01`, `CN02`…).
 *
 * Đếm số dòng là sai khi đã có chi nhánh bị xoá mềm — lấy MAX của phần số rồi +1, và unique
 * `(tenant_id, code)` vẫn là chốt chặn cuối nếu hai request chen nhau.
 */
async function nextBranchCode(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const rows = await tx.tenantBranch.findMany({
    where: { tenantId },
    select: { code: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number(/^CN(\d+)$/.exec(r.code)?.[1] ?? 0);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `CN${String(max + 1).padStart(2, '0')}`;
}

function toDto(row: BranchRow, vehicleCount: number): BranchDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    provinceCode: row.provinceCode,
    provinceName: row.province?.name ?? null,
    address: row.address,
    phone: row.phone,
    latitude: row.latitude?.toString() ?? null,
    longitude: row.longitude?.toString() ?? null,
    isDefault: row.isDefault,
    status: row.status as BranchStatus,
    vehicleCount,
    needsLocationReview: row.needsLocationReview,
    legacyProvinceValue: row.legacyProvinceValue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function branchNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy chi nhánh',
  });
}
