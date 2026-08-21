import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, TENANT_STATUS, type PaginationMeta } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import {
  LockTenantDto,
  PLATFORM_TENANT_DEFAULT_LIMIT,
  PLATFORM_TENANT_MAX_LIMIT,
  PlatformTenantDetailDto,
  PlatformTenantDto,
  PlatformTenantListQueryDto,
} from './dto/platform-tenant.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  slug: true,
  tenantType: true,
  status: true,
  phone: true,
  email: true,
  createdAt: true,
  owner: { select: { displayName: true } },
  profile: { select: { provinceName: true } },
  _count: { select: { vehicles: true } },
} satisfies Prisma.TenantSelect;

@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Toàn bộ gian hàng của nền tảng (không tenant-scope — đây là admin platform). Phân trang +
   * lọc trạng thái + tìm theo tên/mã/slug/SĐT. `deleted_at` null.
   */
  async list(
    query: PlatformTenantListQueryDto,
  ): Promise<{ data: PlatformTenantDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_TENANT_DEFAULT_LIMIT, PLATFORM_TENANT_MAX_LIMIT);

    const q = query.q?.trim();
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: paginationMeta(paging, total),
    };
  }

  async getOne(id: string): Promise<PlatformTenantDetailDto> {
    const row = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...LIST_SELECT,
        owner: { select: { displayName: true, email: true, phone: true } },
        profile: {
          select: { provinceName: true, address: true, taxCode: true, businessLicenseNo: true },
        },
        _count: { select: { vehicles: true, bookings: true } },
      },
    });
    if (!row) throw notFound();
    return {
      ...toListItem(row),
      ownerEmail: row.owner?.email ?? null,
      ownerPhone: row.owner?.phone ?? null,
      address: row.profile?.address ?? null,
      taxCode: row.profile?.taxCode ?? null,
      businessLicenseNo: row.profile?.businessLicenseNo ?? null,
      bookingCount: row._count.bookings,
      currentPlan: await this.billing.currentPlan(id),
    };
  }

  /**
   * Khoá gian hàng đang hoạt động (active → suspended). Marketplace lọc `active` nên xe biến mất
   * khỏi sàn tức thì (ADR 0008). Ghi audit (scope platform). Chỉ khoá được shop đang `active`.
   */
  async lock(id: string, actorUserId: string, dto: LockTenantDto): Promise<PlatformTenantDetailDto> {
    await this.transition(id, actorUserId, TENANT_STATUS.ACTIVE, TENANT_STATUS.SUSPENDED, 'tenant.lock', dto.reason);
    return this.getOne(id);
  }

  /** Mở khoá (suspended → active). Chỉ mở được shop đang `suspended`. */
  async unlock(id: string, actorUserId: string): Promise<PlatformTenantDetailDto> {
    await this.transition(id, actorUserId, TENANT_STATUS.SUSPENDED, TENANT_STATUS.ACTIVE, 'tenant.unlock');
    return this.getOne(id);
  }

  private async transition(
    id: string,
    actorUserId: string,
    from: string,
    to: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // updateMany với điều kiện trạng thái nguồn: chỉ đúng 1 dòng đổi được (chống đua + sai bước).
      const res = await tx.tenant.updateMany({
        where: { id, status: from, deletedAt: null },
        data: { status: to },
      });
      if (res.count !== 1) {
        // Không đổi được: hoặc không tồn tại, hoặc không ở trạng thái nguồn.
        const exists = await tx.tenant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
        if (!exists) throw notFound();
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: to === TENANT_STATUS.SUSPENDED ? 'Chỉ khoá được gian hàng đang hoạt động' : 'Chỉ mở khoá được gian hàng đang bị khoá',
        });
      }
      await this.audit.record(
        {
          tenantId: id,
          actorUserId,
          actorScope: 'platform',
          action,
          targetType: 'tenant',
          targetId: id,
          before: { status: from },
          after: { status: to, ...(reason ? { reason } : {}) },
        },
        tx,
      );
    });
  }
}

type TenantRow = Prisma.TenantGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(r: TenantRow): PlatformTenantDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    slug: r.slug,
    tenantType: r.tenantType,
    status: r.status,
    phone: r.phone,
    email: r.email,
    ownerName: r.owner?.displayName ?? null,
    provinceName: r.profile?.provinceName ?? null,
    vehicleCount: r._count.vehicles,
    createdAt: r.createdAt as unknown as string,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy gian hàng',
  });
}
