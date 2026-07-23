import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission } from '@xeprime/types';
import { API_ERROR_CODE } from '@xeprime/types';
import type { AuthenticatedUser, RequestContext, TenantContext } from '../types/request-context';

/** Endpoint không cần đăng nhập. Mặc định MỌI endpoint đều cần — đây là opt-out có chủ đích. */
export const IS_PUBLIC_KEY = 'xeprime:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permission key mà endpoint đòi hỏi. PermissionGuard đọc metadata này. */
export const PERMISSIONS_KEY = 'xeprime:permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Endpoint chỉ dành cho scope nền tảng, không dùng chung guard với API tenant. */
export const PLATFORM_ONLY_KEY = 'xeprime:platformOnly';
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.user) {
      throw new UnauthorizedException({ code: API_ERROR_CODE.UNAUTHENTICATED });
    }
    return req.user;
  },
);

/**
 * Tenant scope hiện tại.
 *
 * Ném lỗi thay vì trả undefined: controller quên gắn TenantScopeGuard sẽ fail ngay ở
 * request đầu tiên, thay vì âm thầm chạy với `tenantId === undefined` và lộ dữ liệu.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.tenant) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.NO_TENANT_SCOPE,
        message: 'Request chưa có tenant scope — thiếu TenantScopeGuard trên controller?',
      });
    }
    return req.tenant;
  },
);
