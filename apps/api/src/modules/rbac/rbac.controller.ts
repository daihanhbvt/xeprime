import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { MEMBERSHIP_STATUS, type Permission } from '@xeprime/types';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import { RbacService } from './rbac.service';
import { MyPermissionsDto } from './dto/my-permissions.dto';

@ApiTags('rbac')
@Controller('rbac')
export class RbacController {
  constructor(
    private readonly rbac: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('my-permissions')
  @ApiOperation({
    summary: 'Quyền của user hiện tại theo từng scope',
    description:
      'Frontend dùng để ẩn/hiện menu. KHÔNG phải nguồn bảo vệ — backend guard mới là nguồn.',
  })
  @ApiOkResponse({ type: MyPermissionsDto })
  async myPermissions(@CurrentUser() user: AuthenticatedUser): Promise<MyPermissionsDto> {
    const [tenantMembership, platformMembership] = await Promise.all([
      this.prisma.tenantMembership.findFirst({
        where: { userId: user.id, status: MEMBERSHIP_STATUS.ACTIVE },
        select: { roleKey: true, roleId: true, tenantId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.platformMembership.findFirst({
        where: { userId: user.id, status: MEMBERSHIP_STATUS.ACTIVE },
        select: { roleKey: true, roleId: true },
      }),
    ]);

    const tenantPermissions: readonly Permission[] = tenantMembership
      ? await this.rbac.permissionsForTenantMember(
          tenantMembership.roleKey as never,
          tenantMembership.roleId,
          tenantMembership.tenantId,
        )
      : [];

    const platformPermissions: readonly Permission[] = platformMembership
      ? await this.rbac.permissionsForPlatformMember(
          platformMembership.roleKey as never,
          platformMembership.roleId,
        )
      : [];

    return {
      tenantRole: tenantMembership?.roleKey ?? null,
      platformRole: platformMembership?.roleKey ?? null,
      permissions: [...new Set([...tenantPermissions, ...platformPermissions])],
    };
  }
}
