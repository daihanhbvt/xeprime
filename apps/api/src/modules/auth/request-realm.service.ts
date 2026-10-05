import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ACCOUNT_REALM, ACCOUNT_REALM_HEADER, isAccountRealm, type AccountRealm } from '@xeprime/types';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * Header Caddy gắn kèm header realm, mang `REALM_PROXY_SECRET`. Chỉ API và Caddy biết tên này —
 * client không bao giờ gửi nó, nên nó không nằm ở `@xeprime/types`.
 */
export const REALM_PROXY_SECRET_HEADER = 'x-xp-proxy-secret';

/**
 * Realm của một request WEB, và URL site của từng realm — ADR 0053 điều 4.
 *
 * MỘT chỗ quyết định, vì ba nơi cần cùng một câu trả lời: `AuthGuard` (chọn cookie nào, so realm
 * của tài khoản), `resolveOptionalUserId` (endpoint công khai), và các endpoint đăng nhập/đăng ký
 * công khai (tài khoản mới thuộc realm nào).
 *
 * Realm KHÔNG đến từ client ở môi trường đã triển khai:
 *   - Caddy gắn `x-xp-realm` theo HOST của site và kèm `x-xp-proxy-secret`;
 *   - API tin header realm chỉ khi khoá khớp (so thời gian hằng). Thiếu/sai khoá ⇒ realm `null`,
 *     tức request web không đăng nhập được bằng cookie — kể cả khi ai đó gọi thẳng
 *     `api.xeprime.vn` (site của app mobile) với header tự khai.
 *   - Máy dev (chế độ `path`, ba khu chung `localhost:3000`) bật `REALM_HEADER_FROM_CLIENT`: web
 *     app gắn realm theo khu của trang. Env schema chặn cờ này ở môi trường đã triển khai.
 *
 * Request native (Bearer) KHÔNG đi qua đây: realm của nó là app đã đăng nhập (`client_app`).
 */
@Injectable()
export class RequestRealmService {
  private readonly trustClientHeader: boolean;
  private readonly proxySecret: Buffer | null;
  private readonly siteUrls: Readonly<Record<AccountRealm, string>>;

  constructor(config: ConfigService) {
    this.trustClientHeader = config.get<boolean>('REALM_HEADER_FROM_CLIENT') === true;
    const secret = config.get<string>('REALM_PROXY_SECRET');
    this.proxySecret = secret ? Buffer.from(secret, 'utf8') : null;
    this.siteUrls = {
      [ACCOUNT_REALM.CUSTOMER]: trimSlash(config.getOrThrow<string>('APP_WEB_URL')),
      [ACCOUNT_REALM.PARTNER]: trimSlash(config.getOrThrow<string>('WEB_PARTNER_URL')),
      [ACCOUNT_REALM.PLATFORM]: trimSlash(config.getOrThrow<string>('WEB_ADMIN_URL')),
    };
  }

  /** Realm của request web; `null` khi header thiếu, sai giá trị, hoặc không qua được khoá proxy. */
  webRealmOf(req: Pick<Request, 'headers'>): AccountRealm | null {
    const raw = singleHeader(req.headers[ACCOUNT_REALM_HEADER]);
    if (!isAccountRealm(raw)) return null;
    if (this.trustClientHeader) return raw;
    if (!this.proxySecret) return null;

    const provided = singleHeader(req.headers[REALM_PROXY_SECRET_HEADER]);
    if (!provided) return null;
    const candidate = Buffer.from(provided, 'utf8');
    if (candidate.length !== this.proxySecret.length) return null;
    return timingSafeEqual(candidate, this.proxySecret) ? raw : null;
  }

  /**
   * URL gốc của site một realm — gồm cả tiền tố khu ở chế độ `path` (vd
   * `http://localhost:3000/manage`). Link trong email dựng từ đây: `${webUrlFor(r)}/reset-password`.
   */
  webUrlFor(realm: AccountRealm): string {
    return this.siteUrls[realm];
  }

  /**
   * ORIGIN của site một realm — đích so khớp của phép chặn CSRF theo `Origin`, và gốc của các
   * route `/api/*` cùng origin (callback OAuth web nằm ở `${siteOrigin}/api/auth/social/...`).
   */
  siteOrigin(realm: AccountRealm): string {
    return new URL(this.siteUrls[realm]).origin;
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Header lặp (`a, b` hay hai dòng) là request dị dạng, không phải một lựa chọn — không đoán. */
function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.includes(',') ? trimmed : null;
}
