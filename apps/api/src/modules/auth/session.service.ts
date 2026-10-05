import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE, resolveSessionCookieName, type AccountRealm } from '@xeprime/types';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import { ulid } from 'ulid';

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
  /** sessionId — để revoke từng thiết bị */
  sid: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService) {}

  private get secret(): string {
    return this.config.getOrThrow<string>('SESSION_JWT_SECRET');
  }

  private get ttlDays(): number {
    return this.config.getOrThrow<number>('SESSION_TTL_DAYS');
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

  issue(userId: string): { token: string; sessionId: string } {
    const sessionId = ulid();
    const token = jwt.sign({ sub: userId, sid: sessionId } satisfies SessionPayload, this.secret, {
      expiresIn: `${this.ttlDays}d`,
      issuer: 'xeprime-api',
    });
    return { token, sessionId };
  }

  verify(token: string): SessionPayload {
    try {
      const decoded = jwt.verify(token, this.secret, { issuer: 'xeprime-api' });
      if (typeof decoded === 'string' || !decoded.sub || !('sid' in decoded)) {
        throw new Error('payload thiếu trường bắt buộc');
      }

      /*
       * Token của app NATIVE không được đi qua đường cookie — ADR 0017 §5.
       *
       * Hai họ token cùng secret và cùng issuer, nên chữ ký của access token native hợp lệ ở
       * đây. Nhưng đường cookie KHÔNG tra `native_auth_sessions.revoked_at`: nhận nó nghĩa là
       * một access token của thiết bị ĐÃ ĐĂNG XUẤT vẫn dùng được tới khi hết hạn, chỉ cần
       * chuyển từ header sang cookie. Đó là đúng thứ việc thu hồi theo thiết bị tồn tại để chặn.
       *
       * Nhận diện bằng SỰ CÓ MẶT của `typ`/`aud` — session cookie của web không có cả hai, nên
       * luật này không đụng token nào đang lưu hành.
       */
      if ('typ' in decoded || decoded.aud !== undefined) {
        throw new Error('token native không dùng được ở đường cookie');
      }

      return { sub: String(decoded.sub), sid: String(decoded.sid) };
    } catch (err) {
      const expired = err instanceof jwt.TokenExpiredError;
      throw new UnauthorizedException({
        code: expired ? API_ERROR_CODE.SESSION_EXPIRED : API_ERROR_CODE.UNAUTHENTICATED,
        message: expired ? 'Phiên đăng nhập đã hết hạn' : 'Phiên đăng nhập không hợp lệ',
      });
    }
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
      maxAge: this.ttlDays * 24 * 60 * 60 * 1000,
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
