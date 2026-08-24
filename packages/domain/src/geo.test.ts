import { describe, expect, it } from 'vitest';
import { haversineKm, isValidGeoPoint, normalizeAddressKey, roundCoord } from './geo';

/** Hai điểm thật, khoảng cách đã biết — để test bắt được lỗi công thức chứ không chỉ lỗi kiểu. */
const HCM_BEN_THANH = { lat: 10.7721, lng: 106.698 };
const HANOI_HOAN_KIEM = { lat: 21.0287, lng: 105.8524 };
const HCM_TAN_SON_NHAT = { lat: 10.8188, lng: 106.6519 };

describe('haversineKm', () => {
  it('trả 0 cho hai điểm trùng nhau', () => {
    expect(haversineKm(HCM_BEN_THANH, HCM_BEN_THANH)).toBe(0);
  });

  it('đo đúng khoảng cách Sài Gòn – Hà Nội (~1140 km đường chim bay)', () => {
    const km = haversineKm(HCM_BEN_THANH, HANOI_HOAN_KIEM);
    expect(km).toBeGreaterThan(1130);
    expect(km).toBeLessThan(1160);
  });

  it('đo đúng quãng ngắn nội thành (Bến Thành – Tân Sơn Nhất ~7 km)', () => {
    const km = haversineKm(HCM_BEN_THANH, HCM_TAN_SON_NHAT);
    expect(km).toBeGreaterThan(6);
    expect(km).toBeLessThan(9);
  });

  it('đối xứng: đo chiều nào cũng ra một số', () => {
    expect(haversineKm(HCM_BEN_THANH, HANOI_HOAN_KIEM)).toBeCloseTo(
      haversineKm(HANOI_HOAN_KIEM, HCM_BEN_THANH),
      9,
    );
  });
});

describe('normalizeAddressKey', () => {
  it('gộp các cách gõ chỉ khác nhau ở khoảng trắng, dấu phẩy và hoa/thường', () => {
    const key = normalizeAddressKey('12 Nguyễn Huệ, Quận 1, TP.HCM');
    expect(normalizeAddressKey('  12   nguyễn huệ ,  quận 1 ,  tp . hcm  ')).toBe(key);
  });

  it('GIỮ dấu tiếng Việt — "Đông" và "Dong" phải là hai khoá khác nhau', () => {
    expect(normalizeAddressKey('Đông Hà')).not.toBe(normalizeAddressKey('Dong Ha'));
  });

  it('không trả về chuỗi có khoảng trắng thừa ở hai đầu', () => {
    expect(normalizeAddressKey('  ,, Hẻm 12/3 -- ')).toBe('hẻm 12/3');
  });
});

describe('roundCoord', () => {
  it('làm tròn về lưới ~110m ở mặc định 3 chữ số', () => {
    expect(roundCoord(10.7721234)).toBe(10.772);
    expect(roundCoord(106.6979876)).toBe(106.698);
  });

  it('hai điểm cách nhau vài chục mét gộp về cùng một khoá', () => {
    expect(roundCoord(10.77214)).toBe(roundCoord(10.77236));
  });
});

describe('isValidGeoPoint', () => {
  it('nhận toạ độ Việt Nam hợp lệ', () => {
    expect(isValidGeoPoint(HCM_BEN_THANH)).toBe(true);
  });

  it('loại null, NaN và toạ độ ngoài dải', () => {
    expect(isValidGeoPoint(null)).toBe(false);
    expect(isValidGeoPoint({ lat: Number.NaN, lng: 106 })).toBe(false);
    expect(isValidGeoPoint({ lat: 91, lng: 106 })).toBe(false);
    expect(isValidGeoPoint({ lat: 10, lng: 181 })).toBe(false);
  });

  it('loại (0,0) — luôn là dữ liệu hỏng với một sản phẩm chỉ chạy ở Việt Nam', () => {
    expect(isValidGeoPoint({ lat: 0, lng: 0 })).toBe(false);
  });
});
