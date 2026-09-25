import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  SUPPORT_CONTEXT_HEADER,
  type Permission,
  type TenantRole,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import { TenantSupportService } from '../../modules/tenant-support/tenant-support.service';
import {
  PLATFORM_ONLY_KEY,
  SUPPORT_ACTION_KEY,
  TENANT_SCOPED_KEY,
  type SupportActionResolver,
} from '../decorators';
import { buildTenantContext, tenantContextSelect } from '../plan/tenant-context';
import type { SupportCapability } from '@xeprime/types';
import type { RequestContext } from '../types/request-context';

/**
 * Xác định tenant scope của request — CLAUDE.md mục 6, lằn ranh 1.
 *
 * `tenantId` LUÔN suy ra từ `tenant_memberships` của user đang đăng nhập. Không đọc từ
 * body, query, header hay cookie. Đây là lý do CLAUDE.md cấm API tenant-sensitive nhận
 * `tenant_id` từ client: nếu tin client thì bất kỳ user nào cũng đọc được dữ liệu shop khác.
 *
 * NGOẠI LỆ DUY NHẤT — phiên hỗ trợ của nhân sự nền tảng (ADR 0050). Header `x-support-context`
 * mang ID PHIÊN, không mang tenant: tenant đến từ bản ghi phiên sau khi `TenantSupportService`
 * kiểm người mở + phiên đăng nhập + hạn + quyền nền tảng còn hiệu lực. Và endpoint phải TỰ khai
 * `@SupportAction(...)` — không khai là từ chối, trước khi chạm DB.
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
    private readonly support: TenantSupportService,
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

    const supportHeader = req.headers[SUPPORT_CONTEXT_HEADER];
    if (supportHeader !== undefined) {
      return this.activateSupport(ctx, req, supportHeader);
    }

    const now = new Date();
    /*
     * Trục năng lực (ADR 0027) đi kèm CHÍNH truy vấn membership này, không phải một lượt gọi
     * `BillingService` riêng: guard chạy cho mọi request tenant-scoped, nên một truy vấn nữa mỗi
     * request sẽ đẻ ra nhu cầu cache — mà cache chính là thứ phá ADR 0027 điều 5 (gia hạn xong
     * phải mở lại NGAY). Nested `take: 1` khiến Postgres chỉ lấy dòng gói hiện hành.
     */
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: req.user.id, status: MEMBERSHIP_STATUS.ACTIVE },
      select: {
        roleKey: true,
        roleId: true,
        tenant: { select: tenantContextSelect(now) },
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

    req.tenant = buildTenantContext(
      membership.tenant,
      now,
      membership.roleKey as TenantRole,
      permissions,
    );

    return true;
  }

  /**
   * Nhánh phiên hỗ trợ. Thứ tự kiểm là thứ tự RẺ → ĐẮT, và mọi nhánh từ chối đều 403:
   *
   *  1. Endpoint có khai `@SupportAction` không, và nó KHÔNG phải endpoint nền tảng — không khai
   *     là từ chối mà không đọc DB (default-deny).
   *  2. Thân request có hợp lệ với phiên hỗ trợ không (hàm suy capability, vd. danh sách trường).
   *  3. Phiên: tồn tại, của đúng người, đúng phiên đăng nhập, chưa hết hạn/thoát, người mở vẫn
   *     là nhân sự nền tảng đang hoạt động và còn quyền — `TenantSupportService.resolve`.
   *  4. Capability endpoint đòi nằm trong bộ CÒN HIỆU LỰC của phiên.
   */
  private async activateSupport(
    ctx: ExecutionContext,
    req: RequestContext,
    rawHeader: string | string[],
  ): Promise<boolean> {
    // CHỈ cấp handler: một `@SupportAction` đặt nhầm ở class sẽ mở mọi route của controller (kể cả
    // POST/DELETE) cho phiên — đúng thứ "mỗi endpoint tự khai" (ADR 0050 điều 3) sinh ra để chặn.
    const declared = this.reflector.get<SupportCapability | SupportActionResolver | undefined>(
      SUPPORT_ACTION_KEY,
      ctx.getHandler(),
    );
    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!declared || platformOnly) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED,
        message: 'Thao tác này không mở trong không gian hỗ trợ gian hàng',
      });
    }

    let required: readonly SupportCapability[];
    if (typeof declared === 'function') {
      const resolved = declared(req);
      if ('denied' in resolved) {
        throw new ForbiddenException({
          code: resolved.code,
          message: resolved.message,
          ...(resolved.details ? { details: resolved.details } : {}),
        });
      }
      required = resolved;
    } else {
      required = [declared];
    }

    // Header lặp (`x-support-context: a, b` hay hai dòng) là một request dị dạng, không phải một
    // lựa chọn — không đoán cái nào là thật.
    const contextId = Array.isArray(rawHeader) ? null : rawHeader.trim();
    const now = new Date();
    const resolved = await this.support.resolve(contextId, req.user!, now);

    const missing = required.find((c) => !resolved.support.capabilities.includes(c));
    if (missing) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED,
        message: 'Phiên hỗ trợ không được cấp quyền cho thao tác này',
        details: { capability: missing },
      });
    }

    req.tenant = resolved.tenant;
    this.support.bindRequest(resolved.support, required.length > 0 ? required.join(',') : null);
    return true;
  }
}
