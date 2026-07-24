import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  type Permission,
  type PlatformRole,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import { PLATFORM_ONLY_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Giải platform scope cho endpoint gắn `@PlatformOnly()` — set `req.platform` để PermissionGuard
 * kiểm tra quyền nền tảng.
 *
 * Song song với TenantScopeGuard nhưng nguồn là `platform_memberships`, KHÔNG dùng chung guard
 * với API tenant (security rule). Chạy global TRƯỚC PermissionGuard: guard controller chạy sau
 * guard global nên không kịp nạp scope (đúng bài học từ bug guard order của tenant).
 */
@Injectable()
export class PlatformScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPlatformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!isPlatformOnly) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.user) {
      throw new ForbiddenException({ code: API_ERROR_CODE.UNAUTHENTICATED });
    }

    const membership = await this.prisma.platformMembership.findFirst({
      where: { userId: req.user.id, status: MEMBERSHIP_STATUS.ACTIVE },
      select: { roleKey: true, roleId: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.FORBIDDEN,
        message: 'Endpoint chỉ dành cho nhân sự nền tảng',
      });
    }

    const permissions: readonly Permission[] = await this.rbac.permissionsForPlatformMember(
      membership.roleKey as PlatformRole,
      membership.roleId,
    );

    req.platform = {
      roleKey: membership.roleKey as PlatformRole,
      permissions,
    };

    return true;
  }
}
