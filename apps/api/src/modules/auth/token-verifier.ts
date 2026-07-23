import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE } from '@xeprime/types';

/**
 * Kết quả verify token của nhà cung cấp đăng nhập.
 *
 * ADR 0002: Firebase chỉ xuất hiện sau interface này. Đổi sang Auth0/Cognito/tự làm chỉ
 * cần viết một implementation mới — guard, session và toàn bộ phần còn lại không đổi.
 */
export interface VerifiedIdentity {
  providerUserId: string;
  provider: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export abstract class IdTokenVerifier {
  abstract verify(idToken: string): Promise<VerifiedIdentity>;
}

/**
 * Dùng khi chưa có service account JSON của Firebase (CLAUDE.md mục 10).
 *
 * Token dạng `mock:<providerUserId>:<email>:<displayName>`. Chỉ hoạt động khi
 * `AUTH_MODE=mock`, và env schema đã chặn cấu hình này ở production.
 */
@Injectable()
export class MockIdTokenVerifier extends IdTokenVerifier {
  private readonly logger = new Logger(MockIdTokenVerifier.name);

  constructor() {
    super();
    this.logger.warn('AUTH_MODE=mock — token KHÔNG được xác thực thật. Chỉ dùng ở local.');
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    const parts = idToken.split(':');
    if (parts[0] !== 'mock' || !parts[1]) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.INVALID_ID_TOKEN,
        message: 'Mock token phải có dạng mock:<uid>:<email>:<tên>',
      });
    }

    const [, uid, email, displayName] = parts;
    return {
      providerUserId: uid,
      provider: 'mock',
      email: email || null,
      emailVerified: Boolean(email),
      phone: null,
      displayName: displayName || uid,
      avatarUrl: null,
    };
  }
}

@Injectable()
export class FirebaseIdTokenVerifier extends IdTokenVerifier {
  private app: import('firebase-admin/app').App | null = null;

  constructor(private readonly config: ConfigService) {
    super();
  }

  private async getApp(): Promise<import('firebase-admin/app').App> {
    if (this.app) return this.app;

    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const existing = getApps();
    if (existing[0]) {
      this.app = existing[0];
      return this.app;
    }

    this.app = initializeApp({
      credential: cert({
        projectId: this.config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),
        // .env lưu newline dạng literal \n, phải khôi phục trước khi đưa cho cert().
        privateKey: this.config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
    return this.app;
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    const { getAuth } = await import('firebase-admin/auth');
    const app = await this.getApp();

    try {
      const decoded = await getAuth(app).verifyIdToken(idToken, true);
      return {
        providerUserId: decoded.uid,
        provider: decoded.firebase?.sign_in_provider ?? 'firebase',
        email: decoded.email ?? null,
        emailVerified: decoded.email_verified ?? false,
        phone: decoded.phone_number ?? null,
        displayName: decoded.name ?? null,
        avatarUrl: decoded.picture ?? null,
      };
    } catch {
      // Không log token và không trả chi tiết lỗi của Firebase ra client.
      throw new UnauthorizedException({
        code: API_ERROR_CODE.INVALID_ID_TOKEN,
        message: 'Token đăng nhập không hợp lệ hoặc đã hết hạn',
      });
    }
  }
}
