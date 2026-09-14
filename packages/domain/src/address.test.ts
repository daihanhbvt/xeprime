import { describe, expect, it } from 'vitest';
import { addressGeocodeQuery, formatAddress, guessAddressLine } from './address';

describe('formatAddress', () => {
  it('ghép từ NHỎ tới LỚN: số nhà → xã/phường → tỉnh', () => {
    expect(
      formatAddress({
        addressLine: '12 Nguyễn Thái Học',
        wardName: 'Phường Ba Đình',
        provinceName: 'Hà Nội',
      }),
    ).toBe('12 Nguyễn Thái Học, Phường Ba Đình, Hà Nội');
  });

  it('bỏ qua phần rỗng thay vì để lại dấu phẩy treo', () => {
    expect(formatAddress({ wardName: 'Phường Ba Đình', provinceName: 'Hà Nội' })).toBe(
      'Phường Ba Đình, Hà Nội',
    );
    expect(formatAddress({ addressLine: '  ', provinceName: 'Hà Nội' })).toBe('Hà Nội');
  });

  it('không có mảnh nào thì trả null — "chưa có địa chỉ" khác "địa chỉ rỗng"', () => {
    expect(formatAddress({})).toBeNull();
    expect(formatAddress({ addressLine: '', wardName: null, provinceName: undefined })).toBeNull();
  });
});

describe('addressGeocodeQuery', () => {
  it('luôn kèm "Việt Nam" — tên xã/tỉnh là chuỗi toàn cầu với nhà cung cấp bản đồ', () => {
    expect(addressGeocodeQuery({ wardName: 'Phường Tân Hội', provinceName: 'Hà Nội' })).toBe(
      'Phường Tân Hội, Hà Nội, Việt Nam',
    );
  });

  it('không có mảnh nào thì null — không hỏi bản đồ về mỗi chữ "Việt Nam"', () => {
    expect(addressGeocodeQuery({})).toBeNull();
  });
});

describe('guessAddressLine', () => {
  it('cắt các cụm hành chính ở đuôi chuỗi địa chỉ tự do cũ', () => {
    expect(guessAddressLine('12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM')).toBe(
      '12 Nguyễn Huệ',
    );
    // Tên tỉnh viết TRẦN (không tiền tố) vẫn nhận ra được — nó nằm trong danh mục 34 tỉnh.
    expect(guessAddressLine('12 Nguyễn Huệ, Hà Nội')).toBe('12 Nguyễn Huệ');
  });

  it('giữ ĐỦ phần chi tiết nhiều đoạn, không cắt cứng theo số lượng', () => {
    expect(guessAddressLine('Toà A, Ngõ 15, 12 Nguyễn Huệ, Phường Bến Nghé, TP.HCM')).toBe(
      'Toà A, Ngõ 15, 12 Nguyễn Huệ',
    );
  });

  it('chuỗi toàn địa danh thì không còn gì để giữ — trả rỗng, không đoán bừa', () => {
    expect(guessAddressLine('Phường Bến Nghé, Quận 1, TP.HCM')).toBe('');
  });

  it('tên quận/huyện CŨ viết trần thì giữ lại — thà thừa một đoạn còn hơn cắt nhầm số nhà', () => {
    // "Cầu Giấy" không còn nằm trong danh mục nào, nên không có cách nào nhận ra nó là địa danh.
    // Người dùng đọc gợi ý này rồi xoá; cắt nhầm thì họ phải gõ lại từ đầu.
    expect(guessAddressLine('88 Trần Thái Tông, Cầu Giấy, Hà Nội')).toBe('88 Trần Thái Tông, Cầu Giấy');
  });

  it('rỗng/null trả rỗng', () => {
    expect(guessAddressLine(null)).toBe('');
    expect(guessAddressLine(undefined)).toBe('');
    expect(guessAddressLine('   ')).toBe('');
  });
});
