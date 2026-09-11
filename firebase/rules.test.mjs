import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Kiểm chứng Firestore Security Rules trên emulator — không cần cloud creds.
 * Chạy: pnpm test:rules  (dùng `firebase emulators:exec --project demo-xeprime-rules`).
 *
 * Hai bản chiếu, cùng một luật nền: client CHỈ ĐỌC, và chỉ đọc thứ của chính mình.
 *
 *  - **chat** (ADR 0009): chỉ thành viên (uid ∈ memberUids) đọc được hội thoại và tin nhắn;
 *  - **huy hiệu** (ADR 0034): chỉ chính chủ đọc được `user_badges/{uid}`.
 *
 * Ở cả hai, backend (Admin SDK, bỏ qua rules) là writer DUY NHẤT — nên mọi đường ghi từ client
 * đều phải bị chặn, kể cả ghi vào document của chính mình.
 */
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    // Phải KHỚP `--project` của `emulators:exec` (`firebase.json` bật `singleProjectMode`).
    // Tiền tố `demo-` giữ emulator hoàn toàn offline — đúng thứ CI cần.
    projectId: 'demo-xeprime-rules',
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
    await setDoc(doc(db, 'user_badges/alice'), {
      chatCustomer: 2,
      chatShop: 0,
      notificationsUnread: 3,
      updatedAt: 1_757_600_000_000,
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

/*
 * Huy hiệu (ADR 0034). Luật ngắn hơn chat — doc id LÀ user id nên không phải `get()` sang doc
 * khác — nhưng đúng vì thế mà dễ viết sai theo chiều nguy hiểm: một `allow read: if isSignedIn()`
 * thiếu vế so uid sẽ cho bất kỳ ai đọc số chưa đọc của bất kỳ ai, và không màn hình nào lộ ra điều đó.
 */
test('huy hiệu: chính chủ đọc được document của mình', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(alice, 'user_badges/alice')));
});

test('huy hiệu: người khác KHÔNG đọc được', async () => {
  const bob = testEnv.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(bob, 'user_badges/alice')));
});

test('huy hiệu: chưa đăng nhập KHÔNG đọc được', async () => {
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'user_badges/alice')));
});

test('huy hiệu: client KHÔNG ghi được document của CHÍNH MÌNH (create/update/delete)', async () => {
  const alice = testEnv.authenticatedContext('alice').firestore();

  // Ghi đè document đã tồn tại.
  await assertFails(
    setDoc(doc(alice, 'user_badges/alice'), {
      chatCustomer: 0,
      chatShop: 0,
      notificationsUnread: 0,
      updatedAt: 2,
    }),
  );
  // Sửa một trường.
  await assertFails(updateDoc(doc(alice, 'user_badges/alice'), { notificationsUnread: 0 }));
  // Xoá.
  await assertFails(deleteDoc(doc(alice, 'user_badges/alice')));
  // Tạo mới ở document CHƯA tồn tại — nhánh `create` đi qua rule khác với `update`.
  const carol = testEnv.authenticatedContext('carol').firestore();
  await assertFails(
    setDoc(doc(carol, 'user_badges/carol'), {
      chatCustomer: 99,
      chatShop: 99,
      notificationsUnread: 99,
      updatedAt: 3,
    }),
  );
});
