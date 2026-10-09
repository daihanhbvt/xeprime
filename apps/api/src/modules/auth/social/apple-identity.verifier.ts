import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {
  API_ERROR_CODE,
  MOBILE_APP_BUNDLE_ID,
  NATIVE_IDENTITY_PROVIDER,
  USER_DISPLAY_NAME_MAX_LENGTH,
  type MobileClientApp,
} from '@xeprime/types';
import type { VerifiedIdentity } from './identity';
import { SocialAuthFailure } from './social-auth.error';
import { fetchProviderJson } from './social-provider';

/**
 * Hằng của "Sign in with Apple" — gom MỘT chỗ. `aud` không nằm ở đây: nó là bundle ID của app,
 * nguồn duy nhất `MOBILE_APP_BUNDLE_ID` (`@xeprime/types`). Timeout gọi Apple dùng chung
 * `fetchProviderJson` với Google/Facebook.
 */
const APPLE = {
  ISSUER: 'https://appleid.apple.com',
  KEYS_URL: 'https://appleid.apple.com/auth/keys',
  /** Thuật toán Apple dùng ký `identityToken` — chỉ chấp nhận đúng nó (chặn `alg: none`/HS256). */
  ALGORITHM: 'RS256',
  /** Bộ khoá Apple đổi rất thưa; giữ 6 giờ, chỉ tải lại sớm khi gặp `kid` lạ. */
  KEYS_TTL_MS: 6 * 60 * 60 * 1000,
  /** Một `kid` lạ không được thành một vòng gọi Apple mỗi request — tối đa một lần/phút. */
  UNKNOWN_KID_REFRESH_MS: 60 * 1000,
  /**
   * Tải lại khoá HỎNG trong khi còn bộ cũ: dùng tạm bộ cũ và đợi chừng này mới thử lại — nếu
   * không, mọi lượt đăng nhập sau đó đều thấy "cũ" và cùng chờ timeout của Apple.
   */
  REFRESH_RETRY_MS: 5 * 60 * 1000,
  /** Apple gửi `email_verified` là boolean HOẶC chuỗi này, tuỳ phiên bản token. */
  EMAIL_VERIFIED_STRING: 'true',
  NONCE_HASH: 'sha256',
} as const;

interface AppleClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  is_private_email?: unknown;
  nonce?: unknown;
}

/**
 * Kiểm `identityToken` của "Sign in with Apple" (ADR 0019 mở rộng cho native).
 *
 * Bốn điều PHẢI đúng trước khi tin `sub`:
 *  1. chữ ký RS256 bằng khoá công khai Apple công bố (`kid` khớp);
 *  2. `iss` = Apple, `aud` = bundle ID của ĐÚNG app, còn hạn;
 *  3. `nonce` trong token = SHA-256 của nonce THÔ app gửi kèm — app sinh nonce mỗi lần bấm và chỉ
 *     đưa bản băm cho Apple, nên token nhặt được ở chỗ khác (log iOS, máy khác) thiếu bản thô thì
 *     vô dụng;
 *  4. có `sub` — định danh ổn định của người dùng với team của chúng ta.
 *
 * Giới hạn đã biết: token và nonce thô đi CÙNG một body, nên ai chặn được nguyên body đó (TLS đã
 * vỡ) phát lại được tới `exp` (~10 phút). Chưa lưu nonce đã dùng — cùng mức với luồng mật khẩu.
 *
 * Không cần client secret: đường native không đổi authorization code nào, chỉ kiểm chữ ký.
 */
@Injectable()
export class AppleIdentityVerifier {
  private readonly logger = new Logger(AppleIdentityVerifier.name);
  private keys = new Map<string, KeyObject>();
  private keysFetchedAt = 0;
  private lastUnknownKidRefreshAt = 0;
  private inflight: Promise<void> | null = null;

