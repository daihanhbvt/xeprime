import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE, type AccountRealm } from '@xeprime/types';
import { RequestRealmService } from '../../modules/auth/request-realm.service';
import { SessionService } from '../../modules/auth/session.service';
import type { RequestContext } from '../types/request-context';

/** Phương thức không đổi trạng thái — không cần chặn CSRF. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Chặn CSRF bằng `Origin` — ADR 0002 ràng buộc 3 (nhánh cùng domain) · ADR 0051 điều 6.
 *
 * Áp khi request ĐỔI TRẠNG THÁI và đi bằng COOKIE phiên: `Origin` (hoặc, khi trình duyệt không gửi
 * `Origin`, origin của `Referer`) phải đúng là site của realm đó. Cookie host-only + `sameSite: lax`
 * đã chặn phần lớn; lớp này chặn nốt trang lạ dựng form/fetch nhắm vào chính site đó, và là thứ
 * khiến cookie một mình KHÔNG đủ để thực hiện một thao tác.
 *
 * Vì sao phải đúng site của REALM chứ không chỉ "một site của XePrime": ba site là cùng một
 * "site" theo nghĩa SameSite (cùng `xeprime.vn`), nên cookie `lax` của partner VẪN được gửi kèm một
 * POST mà trang ở `xeprime.vn` bắn sang `partner.xeprime.vn`. CORS chỉ chặn ĐỌC kết quả, không chặn
 * tác dụng phụ — chỉ phép so origin này chặn được nó.
 *
 * Route `@Public()` cũng tính khi request MANG cookie phiên của realm đang gọi: vài route công khai
 * vẫn gắn hành động vào tài khoản đang đăng nhập (`resolveOptionalUser` — vd `POST
 * /auth/phone/verify` ghi SĐT đã xác minh vào chính tài khoản đó), nên cookie ở đó cũng là thứ
 * có thể bị mượn. AuthGuard không gắn `req.user` cho route công khai, vì vậy guard này tự nhìn cookie.
 *
 * KHÔNG áp cho:
 *  - Bearer (app native) — không có cookie để mượn, nên không có CSRF;
 *  - request không mang cookie phiên (webhook SePay, khách vãng lai đăng nhập/đăng ký) — không có
 *    quyền nào để bị mượn.
 *
 * Thiếu cả `Origin` lẫn `Referer` trên một request ghi bằng cookie ⇒ từ chối: trình duyệt hiện đại
 * luôn gửi `Origin` cho POST/PUT/PATCH/DELETE, nên "không có" là dấu hiệu của một client không
 * phải trình duyệt đang mang cookie của người khác.
 *
 * Máy dev (NODE_ENV khác production) nhận thêm các origin ở `CORS_ORIGINS` — mở web qua địa chỉ LAN
 * (`http://192.168.x.x:3000`) để thử trên điện thoại vẫn ghi được. Môi trường đã triển khai thì
 * KHÔNG: ở đó chỉ đúng origin của realm.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly devOrigins: ReadonlySet<string>;

  constructor(
    private readonly realms: RequestRealmService,
    private readonly sessions: SessionService,
    config: ConfigService,
  ) {
    const deployed = config.get<string>('NODE_ENV') === 'production';
    const cors = config.get<string[]>('CORS_ORIGINS') ?? [];
    this.devOrigins = new Set(
      deployed ? [] : cors.map((value) => originOf(value)).filter((o): o is string => o !== null),
    );
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
    const realm = this.cookieRealm(req);
    if (!realm) return true;

    const expected = this.realms.siteOrigin(realm);
    const actual = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    if (actual !== null && (actual === expected || this.devOrigins.has(actual))) return true;

    throw new ForbiddenException({
      code: API_ERROR_CODE.ORIGIN_NOT_ALLOWED,
      message: 'Yêu cầu không đến từ đúng trang của XePrime',
    });
  }

  /** Realm của cookie phiên mà request đang mang, hoặc `null` khi request không đi bằng cookie. */
  private cookieRealm(req: RequestContext): AccountRealm | null {
    if (req.user) return req.user.transport === 'cookie' ? req.user.realm : null;
    // Route công khai: AuthGuard đã gắn `req.realm` (realm của site do proxy quyết) nhưng không đọc phiên.
    if (!req.realm) return null;
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[this.sessions.cookieName(req.realm)] ? req.realm : null;
  }
}

function originOf(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || value.trim() === '' || value === 'null') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
