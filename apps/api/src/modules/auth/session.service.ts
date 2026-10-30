import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  SESSION_TTL_DAYS,
  resolveSessionCookieName,
  type AccountRealm,
} from '@xeprime/types';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import { ulid } from 'ulid';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Payload của session JWT — ADR 0002.
 *
 * CỐ Ý chỉ có `sub` và `sid`. KHÔNG nhét role/permission/tenantId vào đây: token sống 7
 * ngày, nên nếu quyền nằm trong token thì thu hồi quyền hoặc khoá tenant sẽ không có
 * hiệu lực cho tới khi token hết hạn. Quyền luôn đọc từ DB mỗi request.
 */
export interface SessionPayload {
  /** userId */
  sub: string;
  /** `web_sessions.id` — thu hồi theo từng lần đăng nhập (ADR 0076). */
  sid: string;
}

/** Lý do thu hồi phiên web — khớp CHECK `web_sessions_revoked_reason_check`. */
export const WEB_REVOKE_REASON = {
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET: 'password_reset',
  USER_DISABLED: 'user_disabled',
} as const;

export type WebRevokeReason = (typeof WEB_REVOKE_REASON)[keyof typeof WEB_REVOKE_REASON];

const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Phiên cookie của web — ADR 0002, thu hồi được từ ADR 0076.
 *
 * Writer DUY NHẤT của `web_sessions`. Cookie là JWT (chữ ký chứng minh `sub`/`sid` do API phát),
 * nhưng chữ ký thôi không đủ: `sid` phải trỏ vào một hàng còn sống. Đó là thứ làm cho đăng xuất,
 * đổi mật khẩu và đặt lại mật khẩu có hiệu lực NGAY với cookie đã bị lấy cắp.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get secret(): string {
    return this.config.getOrThrow<string>('SESSION_JWT_SECRET');
  }

  /**
   * Tên cookie phiên của MỘT realm — ADR 0053 điều 4. Cùng công thức với web proxy
   * (`resolveSessionCookieName` ở @xeprime/types), không gõ tên ở đâu khác.
   */
  cookieName(realm: AccountRealm): string {
    return resolveSessionCookieName(
      { SESSION_COOKIE_NAME: this.config.getOrThrow<string>('SESSION_COOKIE_NAME') },
      realm,
    );
  }

  /** Mở một phiên mới: ghi hàng `web_sessions` TRƯỚC rồi mới ký cookie trỏ vào nó. */
  async issue(userId: string): Promise<{ token: string; sessionId: string }> {
    const sessionId = ulid();
    await this.prisma.webSession.create({
      data: { id: sessionId, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    const token = jwt.sign({ sub: userId, sid: sessionId } satisfies SessionPayload, this.secret, {
      expiresIn: `${SESSION_TTL_DAYS}d`,
      issuer: 'xeprime-api',
    });
    return { token, sessionId };
  }

  /** Chữ ký + hình dạng của cookie — CHƯA tra DB. Dùng `isSessionUsable` để biết phiên còn sống. */
  verify(token: string): SessionPayload {
    try {
      const decoded = jwt.verify(token, this.secret, { issuer: 'xeprime-api' });
      if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sid !== 'string') {
        throw new Error('payload thiếu trường bắt buộc');
      }

      /*
       * Token của app NATIVE không được đi qua đường cookie — ADR 0017 §5.
       *
       * Hai họ token cùng secret và cùng issuer, nên chữ ký của access token native hợp lệ ở
       * đây. Nhận diện bằng SỰ CÓ MẶT của `typ`/`aud` — session cookie của web không có cả hai.
       * (Từ ADR 0076 `sid` của native cũng không có hàng trong `web_sessions`, nên đây là lớp
       * chặn thứ hai chứ không còn là lớp duy nhất.)
       */
      if ('typ' in decoded || decoded.aud !== undefined) {
        throw new Error('token native không dùng được ở đường cookie');
      }

      return { sub: String(decoded.sub), sid: decoded.sid };
    } catch (err) {
      const expired = err instanceof jwt.TokenExpiredError;
      throw new UnauthorizedException({
        code: expired ? API_ERROR_CODE.SESSION_EXPIRED : API_ERROR_CODE.UNAUTHENTICATED,
        message: expired ? 'Phiên đăng nhập đã hết hạn' : 'Phiên đăng nhập không hợp lệ',
      });
    }
  }

  /**
   * Phiên còn hiệu lực không — tra DB (ADR 0076).
   *
   * Cookie phát trước ADR 0076 không có hàng nào ⇒ `false`: người dùng đăng nhập lại một lần. Không
   * có ngoại lệ "token cũ thì tin" — đó chính là loại token không ai thu hồi được.
   */
  async isSessionUsable(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.webSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return session !== null;
  }

  /**
   * Chữ ký hợp lệ VÀ phiên còn sống — hoặc ném 401. Một phép gọi cho `AuthGuard`.
   *
   * Phiên bị thu hồi trả `SESSION_EXPIRED` (không phải `UNAUTHENTICATED`): với người dùng, "bạn đã
   * bị đăng xuất ở thiết bị này" và "phiên hết hạn" là cùng một việc phải làm — đăng nhập lại.
   */
  async verifyUsable(token: string): Promise<SessionPayload> {
    const payload = this.verify(token);
    if (!(await this.isSessionUsable(payload.sid, payload.sub))) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.SESSION_EXPIRED,
        message: 'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại',
      });
    }
    return payload;
  }

  /** Thu hồi MỘT phiên (đăng xuất). Idempotent; phiên lạ/đã chết thì không làm gì. */
  async revoke(sessionId: string, reason: WebRevokeReason): Promise<void> {
    await this.prisma.webSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Thu hồi MỌI phiên web còn sống của một user — trừ `exceptSessionId` nếu có (đổi mật khẩu giữ
   * lại chính phiên đang thao tác). Nhận `tx` để đi chung transaction với lượt đổi mật khẩu:
   * mật khẩu mới mà phiên cũ còn sống là đúng nửa việc.
   */
  async revokeAllForUser(
    userId: string,
    reason: WebRevokeReason,
    options: { exceptSessionId?: string | undefined; tx?: Prisma.TransactionClient } = {},
  ): Promise<void> {
    const db = options.tx ?? this.prisma;
    await db.webSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * `httpOnly` là điểm mấu chốt: XSS không đọc được cookie này.
   *
   * HOST-ONLY (không đặt `domain`) — ADR 0053 điều 4. API phục vụ cùng origin dưới `/api` của từng
   * site, nên cookie do `partner.xeprime.vn/api` phát chỉ quay lại `partner.xeprime.vn`: trình duyệt
   * không bao giờ gửi nó sang site khách hay site admin. Đặt `domain` là mở lại đúng cái cửa ADR
   * 0053 đóng — vì vậy `SESSION_COOKIE_DOMAIN` bị env schema từ chối.
   *
   * `sameSite: lax` + cùng origin + phép chặn `Origin` cho request ghi (`OriginGuard`) là ba lớp
   * chống CSRF (ADR 0002 ràng buộc 3 — nhánh "cùng domain").
   */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS,
    };
  }

  attach(res: Response, token: string, realm: AccountRealm): void {
    res.cookie(this.cookieName(realm), token, this.cookieOptions());
  }

  clear(res: Response, realm: AccountRealm): void {
    const { maxAge: _maxAge, ...rest } = this.cookieOptions();
    res.clearCookie(this.cookieName(realm), rest);
  }
}
