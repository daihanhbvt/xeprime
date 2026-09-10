import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Firebase Admin app dùng chung của tiến trình API — khởi tạo MỘT lần, lười.
 *
 * Firebase phục vụ HAI tính năng, và chúng bật/tắt độc lập bằng hai biến env riêng:
 *   • chat realtime (`FIRESTORE_ENABLED`) — mint custom token để web `signInWithCustomToken`,
 *     Firestore Security Rules kiểm `request.auth.uid`. Việc GHI Firestore đi qua outbox →
 *     worker (ADR 0009 §3), không nằm ở đây;
 *   • thông báo đẩy (`PUSH_ENABLED`) — API chỉ XẾP HÀNG (`push_deliveries`), việc GỬI cũng nằm
 *     ở worker. Đó là lý do lớp này không có phương thức gửi FCM nào: một lời gọi mạng tới
 *     Google bên trong transaction đặt xe là cách biến sự cố của Firebase thành sự cố đặt xe.
 *
 * Từ ADR 0019, Firebase KHÔNG còn nằm trên đường đăng nhập.
 */
@Injectable()
export class FirebaseAppService {
  private app: import('firebase-admin/app').App | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Chat realtime có bật không (FIRESTORE_ENABLED). Tắt thì chat chỉ chạy trên Postgres. */
  get enabled(): boolean {
    return this.config.get<boolean>('FIRESTORE_ENABLED') ?? false;
  }

  /**
   * Thông báo đẩy có bật không (PUSH_ENABLED).
   *
   * Tắt thì `POST /notifications/device-token` VẪN nhận đăng ký — thiết bị đăng ký trước, bật
   * sau — nhưng không dòng `push_deliveries` nào được tạo. Nhờ vậy lúc bật lên không có một
   * trận thông báo tồn đọng của mấy tuần trước ập vào máy người dùng.
   */
  get pushEnabled(): boolean {
    return this.config.get<boolean>('PUSH_ENABLED') ?? false;
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
