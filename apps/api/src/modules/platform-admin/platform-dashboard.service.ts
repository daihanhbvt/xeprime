import { Injectable } from '@nestjs/common';
import {
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  LISTING_STATUS,
  TENANT_STATUS_VALUES,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PlatformDashboardSummaryDto,
  PlatformTenantStatusCountsDto,
} from './dto/platform-dashboard.dto';

/** Giờ VN cố định UTC+7 (không DST) — "tháng này" tính theo lịch VN. */
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function startOfVnMonth(now: Date): Date {
  const vn = new Date(now.getTime() + VN_UTC_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - VN_UTC_OFFSET_MS);
}

@Injectable()
export class PlatformDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Toàn bộ số liệu dashboard nền tảng — count song song (pattern finance-overview). */
  async summary(): Promise<PlatformDashboardSummaryDto> {
    const monthStart = startOfVnMonth(new Date());

    const [
      tenantsByStatus,
      listingActive,
      listingTotal,
      bookingTotal,
      bookingThisMonth,
      pendingByTarget,
      recentTenants,
    ] = await Promise.all([
      this.prisma.tenant.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.publicListing.count({ where: { status: LISTING_STATUS.ACTIVE } }),
      this.prisma.publicListing.count(),
      this.prisma.booking.count({ where: { deletedAt: null } }),
      this.prisma.booking.count({
        where: { deletedAt: null, createdAt: { gte: monthStart } },
      }),
      this.prisma.approvalTask.groupBy({
        by: ['targetType'],
        where: { status: APPROVAL_STATUS.PENDING },
        orderBy: { targetType: 'asc' },
        _count: true,
      }),
      this.prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          profile: { select: { provinceName: true } },
        },
      }),
    ]);

    const byStatus = Object.fromEntries(
      TENANT_STATUS_VALUES.map((s) => [s, 0]),
    ) as unknown as PlatformTenantStatusCountsDto;
    let tenantTotal = 0;
    for (const row of tenantsByStatus) {
      const count = row._count;
      tenantTotal += count;
      if (row.status in byStatus) {
        byStatus[row.status as keyof PlatformTenantStatusCountsDto] = count;
      }
    }

    const pendingCount = (target: string): number =>
      pendingByTarget.find((r) => r.targetType === target)?._count ?? 0;
    const approvalPending = pendingByTarget.reduce((sum, r) => sum + r._count, 0);

    return {
      tenantTotal,
      tenantsByStatus: byStatus,
      listingActive,
      listingTotal,
      bookingTotal,
      bookingThisMonth,
      approvalPending,
      approvalPendingTenant: pendingCount(APPROVAL_TARGET_TYPE.TENANT),
      approvalPendingVehicle: pendingCount(APPROVAL_TARGET_TYPE.VEHICLE),
      recentTenants: recentTenants.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        provinceName: t.profile?.provinceName ?? null,
        createdAt: (t.createdAt as Date).toISOString(),
      })),
    };
  }
}
