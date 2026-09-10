import { describe, expect, it } from 'vitest';
import { buildVietQrUrl } from './vietqr';

const CONFIGURED = { configured: true, bankCode: 'VCB', accountNumber: '0123456789' };

describe('buildVietQrUrl', () => {
  it('chưa cấu hình (SePay chưa gắn tài khoản) thì không có URL', () => {
    expect(buildVietQrUrl({ configured: false }, '500000', 'HOLD123')).toBeNull();
  });

  it('thiếu bankCode/accountNumber dù `configured: true` thì cũng không có URL', () => {
    expect(buildVietQrUrl({ configured: true }, '500000', 'HOLD123')).toBeNull();
  });

  it('addInfo PHẢI đúng mã đơn — đây là khoá SePay đối soát về đúng bản ghi (ADR 0022)', () => {
    const url = buildVietQrUrl(CONFIGURED, '500000', 'HOLD123');
    expect(url).toContain('addInfo=HOLD123');
    expect(url).toContain('amount=500000');
    expect(url).toMatch(/^https:\/\/img\.vietqr\.io\/image\/VCB-0123456789-compact2\.png\?/);
  });

  it('tên chủ tài khoản có dấu cách được mã hoá kiểu form (`+`), khớp `URLSearchParams`', () => {
    const url = buildVietQrUrl({ ...CONFIGURED, accountName: 'NGUYEN VAN A' }, '500000', 'HOLD123');
    expect(url).toContain('accountName=NGUYEN+VAN+A');
    expect(url).not.toContain('%20');
  });

  it('không có tên chủ tài khoản thì không thêm tham số `accountName`', () => {
    const url = buildVietQrUrl(CONFIGURED, '500000', 'HOLD123');
    expect(url).not.toContain('accountName');
  });
});
