import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE, USER_STATUS } from '@xeprime/types';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ulid } from 'ulid';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Phiên đăng nhập của app native — ADR 0017.
 *
 * KHÔNG chạm vào `SessionService` (cookie của web): hai vòng đời khác nhau hoàn toàn, và gộp
 * chúng nghĩa là mọi thay đổi cho native đều có nguy cơ đổi hành vi đăng nhập web.
 *
 * Ba bất biến mà mọi phương thức ở đây phải giữ:
 *  1. Refresh token THÔ không bao giờ được ghi ra DB, log, hay message lỗi — chỉ SHA-256 của nó.
 *  2. Access token chỉ mang `sub`/`sid`/`typ`/`aud`/`iat`/`exp`. Không quyền, không tenant, không PII.
 *  3. Refresh dùng lại (`used_at` đã set) ⇒ thu hồi CẢ phiên, không chỉ token đó.
 */

/** Loại token trong claim `typ` — phân biệt access token native với session JWT của web. */
export const NATIVE_TOKEN_TYPE = 'access' as const;

export interface NativeAccessPayload {
  /** userId */
  sub: string;
  /** `native_auth_sessions.id` — thu hồi theo thiết bị */
  sid: string;
  typ: typeof NATIVE_TOKEN_TYPE;
}

/** Lý do thu hồi — khớp CHECK `native_auth_sessions_revoked_reason_check`. */
export const NATIVE_REVOKE_REASON = {
  LOGOUT: 'logout',
  REFRESH_REUSE: 'refresh_reuse',
  USER_DISABLED: 'user_disabled',
} as const;

export type NativeRevokeReason = (typeof NATIVE_REVOKE_REASON)[keyof typeof NATIVE_REVOKE_REASON];

export interface NativeDeviceInfo {
  deviceName?: string | undefined;
  devicePlatform?: string | undefined;
  appVersion?: string | undefined;
}

export interface NativeTokenPair {
  accessToken: string;
  /** Giây — client dùng để chủ động refresh trước khi hết hạn, không phải để tin. */
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

/** 32 byte CSPRNG → 43 ký tự base64url. Không có cấu trúc, không tự chứng minh gì (ADR 0017 §2). */
const REFRESH_TOKEN_BYTES = 32;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class NativeSessionService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ký bằng CÙNG secret với session cookie của web — cố ý, và an toàn nhờ `typ`+`aud`.
   *
   * Hai họ token không thể đi lẫn đường của nhau: `verifyAccessToken` đòi đúng `typ=access` và
   * đúng `aud`, còn `SessionService.verify` (web) không đặt `audience` khi ký nên token của nó
   * không có `aud` để lọt qua. Một secret nghĩa là một chỗ để xoay khi cần.
   */
  private get secret(): string {
    return this.config.getOrThrow<string>('SESSION_JWT_SECRET');
  }

  private get audience(): string {
    return this.config.getOrThrow<string>('MOBILE_JWT_AUDIENCE');
  }

  private get accessTtlMinutes(): number {
    return this.config.getOrThrow<number>('MOBILE_ACCESS_TTL_MINUTES');
  }

  private get refreshTtlDays(): number {
    return this.config.getOrThrow<number>('MOBILE_REFRESH_TTL_DAYS');
  }

