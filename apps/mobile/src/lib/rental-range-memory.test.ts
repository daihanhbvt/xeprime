import { nowInAppTz } from '@xeprime/domain';
import { SECURE_KEY } from './secure-storage';
import {
  __resetRentalRangeMemory,
  readRememberedRentalRange,
  rememberRentalRange,
  rememberedOrDefaultRentalRange,
} from './rental-range-memory';

/**
 * Kho bền GIẢ — một `Map` đứng thay Keychain/Keystore.
 *
 * Canh đúng phần luật mà bản web đã ghi và bản native phải giữ nguyên: tầng phiên không có cổng
 * ngày, tầng bền CÓ, và mốc đã trôi qua thì không bao giờ được điền lại.
 */
// Tên phải bắt đầu bằng `mock`: jest nâng `jest.mock()` lên đầu file và chặn mọi biến khác.
const mockStore = new Map<string, string>();

jest.mock('./secure-storage', () => ({
  SECURE_KEY: { RENTAL_RANGE: 'xp.rentalRange' },
  getSecureItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setSecureItem: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteSecureItem: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

/**
 * Mọi mốc dựng THEO ĐỒNG HỒ THẬT, không gõ cứng ngày.
 *
 * `rememberRentalRange` đóng dấu `savedAt` bằng `new Date()`, còn cổng của tầng bền là "cùng NGÀY
 * Việt Nam với `savedAt`". Một `NOW` gõ cứng vì thế chỉ đúng vào đúng cái ngày người ta viết test
 * — bản đầu tiên của file này gõ 14/09 và tự đỏ vào sáng 15/09.
 *
 * `NOW` là 08:00 của CHÍNH hôm nay (giờ VN) nên luôn cùng ngày với `savedAt`; hai mốc thuê đẩy
 * sang vài ngày sau để chúng luôn nằm ở tương lai so với mọi `now` mà các ca dưới truyền vào.
 */
const NOW = nowInAppTz().startOf('day').add(8, 'hour');
const PICKUP = NOW.add(2, 'day').hour(17);
const RETURN = NOW.add(4, 'day').hour(17);
/** Cùng giờ, nhưng đã sang NGÀY KHÁC — dùng để kiểm cổng "cùng ngày" của tầng bền. */
const TOMORROW = NOW.add(1, 'day');
/** Sau giờ nhận đã lưu — dùng để kiểm luật "mốc đã trôi qua thì bỏ". */
const AFTER_PICKUP = PICKUP.add(1, 'hour');

beforeEach(() => {
  mockStore.clear();
  __resetRentalRangeMemory();
});

describe('rental-range-memory', () => {
  it('đọc lại đúng khoảng vừa ghi, kể cả chế độ giờ/ngày', async () => {
    rememberRentalRange({ pickupAt: PICKUP, returnAt: RETURN, mode: 'hourly' });

    const got = await readRememberedRentalRange(NOW);
    expect(got?.pickupAt.toISOString()).toBe(PICKUP.toISOString());
    expect(got?.returnAt.toISOString()).toBe(RETURN.toISOString());
    expect(got?.mode).toBe('hourly');
  });

  it('KHÔNG ghi khi khoảng mới có một đầu — một nửa khoảng không phải một lựa chọn', async () => {
    rememberRentalRange({ pickupAt: PICKUP, returnAt: null, mode: 'daily' });

    expect(mockStore.size).toBe(0);
    expect(await readRememberedRentalRange(NOW)).toBeNull();
  });

  it('bỏ khoảng có GIỜ NHẬN đã trôi qua — điền lại là mời gửi một yêu cầu chắc chắn bị từ chối', async () => {
    rememberRentalRange({ pickupAt: PICKUP, returnAt: RETURN, mode: 'daily' });

    // Đứng ở thời điểm SAU giờ nhận đã lưu.
    expect(await readRememberedRentalRange(AFTER_PICKUP)).toBeNull();
  });

  it('tầng BỀN chỉ dùng lại trong CÙNG NGÀY Việt Nam', async () => {
    rememberRentalRange({ pickupAt: PICKUP, returnAt: RETURN, mode: 'daily' });
    // Tầng phiên (bộ nhớ tiến trình) mất đi khi app khởi động lại; chỉ còn tầng bền.
    __resetRentalRangeMemory();

    // Cùng ngày với lúc ghi ⇒ còn dùng được.
    expect(await readRememberedRentalRange(NOW)).not.toBeNull();

    __resetRentalRangeMemory();
    // Sang ngày hôm sau, VẪN trước giờ nhận — vẫn bị bỏ: cổng là NGÀY, không phải hạn dùng.
    expect(await readRememberedRentalRange(TOMORROW)).toBeNull();
  });

  it('tầng PHIÊN không có cổng ngày — cùng một lượt dùng thì giữ nguyên', async () => {
    rememberRentalRange({ pickupAt: PICKUP, returnAt: RETURN, mode: 'daily' });
    mockStore.clear(); // chỉ còn tầng phiên

    expect(await readRememberedRentalRange(TOMORROW)).not.toBeNull();
  });

  it('không nhớ gì thì rơi về gợi ý sinh ra, chế độ theo NGÀY', async () => {
    const fallback = await rememberedOrDefaultRentalRange(NOW);

    expect(fallback.mode).toBe('daily');
    expect(fallback.pickupAt.isAfter(NOW)).toBe(true);
    expect(fallback.returnAt.isAfter(fallback.pickupAt)).toBe(true);
  });

  it('giá trị hỏng trong kho bền bị BỎ, không làm gãy lần đọc', async () => {
    mockStore.set(SECURE_KEY.RENTAL_RANGE, '{ không phải JSON');

    expect(await readRememberedRentalRange(NOW)).toBeNull();
  });
});
