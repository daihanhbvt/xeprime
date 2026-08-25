import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMapEmbedConfigured, mapDirectionsUrl, mapPlaceUrl, toGeoPoint } from './map-embed';

const KEY = 'test-embed-key';
const BEN_THANH = { lat: 10.7721, lng: 106.698 };
const NGUYEN_HUE = { lat: 10.7743, lng: 106.7038 };

beforeEach(() => {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY = KEY;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
});

describe('chưa cấu hình key nhúng', () => {
  it('mọi URL đều là null — nơi gọi ẩn khối bản đồ thay vì render khung vỡ', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

    expect(isMapEmbedConfigured()).toBe(false);
    expect(mapPlaceUrl(BEN_THANH)).toBeNull();
    expect(mapDirectionsUrl(BEN_THANH, NGUYEN_HUE)).toBeNull();
  });
});

describe('mapPlaceUrl', () => {
  it('dựng URL ghim MỘT điểm bằng toạ độ', () => {
    const url = new URL(mapPlaceUrl(BEN_THANH)!);

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/embed/v1/place');
    expect(url.searchParams.get('q')).toBe('10.7721,106.698');
    expect(url.searchParams.get('key')).toBe(KEY);
    // Sản phẩm chỉ chạy ở Việt Nam — khoá vùng để nhãn trên bản đồ khớp phần còn lại của trang.
    expect(url.searchParams.get('region')).toBe('VN');
  });

  /**
   * Đây là phép kiểm đáng giá nhất của file: toạ độ hỏng lọt qua sẽ thành một cái ghim ở Vịnh
   * Guinea nằm ngay dưới dòng địa chỉ đúng — sai một cách rất thuyết phục.
   */
  it('từ chối toạ độ thiếu, sai dải và (0,0)', () => {
    expect(mapPlaceUrl(null)).toBeNull();
    expect(mapPlaceUrl(undefined)).toBeNull();
    expect(mapPlaceUrl({ lat: 0, lng: 0 })).toBeNull();
    expect(mapPlaceUrl({ lat: 91, lng: 106 })).toBeNull();
    expect(mapPlaceUrl({ lat: Number.NaN, lng: 106 })).toBeNull();
  });
});

describe('mapDirectionsUrl', () => {
  it('dựng URL vẽ tuyến giữa hai điểm, chế độ ô tô', () => {
    const url = new URL(mapDirectionsUrl(BEN_THANH, NGUYEN_HUE)!);

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/embed/v1/directions');
    expect(url.searchParams.get('origin')).toBe('10.7721,106.698');
    expect(url.searchParams.get('destination')).toBe('10.7743,106.7038');
    expect(url.searchParams.get('mode')).toBe('driving');
  });

  it('thiếu MỘT trong hai đầu là không vẽ được — trả null, không vẽ nửa tuyến', () => {
    expect(mapDirectionsUrl(BEN_THANH, null)).toBeNull();
    expect(mapDirectionsUrl(null, NGUYEN_HUE)).toBeNull();
  });
});

describe('toGeoPoint', () => {
  it('gộp hai giá trị rời thành một điểm, loại ca thiếu hoặc hỏng', () => {
    expect(toGeoPoint(10.7721, 106.698)).toEqual(BEN_THANH);
    expect(toGeoPoint(null, 106.698)).toBeNull();
    expect(toGeoPoint(10.7721, null)).toBeNull();
    expect(toGeoPoint(0, 0)).toBeNull();
  });
});
