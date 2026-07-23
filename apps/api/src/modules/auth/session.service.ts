import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE } from '@xeprime/types';
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

  get cookieName(): string {
    return this.config.getOrThrow<string>('SESSION_COOKIE_NAME');
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
   * `sameSite: lax` chặn CSRF cho request điều hướng; request ghi cross-site vẫn cần
   * CSRF token khi web và API khác origin (ADR 0002 ràng buộc 3).
   */
  private cookieOptions(): CookieOptions {
    const domain = this.config.get<string>('SESSION_COOKIE_DOMAIN');
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
      sameSite: 'lax',
      path: '/',
      maxAge: this.ttlDays * 24 * 60 * 60 * 1000,
      ...(domain ? { domain } : {}),
    };
  }

  attach(res: Response, token: string): void {
    res.cookie(this.cookieName, token, this.cookieOptions());
  }

  clear(res: Response): void {
    const { maxAge: _maxAge, ...rest } = this.cookieOptions();
    res.clearCookie(this.cookieName, rest);
  }
}
