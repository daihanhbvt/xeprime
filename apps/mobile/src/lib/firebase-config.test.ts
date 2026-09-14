import { isFirebaseConfigured, readFirebaseConfig } from './firebase-config';

/**
 * Cấu hình Firebase public của app.
 *
 * Bất biến duy nhất đáng khoá: THIẾU dù chỉ một biến thì coi như CHƯA cấu hình. Trả về một
 * `FirebaseOptions` khuyết trường là để `initializeApp` ném ra giữa lúc khởi động — trong khi
 * hành vi đúng là im lặng rơi về REST (ADR 0009: Firestore chỉ là projection).
 *
 * Không set `process.env` trong test: babel NỘI TUYẾN `process.env.EXPO_PUBLIC_*` thành hằng lúc
 * transform, nên ở đây bốn biến đó luôn là `undefined` — và đó chính là trường hợp "chưa cấu
 * hình" mà bài test này cần.
 */
describe('readFirebaseConfig', () => {
  it('bundle không có biến nào ⇒ chưa cấu hình', () => {
    expect(readFirebaseConfig()).toBeNull();
    expect(isFirebaseConfigured()).toBe(false);
  });
});