  /** Tạo phiên MỚI cho một thiết bị — dùng sau khi đã xác thực xong (Firebase hoặc mật khẩu). */
  async issueSession(userId: string, device: NativeDeviceInfo = {}): Promise<NativeTokenPair> {
    const sessionId = ulid();
    const now = Date.now();
    const expiresAt = new Date(now + this.refreshTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.nativeAuthSession.create({
      data: {
        id: sessionId,
        userId,
        clientType: 'mobile',
        deviceName: device.deviceName ?? null,
        devicePlatform: device.devicePlatform ?? null,
        appVersion: device.appVersion ?? null,
        expiresAt,
      },
    });

    const refresh = await this.createRefreshToken(sessionId, expiresAt);
    return { ...this.signAccess(userId, sessionId), ...refresh, sessionId };
  }

  /**
   * Xoay refresh token — ADR 0017 §4.
   *
   * Bốn nhánh từ chối, và nhánh thứ hai là nhánh quan trọng nhất:
   *  - không tìm thấy hash ⇒ token không tồn tại (hoặc đã bị xoá cùng phiên);
   *  - `usedAt` đã set ⇒ **replay**: thu hồi cả phiên rồi mới từ chối;
   *  - token/phiên hết hạn hoặc đã thu hồi;
   *  - user không còn `active` ⇒ thu hồi phiên (không để refresh làm sống lại tài khoản bị khoá).
   */
  async rotate(refreshToken: string): Promise<NativeTokenPair> {
    const tokenHash = sha256Hex(refreshToken);
    const existing = await this.prisma.nativeRefreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: { include: { user: { select: { id: true, status: true, deletedAt: true } } } },
      },
    });

    if (!existing) throw this.invalidRefresh();

    const { session } = existing;

    if (existing.usedAt !== null) {
      /*
       * Cùng một token được dùng lần thứ hai. Không thể biết lần nào là người thật, nên giết cả
       * phiên: người thật đăng nhập lại (bất tiện), kẻ đánh cắp mất quyền (mục đích).
       */
      await this.revokeSession(session.id, NATIVE_REVOKE_REASON.REFRESH_REUSE);
      throw this.invalidRefresh();
    }

    const now = new Date();
    if (
      existing.revokedAt !== null ||
      existing.expiresAt <= now ||
      session.revokedAt !== null ||
      session.expiresAt <= now
    ) {
      throw this.invalidRefresh();
    }

    if (session.user.status !== USER_STATUS.ACTIVE || session.user.deletedAt !== null) {
      await this.revokeSession(session.id, NATIVE_REVOKE_REASON.USER_DISABLED);
      throw this.invalidRefresh();
    }

    /*
     * Đóng token cũ và mở token mới trong MỘT transaction.
     *
     * `updateMany` với điều kiện `usedAt: null` chứ không `update` theo id: hai lời gọi refresh
     * song song cùng token sẽ có đúng một cái thấy `count === 1`. Không có mệnh đề đó thì cả hai
     * đều "thành công" và hàng token bị chẻ đôi — đúng thứ phát hiện replay tồn tại để chặn.
     *
     * Bên THUA nhận 401 nhưng phiên **không** bị thu hồi — khác hẳn nhánh replay ở trên, và có
     * chủ đích: hai request chạm nhau trong vài mili giây là app gửi song song (hoặc mạng chập
     * chờn retry), không phải hai bên giữ cùng một token qua thời gian. Giết phiên ở đây sẽ đá
     * người dùng ra ngoài mỗi lần app mở nhiều màn cùng lúc.
     *
     * Hệ quả cho client: phải **single-flight** lời gọi refresh (một promise dùng chung cho mọi
     * request đang chờ). Mẫu ở `packages/api-client/README.md`.
     */
    const rotated = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.nativeRefreshToken.updateMany({
        where: { id: existing.id, usedAt: null },
        data: { usedAt: now },
      });
      if (closed.count !== 1) return null;

      const id = ulid();
      const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
      await tx.nativeRefreshToken.create({
        data: {
          id,
          sessionId: session.id,
          tokenHash: sha256Hex(token),
          expiresAt: session.expiresAt,
        },
      });
      await tx.nativeAuthSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
      return { refreshToken: token, refreshTokenExpiresAt: session.expiresAt };
    });

    if (!rotated) throw this.invalidRefresh();

    return {
      ...this.signAccess(session.userId, session.id),
      ...rotated,
      sessionId: session.id,
    };
  }

  /**
   * Đăng xuất một thiết bị.
   *
   * Không tiết lộ token có tồn tại hay không: token lạ vẫn trả về êm. Đăng xuất là thao tác
   * *dọn dẹp*, và một 404 ở đây chỉ cho phép dò xem một chuỗi có phải refresh token hợp lệ.
   */
  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const found = await this.prisma.nativeRefreshToken.findUnique({
      where: { tokenHash: sha256Hex(refreshToken) },
      select: { sessionId: true },
    });
    if (!found) return;
    await this.revokeSession(found.sessionId, NATIVE_REVOKE_REASON.LOGOUT);
  }

  /** Thu hồi phiên + mọi refresh token còn sống của nó. Idempotent. */
  async revokeSession(sessionId: string, reason: NativeRevokeReason): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.nativeAuthSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now, revokedReason: reason },
      }),
      this.prisma.nativeRefreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  /** Thu hồi MỌI phiên native của một user — cho "đăng xuất khỏi mọi thiết bị" và khi khoá tài khoản. */
  async revokeAllForUser(userId: string, reason: NativeRevokeReason): Promise<void> {
    const sessions = await this.prisma.nativeAuthSession.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    for (const { id } of sessions) {
      await this.revokeSession(id, reason);
    }
  }

  /**
   * Xác minh access token: chữ ký, `aud`, `typ` — CHƯA tra DB.
   *
   * Tách khỏi phần tra DB để `AuthGuard` và `resolveOptionalUserId` dùng chung được đúng một
   * hiện thực của luật "token này có hình dạng đúng không".
   */
  verifyAccessToken(token: string): NativeAccessPayload {
    let decoded: jwt.JwtPayload;
    try {
      const result = jwt.verify(token, this.secret, {
        issuer: 'xeprime-api',
        audience: this.audience,
      });
      if (typeof result === 'string') throw new Error('payload không phải object');
      decoded = result;
    } catch (err) {
      const expired = err instanceof jwt.TokenExpiredError;
      throw new UnauthorizedException({
        code: expired ? API_ERROR_CODE.SESSION_EXPIRED : API_ERROR_CODE.UNAUTHENTICATED,
        message: expired ? 'Phiên đăng nhập đã hết hạn' : 'Phiên đăng nhập không hợp lệ',
      });
    }

    /*
     * `typ` kiểm SAU khi chữ ký đã hợp lệ, và kiểm tường minh.
     *
     * Không có nhánh này, một session JWT của web (cùng secret, cùng issuer) chỉ cần thêm `aud`
     * là đi được qua đường Bearer — mang theo tuổi 7 ngày vào một nơi thiết kế cho 15 phút.
     */
    if (decoded.typ !== NATIVE_TOKEN_TYPE || !decoded.sub || typeof decoded.sid !== 'string') {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Phiên đăng nhập không hợp lệ',
      });
    }

    return { sub: String(decoded.sub), sid: decoded.sid, typ: NATIVE_TOKEN_TYPE };
  }

  /**
   * Phiên còn hiệu lực không — tra DB.
   *
   * Đây là lý do access token dám sống 15 phút: `logout` hay `refresh_reuse` giết phiên, và
   * request tiếp theo bị chặn ngay dù token chưa hết hạn.
   */
  async isSessionUsable(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.nativeAuthSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return session !== null;
  }

  /**
   * Header `Authorization` → token, hoặc `null` nếu không có header.
   *
   * `undefined` (không có header) và "có header nhưng sai dạng" là hai chuyện khác nhau: cái thứ
   * hai NÉM lỗi thay vì rơi về cookie. Một client gửi `Authorization: token-khong-co-scheme` mà
   * được phục vụ bằng cookie là một client sẽ không bao giờ biết mình đang gửi sai.
   */
  static parseBearer(headerValue: string | undefined): string | null {
    if (headerValue === undefined) return null;

    const match = /^Bearer (\S+)$/i.exec(headerValue.trim());
    if (!match?.[1]) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        // Không echo lại giá trị header — nó chứa token.
        message: 'Header Authorization phải đúng dạng `Bearer <accessToken>`',
      });
    }
    return match[1];
  }

  private signAccess(
    userId: string,
    sessionId: string,
  ): { accessToken: string; accessTokenExpiresIn: number } {
    const expiresIn = this.accessTtlMinutes * 60;
    const accessToken = jwt.sign(
      { sub: userId, sid: sessionId, typ: NATIVE_TOKEN_TYPE } satisfies NativeAccessPayload,
      this.secret,
      { expiresIn, issuer: 'xeprime-api', audience: this.audience },
    );
    return { accessToken, accessTokenExpiresIn: expiresIn };
  }

  private async createRefreshToken(
    sessionId: string,
    expiresAt: Date,
  ): Promise<{ refreshToken: string; refreshTokenExpiresAt: Date }> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    await this.prisma.nativeRefreshToken.create({
      data: { id: ulid(), sessionId, tokenHash: sha256Hex(token), expiresAt },
    });
    return { refreshToken: token, refreshTokenExpiresAt: expiresAt };
  }

  /**
   * MỘT câu trả lời cho mọi lý do refresh thất bại.
   *
   * Không phân biệt "token không tồn tại" / "đã dùng" / "hết hạn" / "phiên bị thu hồi": mỗi
   * thông điệp khác nhau là một bit thông tin cho người đang dò. Client chỉ cần biết một điều —
   * phải đăng nhập lại.
   */
  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({
      code: API_ERROR_CODE.SESSION_EXPIRED,
      message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    });
  }
}
