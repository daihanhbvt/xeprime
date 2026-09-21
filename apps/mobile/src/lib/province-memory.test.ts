import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';
import { readRememberedProvince, rememberProvince } from './province-memory';

/**
 * Tỉnh đã chọn, nhớ giữa các màn hình và qua các lần mở app.
 *
 * Bản native của `apps/web/src/lib/province-memory.test.ts` — khoá đúng bốn điều đó:
 *   1. Ghi rồi đọc lại được — điều kiện tối thiểu, và là thứ khiến ô địa chỉ tự điền.
 *   2. "Toàn quốc" (mã rỗng) XOÁ bộ nhớ. Giữ lại nghĩa là khách vừa nói "xem cả nước" mà màn sau
 *      vẫn điền Bắc Ninh cho họ.
 *   3. Mã ngoài danh mục hiện hành bị bỏ — một mã của danh mục TRƯỚC 01/07/2025 còn nằm trong máy
 *      khách cũ sẽ điền vào bộ chọn một giá trị không tra ra nhãn.
 *   4. Lựa chọn quá cũ hết hiệu lực; và dữ liệu hỏng không được làm gãy gì.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `rememberProvince` trả `void` — nó chạy trong một cú chạm của người dùng và không được phép giữ
 * họ lại (xem docblock của nó). Nên test phải tự nhường một nhịp cho lượt ghi Keystore hoàn tất,
 * thay vì `await` một promise mà API cố ý không trả ra.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('province-memory', () => {
  it('ghi rồi đọc lại đúng mã', async () => {
    rememberProvince('24');
    await flush();
    await expect(readRememberedProvince()).resolves.toBe('24');
  });

  it('mã rỗng ("Toàn quốc") xoá bộ nhớ thay vì giữ lựa chọn cũ', async () => {
    rememberProvince('24');
    await flush();
    rememberProvince('');
    await flush();
    await expect(readRememberedProvince()).resolves.toBeNull();
  });

  it('mã ngoài danh mục hiện hành không được ghi, và không được đọc ra', async () => {
    rememberProvince('99');
    await flush();
    expect(await getSecureItem(SECURE_KEY.PROVINCE_CODE)).toBeNull();

    // Kể cả khi nó đã nằm sẵn trong máy từ một bản cũ.
    await setSecureItem(
      SECURE_KEY.PROVINCE_CODE,
      JSON.stringify({ provinceCode: '99', savedAt: new Date().toISOString() }),
    );
    await expect(readRememberedProvince()).resolves.toBeNull();
  });

  it('lựa chọn quá cũ thì bỏ', async () => {
    await setSecureItem(
      SECURE_KEY.PROVINCE_CODE,
      JSON.stringify({
        provinceCode: '24',
        savedAt: new Date(Date.now() - 181 * DAY_MS).toISOString(),
      }),
    );
    await expect(readRememberedProvince()).resolves.toBeNull();
  });

  it('dữ liệu hỏng không làm gãy gì', async () => {
    await setSecureItem(SECURE_KEY.PROVINCE_CODE, 'không-phải-json');
    await expect(readRememberedProvince()).resolves.toBeNull();
  });
});