  async verify(params: {
    identityToken: string;
    rawNonce: string;
    clientApp: MobileClientApp;
    fullName?: { givenName?: string | null; familyName?: string | null } | null;
  }): Promise<VerifiedIdentity> {
    const decoded = jwt.decode(params.identityToken, { complete: true });
    const kid = decoded && typeof decoded === 'object' ? decoded.header.kid : undefined;
    if (!decoded || typeof decoded === 'string' || !kid) {
      throw invalid('identityToken không phải JWT hợp lệ');
    }

    const key = await this.keyFor(kid);
    let claims: AppleClaims;
    try {
      claims = jwt.verify(params.identityToken, key, {
        algorithms: [APPLE.ALGORITHM],
        issuer: APPLE.ISSUER,
        // Token xin cho app XePrime không đổi được phiên app Partner (hai realm — ADR 0053).
        audience: MOBILE_APP_BUNDLE_ID[params.clientApp],
      }) as AppleClaims;
    } catch (error) {
      throw invalid(`identityToken không qua kiểm: ${(error as Error).message}`);
    }

    if (!nonceMatches(params.rawNonce, claims.nonce)) {
      throw invalid('nonce không khớp');
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw invalid('thiếu sub');
    }

    const email =
      typeof claims.email === 'string' && claims.email.length > 0
        ? claims.email.trim().toLowerCase()
        : null;
    const emailVerified =
      email !== null &&
      (claims.email_verified === true || claims.email_verified === APPLE.EMAIL_VERIFIED_STRING);

    return {
      provider: NATIVE_IDENTITY_PROVIDER.APPLE,
      providerUserId: claims.sub,
      email,
      emailVerified,
      phone: null,
      // Apple chỉ trả HỌ TÊN ở lần đăng nhập ĐẦU TIÊN, và qua app chứ không qua token.
      displayName: joinName(params.fullName),
      avatarUrl: null,
    };
  }

  private async keyFor(kid: string): Promise<KeyObject> {
    const stale = Date.now() - this.keysFetchedAt > APPLE.KEYS_TTL_MS;
    if (stale || this.keys.size === 0) await this.refresh();
    let key = this.keys.get(kid);
    if (!key && Date.now() - this.lastUnknownKidRefreshAt > APPLE.UNKNOWN_KID_REFRESH_MS) {
      // Apple vừa xoay khoá: tải lại một lần.
      this.lastUnknownKidRefreshAt = Date.now();
      await this.refresh();
      key = this.keys.get(kid);
    }
    if (!key) throw invalid(`không có khoá Apple cho kid=${kid}`);
    return key;
  }

  /** Gộp các lượt tải đồng thời thành MỘT request tới Apple. */
  private refresh(): Promise<void> {
    this.inflight ??= this.fetchKeys().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchKeys(): Promise<void> {
    let body: unknown;
    try {
      body = await fetchProviderJson(APPLE.KEYS_URL, { method: 'GET' }, 'apple/keys');
    } catch (error) {
      this.logger.warn(`Không tải được khoá Apple: ${(error as Error).message}`);
      // Chưa có bộ nào thì không kiểm được — báo lỗi kết nối provider.
      if (this.keys.size === 0) throw error;
      // Còn bộ cũ: dùng tiếp, và lùi mốc "đã tải" để chỉ thử lại sau REFRESH_RETRY_MS.
      this.keysFetchedAt = Date.now() - APPLE.KEYS_TTL_MS + APPLE.REFRESH_RETRY_MS;
      return;
    }

    const list = (body as { keys?: unknown }).keys;
    if (!Array.isArray(list)) {
      throw new SocialAuthFailure(
        API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        'apple/keys: thiếu "keys"',
      );
    }
    const next = new Map<string, KeyObject>();
    for (const jwk of list as Array<JsonWebKey & { kid?: string }>) {
      if (typeof jwk.kid !== 'string') continue;
      try {
        next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
      } catch {
        // Bỏ qua một khoá hỏng thay vì làm hỏng cả bộ.
      }
    }
    this.keys = next;
    this.keysFetchedAt = Date.now();
  }
}

function invalid(detail: string): SocialAuthFailure {
  return new SocialAuthFailure(API_ERROR_CODE.SOCIAL_TOKEN_INVALID, `apple: ${detail}`);
}

/** So bản băm của nonce THÔ với `nonce` trong token — thời gian hằng, như mọi phép so bí mật. */
function nonceMatches(rawNonce: string, claimed: unknown): boolean {
  if (typeof claimed !== 'string') return false;
  const expected = Buffer.from(createHash(APPLE.NONCE_HASH).update(rawNonce).digest('hex'));
  const actual = Buffer.from(claimed);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function joinName(
  fullName: { givenName?: string | null; familyName?: string | null } | null | undefined,
): string | null {
  if (!fullName) return null;
  // Thứ tự tên kiểu Việt: HỌ trước TÊN.
  const parts = [fullName.familyName, fullName.givenName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' ').slice(0, USER_DISPLAY_NAME_MAX_LENGTH) : null;
}
