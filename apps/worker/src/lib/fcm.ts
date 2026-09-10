import {
  PUSH_ERROR_CODE,
  PUSH_PRIORITY,
  type AndroidNotificationChannel,
  type PushErrorCode,
  type PushPlatform,
  type PushPriority,
} from '@xeprime/types';
import { requireEnv } from './env';

/**
 * Người GỬI thông báo đẩy — Firebase Admin Messaging.
 *
 * Cùng khuôn với `firestore.ts`: init lười, dùng chung default app qua `getApps()`, và một
 * INTERFACE (`PushSender`) để job test được bằng fake mà không gọi mạng. Worker là tiến trình
 * DUY NHẤT gửi FCM — API chỉ xếp hàng vào `push_deliveries`, vì một lời gọi tới Google bên
 * trong transaction đặt xe biến sự cố của Firebase thành sự cố đặt xe.
 */

let appPromise: Promise<import('firebase-admin/app').App> | null = null;

async function getApp(): Promise<import('firebase-admin/app').App> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      const existing = getApps();
      if (existing[0]) return existing[0];
      return initializeApp({
        credential: cert({
          projectId: requireEnv('FIREBASE_PROJECT_ID'),
          clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
          privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
        }),
      });
    })();
  }
  return appPromise;
}

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string | null;
  /** CHỈ string, và không có PII — xem `pushDataPayload` ở `@xeprime/domain`. */
  data: Record<string, string>;
  priority: PushPriority;
  androidChannelId: AndroidNotificationChannel;
  /** Tin cùng khoá thay chỗ nhau trên khay thay vì xếp chồng. `null` = không gộp. */
  collapseKey: string | null;
}

export interface PushSendResult {
  /** `name` của message FCM — dấu vết đối chiếu được với console Firebase. */
  messageId: string;
}

export interface PushSender {
  send(message: PushMessage): Promise<PushSendResult>;
}

/**
 * Dịch một `PushMessage` sang payload của Firebase Admin.
 *
 * `notification` (title/body) đi cùng `data`: có nó thì OS tự hiển thị khi app ở nền hoặc đã
 * tắt — đúng thứ cần cho một app chưa dựng trung tâm thông báo. Payload chỉ-`data` sẽ im lặng
 * hoàn toàn trên iOS khi app không chạy.
 */
function toAdminMessage(
  message: PushMessage,
): import('firebase-admin/messaging').TokenMessage {
  const high = message.priority === PUSH_PRIORITY.HIGH;

  return {
    token: message.token,
    notification: { title: message.title, ...(message.body ? { body: message.body } : {}) },
    data: message.data,
    android: {
      priority: high ? 'high' : 'normal',
      ...(message.collapseKey ? { collapseKey: message.collapseKey } : {}),
      notification: {
        // ⚠️ App native CHƯA khai hai kênh này (docs/push-notifications.md §6): SDK của Firebase
        // rơi về kênh dự phòng của nó nên thông báo vẫn hiện, chỉ chưa tách được âm báo chat ↔ đơn.
        // Gửi đúng id ngay từ bây giờ để ngày app khai kênh thì không phải sửa gì ở đây.
        channelId: message.androidChannelId,
        // Gộp trên KHAY: cùng tag thì tin mới thay chỗ tin cũ. Khác `collapseKey` ở trên (cái
        // đó là gộp trên ĐƯỜNG TRUYỀN, khi máy đang offline).
        ...(message.collapseKey ? { tag: message.collapseKey } : {}),
      },
    },
    apns: {
      headers: {
        'apns-priority': high ? '10' : '5',
        ...(message.collapseKey ? { 'apns-collapse-id': message.collapseKey } : {}),
      },
      payload: {
        aps: {
          sound: 'default',
          ...(message.collapseKey ? { 'thread-id': message.collapseKey } : {}),
        },
      },
    },
  };
}

/** Sender THẬT. */
export const firebaseSender: PushSender = {
  async send(message: PushMessage): Promise<PushSendResult> {
    const { getMessaging } = await import('firebase-admin/messaging');
    const messaging = getMessaging(await getApp());
    const messageId = await messaging.send(toAdminMessage(message));
    return { messageId };
  },
};

/**
 * Phân loại lỗi của FCM thành MÃ + "có đáng thử lại không".
 *
 * Ba nhóm, và ranh giới giữa chúng quyết định hành vi:
 *  • token chết  → TẮT thiết bị. Thử lại vô nghĩa và một token đã gỡ app sẽ ở trong hàng đợi
 *                  mãi mãi.
 *  • tạm thời    → thử lại với backoff (Google 5xx, quota).
 *  • cấu hình    → hỏng vĩnh viễn. Retry không cứu được một service account thiếu quyền, và
 *                  thử lại tám lần chỉ làm chậm lúc phát hiện ra.
 *
 * Đọc `error.code` chứ không đọc `error.message`: message của FCM có nhánh chứa nguyên
 * registration token, và mã lỗi thì được ghi thẳng vào DB.
 */
export function classifyPushError(error: unknown): {
  code: PushErrorCode;
  retriable: boolean;
  disableDevice: boolean;
} {
  const raw = typeof (error as { code?: unknown })?.code === 'string'
    ? ((error as { code: string }).code)
    : '';

  switch (raw) {
    case 'messaging/registration-token-not-registered':
      return { code: PUSH_ERROR_CODE.TOKEN_UNREGISTERED, retriable: false, disableDevice: true };
    case 'messaging/invalid-registration-token':
    case 'messaging/invalid-argument':
    case 'messaging/mismatched-credential':
      // `invalid-argument` gần như luôn là token sai định dạng ở đây: phần còn lại của payload
      // do chính worker dựng và đã đi qua typecheck.
      return { code: PUSH_ERROR_CODE.TOKEN_INVALID, retriable: false, disableDevice: true };
    case 'messaging/server-unavailable':
    case 'messaging/internal-error':
    case 'messaging/quota-exceeded':
    case 'messaging/message-rate-exceeded':
      return { code: PUSH_ERROR_CODE.PROVIDER_UNAVAILABLE, retriable: true, disableDevice: false };
    case 'messaging/third-party-auth-error':
    case 'messaging/authentication-error':
    case 'app/invalid-credential':
      return { code: PUSH_ERROR_CODE.PROVIDER_AUTH, retriable: false, disableDevice: false };
    default:
      // Không biết là gì ⇒ coi là tạm thời. Backoff + trần số lần thử đã chặn vòng lặp vô hạn,
      // còn đánh `failed` ngay sẽ đánh rơi tin thật vì một mã lỗi mới của Google.
      return { code: PUSH_ERROR_CODE.UNKNOWN, retriable: true, disableDevice: false };
  }
}

/**
 * Đuôi token để đối chiếu trong log/CLI — KHÔNG BAO GIỜ in cả token.
 *
 * Sáu ký tự là đủ để người vận hành khớp một dòng log với một thiết bị họ đang cầm, và quá ít
 * để gửi được gì tới nó.
 */
export function tokenTail(token: string): string {
  return `…${token.slice(-6)}`;
}
