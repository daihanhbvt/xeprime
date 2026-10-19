import { mapExternalUrl, mapSearchUrl, toGeoPoint } from '@xeprime/domain';

/**
 * Liên kết mở Google Maps cho một điểm đón/đến: có toạ độ thì dùng `mapExternalUrl` (ADR 0061);
 * chỉ có địa chỉ chữ thì tìm theo chữ (`mapSearchUrl`).
 */
export function placeMapUrl(
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const point = toGeoPoint(lat, lng);
  if (point) return mapExternalUrl(point);
  return mapSearchUrl(address);
}
