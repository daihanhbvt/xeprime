import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODE, USER_STATUS, type AccountRealm } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../modules/auth/session.service';
import { NativeSessionService } from '../../modules/auth/native-session.service';
import { RequestRealmService } from '../../modules/auth/request-realm.service';
import { IS_PUBLIC_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Xác thực mọi request — hai đường vận chuyển, MỘT nguồn sự thật về quyền.
 *
 *  - **Cookie** — web (ADR 0002). Từ ADR 0053 mỗi realm một tên cookie, và guard chỉ đọc đúng
 *    cookie của realm request (realm do proxy quyết — `RequestRealmService`). Từ ADR 0076 `sid`
 *    của cookie phải trỏ vào một phiên còn sống ở `web_sessions`.
 *  - **`Authorization: Bearer <accessToken>`** — app native (ADR 0017). Realm là app của phiên.
 *
 * Guard này được đăng ký GLOBAL: mặc định mọi endpoint đều cần đăng nhập, muốn mở thì phải gắn
 * `@Public()`. Chiều ngược lại (mặc định mở, nhớ khoá từng cái) là cách quên một endpoint là lộ
 * dữ liệu.
 *
 * Dù đi đường nào, quyền và tenant scope KHÔNG bao giờ đến từ token — chúng đọc từ DB ở
 * `PermissionsGuard`/`AuthService.me` mỗi request (ADR 0002 ràng buộc 1, ADR 0017 §1).
 *
 * **Ranh giới realm (ADR 0053 điều 4):** tài khoản của realm này đi vào request của realm kia ⇒
 * 401 như phiên không tồn tại. "Realm của request" là realm của SITE khi request đi qua một site
 * web — áp cho cả Bearer, không chỉ cookie. Không phải 403: với site partner, tài khoản khách cùng số điện
 * thoại là một người LẠ, và câu trả lời đúng cho người lạ là "chưa đăng nhập".
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
    private readonly realms: RequestRealmService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const webRealm = this.realms.webRealmOf(req);
    // Gắn cả ở endpoint công khai: đăng nhập/đăng ký trên web cần biết tài khoản thuộc realm nào.
    if (webRealm) req.realm = webRealm;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    // Không xác định được realm web ⇒ không có cookie nào để đọc. Đây cũng là đường của mọi
    // request mang cookie tới `api.xeprime.vn` (site của app mobile): Caddy không gắn realm ở đó.
    const cookieToken = webRealm
      ? (req.cookies as Record<string, string> | undefined)?.[this.sessions.cookieName(webRealm)]
      : undefined;
    /*
     * Header sai dạng NÉM ngay tại đây (`parseBearer`), không rơi về cookie: một client gửi
     * `Authorization: <token>` thiếu scheme mà vẫn được phục vụ bằng cookie là một client không
     * bao giờ biết mình đang gửi sai.
     */
    const bearerToken = NativeSessionService.parseBearer(req.headers.authorization);

    /*
     * Hai credential cùng lúc ⇒ TỪ CHỐI, không chọn bên nào.
     *
     * Nếu guard có thứ tự ưu tiên thì thứ tự đó quyết định danh tính, và đó là chỗ để lợi dụng:
     * đính một Bearer token của tài khoản khác vào một request mang cookie của mình (hoặc ngược
     * lại) rồi xem tầng nào thắng. Không đoán là cách duy nhất không đoán sai.
     */
    if (cookieToken && bearerToken) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Request mang cả session cookie và Bearer token — chỉ dùng một cách xác thực',
      });
    }

    if (!cookieToken && !bearerToken) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Chưa đăng nhập',
      });
    }

    const { userId, sessionId, realm } = bearerToken
      ? await this.resolveBearer(bearerToken)
      : await this.resolveCookie(cookieToken as string, webRealm as AccountRealm);

    /*
     * Request đi qua `/api` của một SITE web thì phiên phải thuộc đúng realm của site đó.
     *
     * Cookie tự bảo đảm điều này (guard chỉ đọc cookie mang tên realm của site). Bearer thì mang
     * realm của app đã đăng nhập, nên phải so tường minh: thiếu phép so, token app Partner gọi
     * `xeprime.vn/api/vehicles` vẫn chạy và `/api` của site khách thành cửa thứ hai vào API quản
     * lý. Host API của app native không mang realm web (Caddy xoá header) nên không bị đụng tới.
     */
    if (webRealm && realm !== webRealm) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Phiên đăng nhập không thuộc trang này',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        realm: true,
        displayName: true,
        email: true,
        phoneVerifiedAt: true,
        status: true,
      },
    });

    // Token còn hạn nhưng user đã bị khoá/xoá — phải chặn ngay, không đợi token hết hạn. Và tài
    // khoản thuộc realm KHÁC realm của request là một người không có phiên ở đây.
    if (!user || user.status !== USER_STATUS.ACTIVE || user.realm !== realm) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Tài khoản không còn hiệu lực',
      });
    }

    req.realm = realm;
    req.user = {
      id: user.id,
      realm,
      displayName: user.displayName,
      email: user.email,
      phoneVerified: user.phoneVerifiedAt !== null,
      sessionId,
      transport: bearerToken ? 'bearer' : 'cookie',
    };

    return true;
  }

  /**
   * Cookie: chữ ký rồi **phiên còn sống không** (tra `web_sessions` — ADR 0076). Không có bước tra
   * thì đăng xuất chỉ là xoá cookie trên MỘT trình duyệt, còn bản bị lấy cắp sống đủ 7 ngày.
   */
  private async resolveCookie(
    token: string,
    realm: AccountRealm,
  ): Promise<{ userId: string; sessionId: string; realm: AccountRealm }> {
    const payload = await this.sessions.verifyUsable(token);
    return { userId: payload.sub, sessionId: payload.sid, realm };
  }

  /**
   * Bearer: chữ ký + `aud` + `typ` (thuần) rồi **phiên còn sống không** (tra DB).
   *
   * Phép tra DB thứ hai này là lý do access token dám sống 15 phút: `logout` hoặc phát hiện replay
   * giết phiên, và request ngay sau đó bị chặn dù token chưa hết hạn. Cùng lượt tra đó trả luôn
   * realm của phiên (app đã đăng nhập).
   */
  private async resolveBearer(
    token: string,
  ): Promise<{ userId: string; sessionId: string; realm: AccountRealm }> {
    const payload = this.nativeSessions.verifyAccessToken(token);

    const realm = await this.nativeSessions.usableSessionRealm(payload.sid, payload.sub);
    if (!realm) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.SESSION_EXPIRED,
        message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      });
    }

    return { userId: payload.sub, sessionId: payload.sid, realm };
  }
}
