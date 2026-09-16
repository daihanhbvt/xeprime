import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isMapConfigured, mapPlaceUrl, mapRouteUrl, toGeoPoint } from './map-static';

const KEY = 'test-map-key';
const BEN_THANH = { lat: 10.7721, lng: 106.698 };
const NGUYEN_HUE = { lat: 10.7743, lng: 106.7038 };

beforeEach(() => {
  process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY = KEY;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
});

describe('chưa cấu hình key bản đồ', () => {
  it('mọi URL đều là null — nơi gọi ẩn khối bản đồ thay vì render khung vỡ', () => {
    delete process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;

    expect(isMapConfigured()).toBe(false);
    expect(mapPlaceUrl(BEN_THANH)).toBeNull();
    expect(mapRouteUrl(BEN_THANH, NGUYEN_HUE)).toBeNull();
  });
});

describe('mapPlaceUrl', () => {
  it('dựng URL ảnh tĩnh ghim MỘT điểm bằng toạ độ', () => {
    const url = new URL(mapPlaceUrl(BEN_THANH)!);

    expect(url.origin + url.pathname).toBe('https://maps.geoapify.com/v1/staticmap');
    // Geoapify đọc LON trước LAT — đảo nhầm ở Việt Nam cho ra một điểm giữa Ấn Độ Dương, vẫn
    // hợp lệ và không có gì báo lỗi.
    expect(url.searchParams.get('center')).toBe('lonlat:106.698,10.7721');
    expect(url.searchParams.get('marker')).toContain('lonlat:106.698,10.7721');
    expect(url.searchParams.get('apiKey')).toBe(KEY);
  });

  it('màu ghim là màu thương hiệu, mã hoá đúng để không cắt cụt URL', () => {
    const raw = mapPlaceUrl(BEN_THANH)!;

    // `#` để nguyên sẽ biến phần còn lại của URL thành fragment và máy chủ nhận một tham số cụt.
    expect(raw).toContain('color:%23');
    expect(raw).not.toContain('color:#');
    expect(new URL(raw).searchParams.get('marker')).toContain('color:#d6a02c');
  });

  /**
   * Phép kiểm đáng giá nhất của file: toạ độ hỏng lọt qua sẽ thành một cái ghim ở Vịnh Guinea
   * nằm ngay dưới dòng địa chỉ đúng — sai một cách rất thuyết phục.
   */
  it('từ chối toạ độ thiếu, sai dải và (0,0)', () => {
    expect(mapPlaceUrl(null)).toBeNull();
    expect(mapPlaceUrl(undefined)).toBeNull();
    expect(mapPlaceUrl({ lat: 0, lng: 0 })).toBeNull();
    expect(mapPlaceUrl({ lat: 91, lng: 106 })).toBeNull();
    expect(mapPlaceUrl({ lat: Number.NaN, lng: 106 })).toBeNull();
  });
});

/**
 * Tách `area=rect:lon1,lat1,lon2,lat2` thành bốn số có TÊN.
 *
 * Đọc bằng chỉ số trần (`parts[0]`) vừa khó rà vừa cho ra `number | undefined` dưới
 * `noUncheckedIndexedAccess` — mà bốn con số này chính là chỗ một lần đảo lat/lon sẽ lọt qua.
 */
function parseRect(url: string): { lon1: number; lat1: number; lon2: number; lat2: number } {
  const parts = new URL(url).searchParams.get('area')!.replace('rect:', '').split(',').map(Number);
  expect(parts).toHaveLength(4);
  const [lon1, lat1, lon2, lat2] = parts as [number, number, number, number];
  return { lon1, lat1, lon2, lat2 };
}

describe('mapRouteUrl', () => {
  it('ghim cả hai đầu và đánh số 1 → 2 theo chiều giao', () => {
    const url = new URL(mapRouteUrl(BEN_THANH, NGUYEN_HUE)!);
    const marker = url.searchParams.get('marker')!;

    const [first, second] = marker.split('|');
    expect(first).toContain('lonlat:106.698,10.7721');
    expect(first).toContain('text:1');
    expect(second).toContain('lonlat:106.7038,10.7743');
    expect(second).toContain('text:2');
  });

  /**
   * Khung bao phải NỚI RỘNG hơn hai cái ghim. Ảnh bị `object-fit: cover` cắt cho vừa khung thật
   * trên trang, nên một ghim nằm sát mép ảnh là một ghim người xem không thấy.
   */
  it('khung bao nới rộng quanh hai điểm, không bó sát', () => {
    const { lon1, lat1, lon2, lat2 } = parseRect(mapRouteUrl(BEN_THANH, NGUYEN_HUE)!);

    expect(lon1).toBeLessThan(Math.min(BEN_THANH.lng, NGUYEN_HUE.lng));
    expect(lon2).toBeGreaterThan(Math.max(BEN_THANH.lng, NGUYEN_HUE.lng));
    // `rect` đi từ góc TRÊN-TRÁI xuống DƯỚI-PHẢI, nên vĩ độ đầu phải lớn hơn vĩ độ sau.
    expect(lat1).toBeGreaterThan(lat2);
    expect(lat1).toBeGreaterThan(Math.max(BEN_THANH.lat, NGUYEN_HUE.lat));
    expect(lat2).toBeLessThan(Math.min(BEN_THANH.lat, NGUYEN_HUE.lat));
  });

  it('hai điểm TRÙNG nhau vẫn cho khung bao dùng được, không phải một khung rỗng', () => {
    const { lon1, lat1, lon2, lat2 } = parseRect(mapRouteUrl(BEN_THANH, BEN_THANH)!);

    expect(lon2 - lon1).toBeGreaterThan(0);
    expect(lat1 - lat2).toBeGreaterThan(0);
  });

  it('thiếu MỘT trong hai đầu là không vẽ được — trả null, không vẽ nửa chuyến', () => {
    expect(mapRouteUrl(BEN_THANH, null)).toBeNull();
    expect(mapRouteUrl(null, NGUYEN_HUE)).toBeNull();
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
