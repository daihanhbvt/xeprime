import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODE, type Permission } from '@xeprime/types';
import { PERMISSIONS_KEY, PLATFORM_ONLY_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Kiểm tra permission key mà endpoint đòi hỏi — CLAUDE.md mục 3: guard backend là nguồn
 * bảo vệ chính. `usePermissions()` ở frontend chỉ để ẩn/hiện menu, không phải bảo vệ.
 *
 * Quyền lấy từ `req.tenant` / `req.platform`, tức là đã đọc từ DB trong guard trước đó —
 * không phải từ token (ADR 0002).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const req = ctx.switchToHttp().getRequest<RequestContext>();

    if (platformOnly && !req.platform) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.FORBIDDEN,
        message: 'Endpoint chỉ dành cho nhân sự nền tảng',
      });
    }

    if (!required || required.length === 0) return true;

    const granted = new Set<string>([
      ...(req.tenant?.permissions ?? []),
      ...(req.platform?.permissions ?? []),
    ]);

    const missing = required.filter((p) => !granted.has(p));

    if (missing.length > 0) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.MISSING_PERMISSION,
        message: 'Không đủ quyền thực hiện thao tác này',
        details: { missing },
      });
    }

    return true;
  }
}
