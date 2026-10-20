import { USER_BADGES_COLLECTION, type UserBadgeDoc } from '@xeprime/types';
import { requireEnv } from './env';

/**
 * Client Firestore (Admin) của worker — writer DUY NHẤT đẩy projection sang Firestore (ADR 0009).
 * Không dùng Nest DI (worker là Node thuần); init lười, dùng chung default app qua getApps().
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

async function getDb(): Promise<import('firebase-admin/firestore').Firestore> {
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(await getApp());
}

/** Doc hội thoại: `memberUids` để Security Rules kiểm `request.auth.uid`. */
export interface ConversationDoc {
  tenantId: string;
  memberUids: string[];
  status: string;
  lastMessageText: string | null;
  lastMessageAt: number | null;
  lastSenderType: string | null;
  updatedAt: number;
}

export interface MessageDoc {
  senderUserId: string | null;
  senderType: string;
  messageType: string;
  text: string | null;
  attachments: { url: string; type: string | null; name: string | null }[];
  sentAt: number;
}

export async function upsertConversation(id: string, doc: ConversationDoc): Promise<void> {
  const db = await getDb();
  await db.collection('conversations').doc(id).set(doc, { merge: true });
}

export async function writeMessage(convId: string, msgId: string, doc: MessageDoc): Promise<void> {
  const db = await getDb();
  await db.collection('conversations').doc(convId).collection('messages').doc(msgId).set(doc);
}

/**
 * Phần ghi projection mà outbox pump cần — tách interface để test pump bằng fake writer,
 * không cần Firestore thật.
 */
export interface OutboxWriter {
  upsertConversation(id: string, doc: ConversationDoc): Promise<void>;
  writeMessage(convId: string, msgId: string, doc: MessageDoc): Promise<void>;
}

/** Writer thật (Firestore Admin) — mặc định của pump ở production. */
export const firestoreWriter: OutboxWriter = { upsertConversation, writeMessage };

/** Trần số thao tác của MỘT `WriteBatch` Firestore. */
const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Xoá đúng những document tin nhắn đã biết id — KHÔNG truy vấn Firestore.
 *
 * Danh sách id do Postgres trả (`messages.firebase_message_id IS NOT NULL`), nên chi phí chỉ là
 * lượt XOÁ. Bản cũ tìm tin cần xoá bằng `offset(keep).get()`, mà Firestore tính một lượt đọc cho
 * mỗi document bị offset bỏ qua. Xoá một document không còn tồn tại là no-op hợp lệ, nên chạy
 * lại sau một lần dừng giữa chừng là an toàn.
 */
export async function deleteMessages(convId: string, messageIds: readonly string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const db = await getDb();
  const col = db.collection('conversations').doc(convId).collection('messages');
  for (let i = 0; i < messageIds.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const id of messageIds.slice(i, i + FIRESTORE_BATCH_LIMIT)) batch.delete(col.doc(id));
    await batch.commit();
  }
}

/** Phần xoá mà retention cần — tách interface để test bằng fake, không cần Firestore thật. */
export interface RetentionDeleter {
  deleteMessages(convId: string, messageIds: readonly string[]): Promise<void>;
}

/** Deleter thật (Firestore Admin) — mặc định của retention ở production. */
export const firestoreRetentionDeleter: RetentionDeleter = { deleteMessages };

/**
 * Bản chiếu HUY HIỆU của một người — document `user_badges/{uid}` (ADR 0009 mở rộng cho badge).
 *
 * Cùng đường ống, cùng writer, cùng lý do: Postgres là source of truth, Firestore chỉ là bản
 * chiếu để client NGHE thay vì HỎI. Khác chat ở một điểm — mỗi người đúng một document, ghi đè
 * toàn bộ, không có lịch sử. Con số hôm qua không có giá trị gì.
 */
export async function writeUserBadges(uid: string, doc: UserBadgeDoc): Promise<void> {
  const db = await getDb();
  await db.collection(USER_BADGES_COLLECTION).doc(uid).set(doc);
}

/** Phần ghi mà job chiếu badge cần — tách interface để test bằng fake, không cần Firestore thật. */
export interface BadgeWriter {
  writeUserBadges(uid: string, doc: UserBadgeDoc): Promise<void>;
}

/** Writer thật (Firestore Admin) — mặc định của job chiếu badge ở production. */
export const firestoreBadgeWriter: BadgeWriter = { writeUserBadges };
