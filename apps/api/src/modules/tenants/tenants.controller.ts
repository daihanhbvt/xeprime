import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSION } from '@xeprime/types';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { TenantScopeGuard } from '../../common/guards/tenant-scope.guard';
import type { TenantContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentTenantDto } from './dto/current-tenant.dto';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(TenantScopeGuard)
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Không có tham số `tenantId` — đó là chủ ý, không phải thiếu sót.
   * CLAUDE.md mục 5: API tenant-sensitive không nhận `tenant_id` từ client.
   */
  @Get('current')
  @RequirePermissions(PERMISSION.TENANT_VIEW)
  @ApiOperation({ summary: 'Gian hàng của user hiện tại (scope lấy từ membership)' })
  @ApiOkResponse({ type: CurrentTenantDto })
  async current(@CurrentTenant() tenant: TenantContext): Promise<CurrentTenantDto> {
    const row = await this.prisma.tenant.findFirstOrThrow({
      where: { id: tenant.tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        slug: true,
        name: true,
        tenantType: true,
        status: true,
        phone: true,
        email: true,
        ratingAvg: true,
        ratingCount: true,
        _count: { select: { vehicles: true, memberships: true } },
      },
    });

    return {
      id: row.id,
      code: row.code,
      slug: row.slug,
      name: row.name,
      tenantType: row.tenantType,
      status: row.status,
      phone: row.phone,
      email: row.email,
      ratingAvg: row.ratingAvg.toString(),
      ratingCount: row.ratingCount,
      vehicleCount: row._count.vehicles,
      memberCount: row._count.memberships,
      myRoleKey: tenant.roleKey,
    };
  }
}
