import { Prisma } from '@xeprime/prisma';
import { branchMapTarget } from '../src/common/address-view';

/**
 * Điểm ghim của chi nhánh (ADR 0061 điều 1) — MỘT quy tắc cho toạ độ trên trang xe công khai và
 * cho hai ảnh bản đồ tĩnh. Ba bản chép tay trước đây đã lệch nhau: ảnh điểm nhận xe từng vẽ đúng
 * cái toạ độ mà trang xe cố ý giấu.
 */
describe('branchMapTarget', () => {
  const point = { lat: 10.7721, lng: 106.698 };

  it('đọc toạ độ Decimal của Prisma, nhãn là địa chỉ chi nhánh đã cắt khoảng trắng', () => {
    expect(
      branchMapTarget({
        address: '  12 Lê Lợi, Phường Sài Gòn, Thành Phố Hồ Chí Minh ',
        latitude: new Prisma.Decimal('10.7721'),
        longitude: new Prisma.Decimal('106.698'),
      }),
    ).toEqual({ point, label: '12 Lê Lợi, Phường Sài Gòn, Thành Phố Hồ Chí Minh' });
  });

  it('chi nhánh CHƯA có địa chỉ riêng → không ghim, dù có toạ độ', () => {
    // Trang xe khi đó hiện địa chỉ hồ sơ gian hàng — ghim toạ độ chi nhánh là chỉ khách tới sai chỗ.
    expect(branchMapTarget({ address: null, latitude: point.lat, longitude: point.lng })).toBeNull();
    expect(branchMapTarget({ address: '   ', latitude: point.lat, longitude: point.lng })).toBeNull();
  });

  it('thiếu MỘT toạ độ → không ghim (Number(null) là 0, không phải "chưa biết")', () => {
    expect(branchMapTarget({ address: '12 Lê Lợi', latitude: point.lat, longitude: null })).toBeNull();
    expect(branchMapTarget({ address: '12 Lê Lợi', latitude: null, longitude: point.lng })).toBeNull();
  });

  it('toạ độ hỏng (0,0 · ngoài phạm vi) → không ghim', () => {
    expect(branchMapTarget({ address: '12 Lê Lợi', latitude: 0, longitude: 0 })).toBeNull();
    expect(branchMapTarget({ address: '12 Lê Lợi', latitude: 95, longitude: 106 })).toBeNull();
  });

  it('không có chi nhánh → null', () => {
    expect(branchMapTarget(null)).toBeNull();
    expect(branchMapTarget(undefined)).toBeNull();
  });
});
