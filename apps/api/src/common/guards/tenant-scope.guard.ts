import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  type Permission,
  type TenantRole,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import { TENANT_SCOPED_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Xác định tenant scope của request — CLAUDE.md mục 6, lằn ranh 1.
 *
 * `tenantId` LUÔN suy ra từ `tenant_memberships` của user đang đăng nhập. Không đọc từ
 * body, query, header hay cookie. Đây là lý do CLAUDE.md cấm API tenant-sensitive nhận
 * `tenant_id` từ client: nếu tin client thì bất kỳ user nào cũng đọc được dữ liệu shop khác.
 *
 * Phase 0 mỗi user chỉ thuộc tối đa 1 tenant. Khi hỗ trợ nhiều tenant, cách đúng là đọc
 * tenant đang chọn từ **session** (server-side), vẫn không phải từ request body.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Guard chạy global cho mọi request; chỉ giải scope khi endpoint được đánh dấu.
    const isTenantScoped = this.reflector.getAllAndOverride<boolean>(TENANT_SCOPED_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!isTenantScoped) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();

    if (!req.user) {
      throw new ForbiddenException({ code: API_ERROR_CODE.UNAUTHENTICATED });
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: req.user.id, status: MEMBERSHIP_STATUS.ACTIVE },
      select: {
        roleKey: true,
        roleId: true,
        tenant: { select: { id: true, status: true, deletedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership || membership.tenant.deletedAt !== null) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.NO_TENANT_SCOPE,
        message: 'Tài khoản chưa thuộc gian hàng nào',
      });
    }

    const permissions: readonly Permission[] = await this.rbac.permissionsForTenantMember(
      membership.roleKey as TenantRole,
      membership.roleId,
      membership.tenant.id,
    );

    req.tenant = {
      tenantId: membership.tenant.id,
      tenantStatus: membership.tenant.status,
      roleKey: membership.roleKey as TenantRole,
      permissions,
    };

    return true;
  }
}
