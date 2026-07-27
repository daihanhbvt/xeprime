import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Kiểm chứng Firestore Security Rules cho chat (ADR 0009) trên emulator — không cần cloud creds.
 * Chạy: pnpm test:rules  (dùng `firebase emulators:exec --only firestore`).
 *
 * Bất biến: chỉ thành viên (uid ∈ memberUids) đọc được; non-member bị từ chối; client KHÔNG ghi
 * được (backend Admin SDK là writer duy nhất); chưa đăng nhập bị từ chối.
 */
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'xeprime-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });

  // Seed dữ liệu bằng context bỏ qua rules (giả lập backend Admin SDK ghi).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'conversations/conv1'), {
      tenantId: 't1',
      memberUids: ['alice', 'shopA'],
      status: 'active',
    });
    await setDoc(doc(db, 'conversations/conv1/messages/m1'), {
      text: 'chào shop',
      senderType: 'customer',
      sentAt: 1,
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('thành viên đọc được hội thoại và tin nhắn', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(alice, 'conversations/conv1')));
  await assertSucceeds(getDoc(doc(alice, 'conversations/conv1/messages/m1')));
});

test('non-member bị từ chối đọc', async () => {
  const bob = testEnv.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(bob, 'conversations/conv1')));
  await assertFails(getDoc(doc(bob, 'conversations/conv1/messages/m1')));
});

test('client KHÔNG ghi được, kể cả thành viên', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'conversations/conv1'), { hacked: true }));
  await assertFails(
    setDoc(doc(alice, 'conversations/conv1/messages/m2'), { text: 'x', senderType: 'customer', sentAt: 2 }),
  );
});

test('chưa đăng nhập bị từ chối đọc', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'conversations/conv1')));
});
