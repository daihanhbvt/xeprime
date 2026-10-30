import { describe, expect, it } from 'vitest';
import { buildVietQrUrl, transferContent } from './vietqr';

const CONFIGURED = { configured: true, bankCode: 'VCB', accountNumber: '0123456789' };

describe('buildVietQrUrl', () => {
  it('chưa cấu hình (SePay chưa gắn tài khoản) thì không có URL', () => {
    expect(buildVietQrUrl({ configured: false }, '500000', 'HOLD123')).toBeNull();
  });

  it('thiếu bankCode/accountNumber dù `configured: true` thì cũng không có URL', () => {
    expect(buildVietQrUrl({ configured: true }, '500000', 'HOLD123')).toBeNull();
  });

  it('ảnh do SePay phát, trỏ đúng tài khoản nhận', () => {
    const url = buildVietQrUrl(CONFIGURED, '500000', 'HOLD123');
    expect(url).toMatch(/^https:\/\/qr\.sepay\.vn\/img\?/);
    expect(url).toContain('acc=0123456789');
    expect(url).toContain('bank=VCB');
    expect(url).toContain('template=compact');
  });

  it('des PHẢI đúng mã đơn — đây là khoá SePay đối soát về đúng bản ghi (ADR 0022)', () => {
    const url = buildVietQrUrl(CONFIGURED, '500000', 'HOLD123');
    expect(url).toContain('des=HOLD123');
    expect(url).toContain('amount=500000');
  });

  it('có transferPrefix: des = "<tiền tố> <mã>" — ngân hàng API Banking chỉ đẩy giao dịch có từ khoá', () => {
    const url = buildVietQrUrl({ ...CONFIGURED, transferPrefix: 'SEVQR' }, '500000', 'HOLD123');
    expect(url).toContain('des=SEVQR%20HOLD123');
  });

  it('không đưa tên chủ tài khoản lên URL — ảnh SePay không dùng tới', () => {
    const url = buildVietQrUrl({ ...CONFIGURED, accountName: 'NGUYEN VAN A' }, '500000', 'HOLD123');
    expect(url).not.toContain('NGUYEN');
  });
});

describe('transferContent', () => {
  it('không có tiền tố (hoặc chưa tải thông tin tài khoản) thì nội dung chỉ là mã', () => {
    expect(transferContent(undefined, 'XPG23456789')).toBe('XPG23456789');
    expect(transferContent({ transferPrefix: null }, 'XPG23456789')).toBe('XPG23456789');
  });

  it('có tiền tố thì ghép trước mã, cách một dấu cách', () => {
    expect(transferContent({ transferPrefix: 'SEVQR' }, 'XPG23456789')).toBe('SEVQR XPG23456789');
    expect(transferContent({ transferPrefix: 'SEVQR TKPXEP' }, 'XPG23456789')).toBe(
      'SEVQR TKPXEP XPG23456789',
    );
  });
});
