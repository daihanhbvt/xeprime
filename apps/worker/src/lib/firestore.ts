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

/** Xoá tin cũ, giữ `keep` tin mới nhất. Trả số tin đã xoá. */
export async function trimMessages(convId: string, keep: number): Promise<number> {
  const db = await getDb();
  const col = db.collection('conversations').doc(convId).collection('messages');
  const snap = await col.orderBy('sentAt', 'desc').offset(keep).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
