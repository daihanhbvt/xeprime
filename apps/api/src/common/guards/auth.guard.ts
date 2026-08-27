import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODE, USER_STATUS } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../modules/auth/session.service';
import { NativeSessionService } from '../../modules/auth/native-session.service';
import { IS_PUBLIC_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Xác thực mọi request — hai đường vận chuyển, MỘT nguồn sự thật về quyền.
 *
 *  - **Cookie** `xp_session` — web (ADR 0002). Không đổi gì so với trước.
 *  - **`Authorization: Bearer <accessToken>`** — app native (ADR 0017).
 *
 * Guard này được đăng ký GLOBAL: mặc định mọi endpoint đều cần đăng nhập, muốn mở thì phải gắn
 * `@Public()`. Chiều ngược lại (mặc định mở, nhớ khoá từng cái) là cách quên một endpoint là lộ
 * dữ liệu.
 *
 * Dù đi đường nào, quyền và tenant scope KHÔNG bao giờ đến từ token — chúng đọc từ DB ở
 * `PermissionsGuard`/`AuthService.me` mỗi request (ADR 0002 ràng buộc 1, ADR 0017 §1).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      this.sessions.cookieName
    ];
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

    const { userId, sessionId } = bearerToken
      ? await this.resolveBearer(bearerToken)
      : { ...this.resolveCookie(cookieToken as string) };

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        phoneVerifiedAt: true,
        status: true,
      },
    });

    // Token còn hạn nhưng user đã bị khoá/xoá — phải chặn ngay, không đợi token hết hạn.
    if (!user || user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Tài khoản không còn hiệu lực',
      });
    }

    req.user = {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      phoneVerified: user.phoneVerifiedAt !== null,
      sessionId,
    };

    return true;
  }

  private resolveCookie(token: string): { userId: string; sessionId: string } {
    const payload = this.sessions.verify(token);
    return { userId: payload.sub, sessionId: payload.sid };
  }

  /**
   * Bearer: chữ ký + `aud` + `typ` (thuần) rồi **phiên còn sống không** (tra DB).
   *
   * Phép tra DB thứ hai này là lý do access token dám sống 15 phút: `logout` hoặc phát hiện replay
   * giết phiên, và request ngay sau đó bị chặn dù token chưa hết hạn.
   */
  private async resolveBearer(token: string): Promise<{ userId: string; sessionId: string }> {
    const payload = this.nativeSessions.verifyAccessToken(token);

    const usable = await this.nativeSessions.isSessionUsable(payload.sid, payload.sub);
    if (!usable) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.SESSION_EXPIRED,
        message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      });
    }

    return { userId: payload.sub, sessionId: payload.sid };
  }
}
