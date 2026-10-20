import { accountPhoneIfDifferent } from '../src/common/phone';

/**
 * SĐT tài khoản hiện cạnh SĐT liên hệ của chuyến (ADR 0063) — hàm thuần, không cần DB.
 *
 * `users.phone` lưu `84…` còn liên hệ lưu `0…`: so CHUỖI thì mọi chuyến đều "khác số" và chủ xe
 * thấy cùng một số hai lần.
 */
describe('accountPhoneIfDifferent', () => {
  it('cùng một số viết hai kiểu ⇒ null', () => {
    expect(accountPhoneIfDifferent('84901234567', '0901234567')).toBeNull();
    expect(accountPhoneIfDifferent('84901234567', '+84901234567')).toBeNull();
  });

  it('khác số ⇒ số tài khoản ở dạng hiển thị `0…`', () => {
    expect(accountPhoneIfDifferent('84901234567', '0912345678')).toBe('0901234567');
  });

  it('không có tài khoản (đơn gian hàng tự lập) ⇒ null', () => {
    expect(accountPhoneIfDifferent(null, '0912345678')).toBeNull();
    expect(accountPhoneIfDifferent(undefined, '0912345678')).toBeNull();
  });

  it('đơn không còn SĐT liên hệ ⇒ vẫn hiện số tài khoản để gian hàng gọi được', () => {
    expect(accountPhoneIfDifferent('84901234567', null)).toBe('0901234567');
  });
});
