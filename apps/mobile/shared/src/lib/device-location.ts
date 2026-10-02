import { Platform } from 'react-native';
import { logger } from '@/lib/logger';

/**
 * Lớp mỏng bọc `expo-location` — vị trí THÔ của thiết bị, không hơn.
 *
 * Cùng hình thái với `features/notifications/messaging.ts` và vì cùng một lý do: module native có
 * thể KHÔNG có trong bản build đang chạy (bản build cũ hơn lần thêm dependency này, hoặc bản web),
 * và đó là trạng thái bình thường chứ không phải sự cố. `import` tĩnh sẽ ném ngay lúc nạp bundle —
 * tức là màn trắng vì một tiện ích phụ. Nên: `require` lười, bọc try/catch, mọi hàm rơi về
 * `unavailable`/`null`.
 *
 * Chỉ đọc vị trí KHI ĐANG DÙNG APP (`requestForegroundPermissionsAsync`). Không có nền, không có
 * theo dõi liên tục: thứ duy nhất app cần là "người này đang ở tỉnh nào" ở lần mở đầu tiên.
 */

type LocationApi = typeof import('expo-location');

export const LOCATION_PERMISSION = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
  /** Không có module native, hoặc dịch vụ vị trí của máy đang tắt. */
  UNAVAILABLE: 'unavailable',
} as const;

export type LocationPermission = (typeof LOCATION_PERMISSION)[keyof typeof LOCATION_PERMISSION];

export interface DeviceCoords {
  readonly latitude: number;
  readonly longitude: number;
  /** Bán kính sai số (mét) nhà cung cấp tự báo — chỉ để log, không dùng để quyết định gì. */
  readonly accuracy: number | null;
  /** `cached` = vị trí cuối cùng máy còn nhớ, `fresh` = vừa đo. */
  readonly source: 'cached' | 'fresh';
}

let cached: LocationApi | null | undefined;

/**
 * Toạ độ đọc được GẦN NHẤT trong lượt chạy app này.
 *
 * Giữ ở bộ nhớ tiến trình, cố ý không lưu bền: nó là câu trả lời cho "người này ĐANG ở đâu", và
 * một toạ độ đọc từ Keystore lúc mở app có thể là của thành phố khác.
 *
 * Tồn tại vì có những nơi cần một điểm NGAY trong lượt render đồng bộ — ảnh xem trước của ô địa
 * chỉ — và vì tấm chọn ghim không nên bắt người dùng đợi một lần đo GPS thứ hai cho cùng một
 * buổi dùng app. Trang chủ thường đã đo rồi (`initial-province.ts`), nên giá trị này gần như
 * luôn có sẵn khi một bản đồ được mở.
 */
let lastCoords: DeviceCoords | null = null;

/** Toạ độ đọc gần nhất trong lượt chạy này — ĐỒNG BỘ, không đo, không hỏi quyền. */
export function getCachedDeviceCoords(): DeviceCoords | null {
  return lastCoords;
}

/** Chỉ dùng trong test. */
export function resetCachedDeviceCoords(): void {
  lastCoords = null;
}

function api(): LocationApi | null {
  if (cached !== undefined) return cached;

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp LƯỜI có chủ đích: xem docblock.
    cached = require('expo-location') as LocationApi;
  } catch (error) {
    logger.debug('[location] không có module expo-location trong bản build này', {
      error: String(error),
    });
    cached = null;
  }
  return cached;
}

export function isDeviceLocationAvailable(): boolean {
  return api() !== null;
}

/** Trạng thái quyền HIỆN TẠI — đọc thôi, không bao giờ hiện hộp thoại. */
export async function getLocationPermission(): Promise<LocationPermission> {
  const location = api();
  if (!location) return LOCATION_PERMISSION.UNAVAILABLE;

  try {
    const { status } = await location.getForegroundPermissionsAsync();
    return toPermission(status);
  } catch (error) {
    logger.warn('[location] không đọc được trạng thái quyền', { error: String(error) });
    return LOCATION_PERMISSION.UNAVAILABLE;
  }
}

/**
 * Xin quyền — HIỆN hộp thoại hệ thống nếu người dùng chưa quyết.
 *
 * Nơi gọi phải tự kiểm tra `getLocationPermission()` trước: hộp thoại này là thứ đắt nhất app có
 * thể tiêu của người dùng, và hỏi lại một câu họ đã trả lời "không" là cách nhanh nhất để bị tắt
 * vĩnh viễn trong Cài đặt.
 */
export async function requestLocationPermission(): Promise<LocationPermission> {
  const location = api();
  if (!location) return LOCATION_PERMISSION.UNAVAILABLE;

  try {
    const { status } = await location.requestForegroundPermissionsAsync();
    return toPermission(status);
  } catch (error) {
    logger.warn('[location] xin quyền thất bại', { error: String(error) });
    return LOCATION_PERMISSION.UNAVAILABLE;
  }
}

/** Bao lâu thì chịu ngồi đợi một lần đo GPS trước khi bỏ cuộc và để trang chủ chạy tiếp. */
const FIX_TIMEOUT_MS = 8_000;

/** Vị trí cuối cùng máy còn nhớ cũ tới mức nào thì không còn nói lên "tôi đang ở đâu". */
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Toạ độ hiện tại, hoặc `null`.
 *
 * ĐỌC BỘ NHỚ CỦA MÁY TRƯỚC (`getLastKnownPositionAsync`): nó trả về tức thì và không bật GPS.
 * Sai số vài trăm mét không quan trọng — thứ suy ra từ toạ độ này là một mã TỈNH.
 *
 * Chỉ khi máy không nhớ gì mới đo thật, ở độ chính xác thấp nhất còn dùng được, và có hạn giờ:
 * một lần đo trong nhà có thể treo vô hạn, và trang chủ thì không được phép đợi nó.
 *
 * KHÔNG tự xin quyền — nơi gọi quyết định lúc nào hỏi.
 */
export async function readDeviceCoords(): Promise<DeviceCoords | null> {
  const location = api();
  if (!location) return null;

  try {
    const last = await location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (last) return remember(toCoords(last, 'cached'));
  } catch (error) {
    logger.debug('[location] không đọc được vị trí đã nhớ', { error: String(error) });
  }

  try {
    const current = await withTimeout(
      location.getCurrentPositionAsync({ accuracy: location.Accuracy.Low }),
      FIX_TIMEOUT_MS,
    );
    return current ? remember(toCoords(current, 'fresh')) : null;
  } catch (error) {
    logger.warn('[location] không đo được vị trí', { error: String(error) });
    return null;
  }
}

function remember(coords: DeviceCoords): DeviceCoords {
  lastCoords = coords;
  return coords;
}

function toPermission(status: string): LocationPermission {
  if (status === 'granted') return LOCATION_PERMISSION.GRANTED;
  if (status === 'undetermined') return LOCATION_PERMISSION.UNDETERMINED;
  return LOCATION_PERMISSION.DENIED;
}

function toCoords(
  position: { coords: { latitude: number; longitude: number; accuracy: number | null } },
  source: DeviceCoords['source'],
): DeviceCoords {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
    source,
  };
}

/** `null` khi hết giờ — lời hứa gốc vẫn chạy tiếp, nó chỉ không còn ai đợi. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
