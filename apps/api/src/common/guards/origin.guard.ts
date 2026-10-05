import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE } from '@xeprime/types';
import { RequestRealmService } from '../../modules/auth/request-realm.service';
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
 * KHÔNG áp cho:
 *  - Bearer (app native) — không có cookie để mượn, nên không có CSRF;
 *  - request không có phiên (webhook SePay, đăng nhập/đăng ký công khai) — không có quyền nào để
 *    bị mượn.
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
    if (!req.user || req.user.transport !== 'cookie') return true;
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    const expected = this.realms.siteOrigin(req.user.realm);
    const actual = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    if (actual !== null && (actual === expected || this.devOrigins.has(actual))) return true;

    throw new ForbiddenException({
      code: API_ERROR_CODE.ORIGIN_NOT_ALLOWED,
      message: 'Yêu cầu không đến từ đúng trang của XePrime',
    });
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
