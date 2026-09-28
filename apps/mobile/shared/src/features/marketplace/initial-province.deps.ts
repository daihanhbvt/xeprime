import { placesApi } from '@/api/locations/api';
import {
  getLocationPermission,
  readDeviceCoords,
  requestLocationPermission,
  type DeviceCoords,
} from '@/lib/device-location';
import { readDeliveryAddress } from '@/lib/delivery-address-memory';
import { rememberGeoProvince, readGeoProvince } from '@/lib/geo-province-memory';
import { logger } from '@/lib/logger';
import { requestPermissionExclusively } from '@/lib/permission-queue';
import { readRememberedProvince } from '@/lib/province-memory';
import type { InitialProvinceDeps } from './initial-province';

/**
 * Nối `resolveInitialProvince` với thiết bị thật — tách khỏi `initial-province.ts` để phần LUẬT
 * (thứ tự ưu tiên, điều kiện hỏi quyền) test được mà không cần module native nào.
 */
export function deviceInitialProvinceDeps(options: {
  hasVehicles: (provinceCode: string) => boolean;
  mayAskPermission: boolean;
}): InitialProvinceDeps {
  return {
    hasVehicles: options.hasVehicles,
    mayAskPermission: options.mayAskPermission,
    readRemembered: readRememberedProvince,
    readGeoCache: readGeoProvince,
    readDeliveryProvince: async () => (await readDeliveryAddress())?.provinceCode ?? null,
    getPermission: getLocationPermission,
    // Qua hàng đợi: quyền THÔNG BÁO cũng được xin từ trang chủ, và hai hộp thoại cùng lúc thì
    // cái sau bị hệ điều hành từ chối thẳng mà không hỏi ai.
    requestPermission: () => requestPermissionExclusively('location', requestLocationPermission),
    readCoords: readDeviceCoords,
    reverseProvince,
    rememberGeo: rememberGeoProvince,
  };
}

async function reverseProvince(coords: DeviceCoords): Promise<string | null> {
  try {
    const result = await placesApi.reverse({ lat: coords.latitude, lng: coords.longitude });
    // `available: false` = chưa cấu hình khoá bản đồ; đó là cấu hình, không phải lỗi (ADR 0018).
    return result.place?.suggestedProvinceCode ?? null;
  } catch (error) {
    logger.warn('[home-province] tra ngược toạ độ thất bại', { error: String(error) });
    return null;
  }
}
