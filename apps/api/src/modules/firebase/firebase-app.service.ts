import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Khởi tạo (một lần) Firebase Admin app dùng chung cho Chat (ADR 0009).
 *
 * Dùng chung credential `FIREBASE_*` với `token-verifier.ts`: cả hai gọi `getApps()[0] ?? init`
 * nên chỉ có MỘT default app ở runtime, ai chạm trước thì init. Service này lo phần chat cần:
 * mint custom token cho web đăng nhập Firebase (để Firestore Security Rules kiểm `request.auth.uid`).
 * Việc GHI Firestore đi qua outbox → worker (ADR 0009 §3), không nằm ở đây.
 */
@Injectable()
export class FirebaseAppService {
  private app: import('firebase-admin/app').App | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Chat realtime có bật không (FIRESTORE_ENABLED). Tắt thì chat chỉ chạy trên Postgres. */
  get enabled(): boolean {
    return this.config.get<boolean>('FIRESTORE_ENABLED') ?? false;
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
        // .env lưu newline literal \n, phải khôi phục trước khi đưa cho cert().
        privateKey: this.config.getOrThrow<string>('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
    return this.app;
  }

  /**
   * Mint custom token để web `signInWithCustomToken` — uid = Postgres user id (ULID). Nhờ đó
   * Firestore Security Rules so `request.auth.uid` với `memberUids[]` (mirror từ participants).
   */
  async createCustomToken(uid: string): Promise<string> {
    const { getAuth } = await import('firebase-admin/auth');
    return getAuth(await this.getApp()).createCustomToken(uid);
  }
}
