import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  SUPPORT_CONTEXT_HEADER,
  type AccountRealm,
} from '@xeprime/types';
import { IS_PUBLIC_KEY, REALMS_KEY, SUPPORT_ACTION_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Ranh giới REALM của từng route — ADR 0053 điều 5. Chạy ngay sau `AuthGuard`, trước mọi guard
 * scope/quyền và trước khi chạm DB.
 *
 *  1. Route không khai `@Realms(...)` ⇒ từ chối. Default-deny: một controller mới quên khai thì
 *     không ai dùng được, chứ không phải mọi realm dùng được.
 *  2. Phiên đã đăng nhập phải thuộc một realm khai báo (`req.user.realm` — `AuthGuard` đã bảo đảm
 *     nó bằng realm của request).
 *  3. Route `@Public()` không có phiên: chỉ chặn khi realm của request XÁC ĐỊNH được mà không nằm
 *     trong danh sách. Request công khai của app native không mang realm (realm của native là
 *     phiên) — chúng đi tiếp như mọi request công khai.
 *
 * Ngoại lệ DUY NHẤT: phiên hỗ trợ gian hàng của nhân sự nền tảng (ADR 0050). Tài khoản `platform`
 * gọi route của `partner` CHỈ khi request mang `x-support-context` VÀ handler tự khai
 * `@SupportAction(...)`. `TenantScopeGuard` sau đó mới xác minh phiên — guard này không mở thêm
 * gì ngoài việc cho request đó đi tới đúng cổng kiểm của nó.
 */
@Injectable()
export class RealmGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;

    const declared = this.reflector.getAllAndOverride<AccountRealm[] | undefined>(REALMS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!declared || declared.length === 0) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.REALM_NOT_ALLOWED,
        message: 'Route chưa khai không gian tài khoản phục vụ',
      });
    }

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const realm = req.user?.realm ?? req.realm;

    if (!realm) {
      // Route không công khai mà không có phiên thì AuthGuard đã ném 401 rồi.
      return true;
    }
    if (declared.includes(realm)) return true;

    if (this.isSupportAssist(ctx, req, realm, declared)) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    throw new ForbiddenException({
      code: API_ERROR_CODE.REALM_NOT_ALLOWED,
      message: isPublic
        ? 'Chức năng này không có ở site đang dùng'
        : 'Tài khoản này không dùng được chức năng này',
    });
  }

  private isSupportAssist(
    ctx: ExecutionContext,
    req: RequestContext,
    realm: AccountRealm,
    declared: readonly AccountRealm[],
  ): boolean {
    if (realm !== ACCOUNT_REALM.PLATFORM || !req.user) return false;
    if (!declared.includes(ACCOUNT_REALM.PARTNER)) return false;
    if (req.headers[SUPPORT_CONTEXT_HEADER] === undefined) return false;
    // CHỈ cấp handler — cùng kỷ luật với `TenantScopeGuard.activateSupport` (ADR 0050 điều 3).
    return this.reflector.get(SUPPORT_ACTION_KEY, ctx.getHandler()) !== undefined;
  }
}
