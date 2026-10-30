import { validateEnv } from '../src/config/env.schema';
import { baseEnv, validationError } from './helpers/env-fixture';

/**
 * `SEPAY_TRANSFER_PREFIX` — unit thuần, không đụng DB.
 *
 * Ngân hàng nối SePay bằng API Banking (VietinBank…) chỉ đẩy giao dịch có từ khoá `SEVQR` / `TKP…`
 * trong nội dung. Biến này đứng NGOÀI nhóm bốn biến SePay, và không được mang chữ `XP`: bộ đọc mã
 * tìm `XPG…`/`XPH…` ở bất kỳ đâu trong nội dung, một tiền tố chứa nó có thể bị đọc thành mã.
 */
describe('env SePay: SEPAY_TRANSFER_PREFIX', () => {
  it('không khai (hoặc chuỗi rỗng như `.env.example`): nội dung chỉ là mã', () => {
    expect(validateEnv(baseEnv()).SEPAY_TRANSFER_PREFIX).toBeUndefined();
    expect(
      validateEnv(baseEnv({ SEPAY_TRANSFER_PREFIX: '' })).SEPAY_TRANSFER_PREFIX,
    ).toBeUndefined();
  });

  it('nhận từ khoá SePay và mã tài khoản ảo', () => {
    expect(validateEnv(baseEnv({ SEPAY_TRANSFER_PREFIX: 'SEVQR' })).SEPAY_TRANSFER_PREFIX).toBe(
      'SEVQR',
    );
    expect(validateEnv(baseEnv({ SEPAY_TRANSFER_PREFIX: 'TKPAB1' })).SEPAY_TRANSFER_PREFIX).toBe(
      'TKPAB1',
    );
  });

  it('nhận "SEVQR TKP<VA>" — tài khoản ảo tự tạo của VietinBank đòi CẢ HAI, SEVQR đứng đầu', () => {
    expect(
      validateEnv(baseEnv({ SEPAY_TRANSFER_PREFIX: 'SEVQR TKPXEP' })).SEPAY_TRANSFER_PREFIX,
    ).toBe('SEVQR TKPXEP');
  });

  it.each(['sevqr', 'SEVQR  TKPXEP', ' SEVQR', 'SEVQR ', 'S', 'SEVQR-1'])(
    'từ chối định dạng sai: %p',
    (value) => {
      expect(validationError(baseEnv({ SEPAY_TRANSFER_PREFIX: value }))).toContain(
        'SEPAY_TRANSFER_PREFIX',
      );
    },
  );

  it('từ chối tiền tố chứa "XP" — trùng tiền tố mã đối soát', () => {
    expect(validationError(baseEnv({ SEPAY_TRANSFER_PREFIX: 'TKPXPG' }))).toContain('XP');
  });

  it('đứng ngoài nhóm bốn biến: khai một mình không đòi các biến SePay còn lại', () => {
    expect(() => validateEnv(baseEnv({ SEPAY_TRANSFER_PREFIX: 'SEVQR' }))).not.toThrow();
  });
});
