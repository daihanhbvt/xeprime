import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMapConfigured, mapExternalUrl, mapPlaceUrl, toGeoPoint } from './map-embed';

const KEY = 'test-browser-key';
const BEN_THANH = { lat: 10.7721, lng: 106.698 };

beforeEach(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = KEY;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
});

describe('chưa cấu hình key trình duyệt', () => {
  it('URL nhúng là null — nơi gọi ẩn khối bản đồ thay vì render khung vỡ', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

    expect(isMapConfigured()).toBe(false);
    expect(mapPlaceUrl(BEN_THANH, 'vi')).toBeNull();
  });

  it('chuỗi rỗng cũng là chưa cấu hình — biến khai trống ở GitHub Environment ra đúng ca này', () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = '';

    expect(isMapConfigured()).toBe(false);
  });
});

describe('mapPlaceUrl', () => {
  it('dựng URL Embed API ghim MỘT điểm bằng toạ độ', () => {
    const url = new URL(mapPlaceUrl(BEN_THANH, 'vi')!);

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/embed/v1/place');
    expect(url.searchParams.get('q')).toBe('10.7721,106.698');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(url.searchParams.get('zoom')).toBe('16');
    // Sản phẩm chỉ chạy ở Việt Nam — khoá vùng để nhãn trên bản đồ khớp phần còn lại của trang.
    expect(url.searchParams.get('region')).toBe('VN');
  });

  it('ngôn ngữ nhãn theo ngôn ngữ giao diện, toạ độ không đổi', () => {
    const vi = new URL(mapPlaceUrl(BEN_THANH, 'vi')!);
    const en = new URL(mapPlaceUrl(BEN_THANH, 'en')!);

    expect(vi.searchParams.get('language')).toBe('vi');
    expect(en.searchParams.get('language')).toBe('en');
    expect(en.searchParams.get('q')).toBe(vi.searchParams.get('q'));
  });

  /**
   * Phép kiểm đáng giá nhất của file: toạ độ hỏng lọt qua sẽ thành một cái ghim ở Vịnh Guinea
   * nằm ngay dưới dòng địa chỉ đúng — sai một cách rất thuyết phục.
   */
  it('từ chối toạ độ thiếu, sai dải và (0,0)', () => {
    expect(mapPlaceUrl(null, 'vi')).toBeNull();
    expect(mapPlaceUrl(undefined, 'vi')).toBeNull();
    expect(mapPlaceUrl({ lat: 0, lng: 0 }, 'vi')).toBeNull();
    expect(mapPlaceUrl({ lat: 91, lng: 106 }, 'vi')).toBeNull();
    expect(mapPlaceUrl({ lat: Number.NaN, lng: 106 }, 'vi')).toBeNull();
  });
});

describe('mapExternalUrl', () => {
  it('link phổ quát của Google Maps — không cần key, không mang key', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    const url = new URL(mapExternalUrl(BEN_THANH));

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('10.7721,106.698');
    expect(url.searchParams.has('key')).toBe(false);
  });
});

describe('toGeoPoint', () => {
  it('ghép hai giá trị rời thành một điểm hợp lệ', () => {
    expect(toGeoPoint(10.7721, 106.698)).toEqual(BEN_THANH);
  });

  it('thiếu một nửa hoặc toạ độ hỏng → null', () => {
    expect(toGeoPoint(null, 106.698)).toBeNull();
    expect(toGeoPoint(10.7721, undefined)).toBeNull();
    expect(toGeoPoint(0, 0)).toBeNull();
  });
});
