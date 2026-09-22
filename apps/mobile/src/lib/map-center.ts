import type { GeoPoint } from '@xeprime/domain';
import {
  getCachedDeviceCoords,
  getLocationPermission,
  readDeviceCoords,
  requestLocationPermission,
  LOCATION_PERMISSION,
} from '@/lib/device-location';
import { logger } from '@/lib/logger';
import { FALLBACK_CENTER } from '@/lib/map-interactive';
import { requestPermissionExclusively } from '@/lib/permission-queue';

/**
 * Bản đồ mở ra ở ĐÂU khi chưa có gì để mở ra.
 *
 * Trước đợt này, một bản đồ không ghim luôn mở ở `FALLBACK_CENTER` — một hằng số giữa Đà Nẵng.
 * Với người ở Bình Định, cú chạm đầu tiên vào bản đồ là một màn hình cách chỗ họ đứng 300km, và
 * việc đầu tiên phải làm là thu nhỏ ra rồi kéo ngược về. Hằng số đó không sai, nó chỉ là thứ cuối
 * cùng còn lại khi không ai biết gì.
 *
 * ## Thứ tự
 *
 * 1. **Ghim đang có** — không bàn.
 * 2. **Điểm neo của bề mặt** (`anchor`) — ở ô địa chỉ, đó là TÂM TỈNH người dùng vừa chọn ngay
 *    phía trên. Nó đứng TRƯỚC vị trí thiết bị, và đó là chỗ dễ làm ngược nhất: một người đang ở
 *    Hà Nội khai địa chỉ chi nhánh Đà Nẵng đã NÓI RA tỉnh họ muốn — mở bản đồ ở Hà Nội là đưa
 *    họ về đúng chỗ họ vừa từ chối.
 * 3. **Vị trí thiết bị** — câu trả lời đúng cho mọi lần còn lại.
 * 4. **`FALLBACK_CENTER`**.
 *
 * ## Hỏi quyền ở đây
 *
 * Chỉ tới được mắt xích 3 khi hai mắt xích trên đều im lặng, tức là người dùng vừa mở một bản đồ
 * trống và không có gì để định vị nó. Đó là một thời điểm hợp lệ để hỏi — câu hỏi có ngữ cảnh
 * nhìn thấy được. Đã từ chối thì không hỏi lại, và hộp thoại đi qua hàng đợi chung
 * (`permission-queue.ts`).
 *
 * `mayAsk: false` cho những bề mặt chỉ XEM (ảnh tĩnh): ở đó không có cú chạm nào của người dùng
 * để biện minh cho một hộp thoại, nên chúng chỉ dùng toạ độ đã đọc được từ trước.
 */

/** Đợi tối đa bao lâu cho một lần đo khi người dùng đang nhìn một tấm bản đồ chưa vẽ. */
const OPEN_TIMEOUT_MS = 4_000;

export type MapCenterSource = 'value' | 'anchor' | 'device' | 'fallback';

export interface MapCenter {
  readonly center: GeoPoint;
  readonly source: MapCenterSource;
}

export interface ResolveMapCenterOptions {
  /** Ghim hiện có trong form. */
  value?: GeoPoint | null;
  /** Điểm neo của bề mặt — tâm tỉnh đang chọn, vị trí xe… */
  anchor?: GeoPoint | null;
  /** Được phép HIỆN hộp thoại xin quyền vị trí. Mặc định có, vì nơi gọi là một cú chạm. */
  mayAsk?: boolean;
}

/**
 * Bản ĐỒNG BỘ — chỉ dùng những gì đã biết, không đo, không hỏi.
 *
 * Dành cho lượt render đầu tiên và cho ảnh tĩnh: cả hai đều phải trả về một khung hình NGAY, và
 * không được phép đợi một promise.
 */
export function mapCenterNow(options: ResolveMapCenterOptions): MapCenter {
  if (options.value) return { center: options.value, source: 'value' };
  if (options.anchor) return { center: options.anchor, source: 'anchor' };

  const cached = getCachedDeviceCoords();
  if (cached) {
    return { center: { lat: cached.latitude, lng: cached.longitude }, source: 'device' };
  }
  return { center: FALLBACK_CENTER, source: 'fallback' };
}

/**
 * Bản ĐẦY ĐỦ — được đo, và được hỏi quyền nếu người dùng chưa quyết.
 *
 * Trả về đúng kết quả của `mapCenterNow` khi hai mắt xích đầu đã trả lời được, nên nơi gọi không
 * phải tự phân nhánh: chỉ khi thật sự không có gì mới có một lần đợi.
 */
export async function resolveMapCenter(options: ResolveMapCenterOptions): Promise<MapCenter> {
  const immediate = mapCenterNow(options);
  if (immediate.source !== 'fallback') {
    logger.debug('[map-center] có sẵn', { source: immediate.source });
    return immediate;
  }

  let permission = await getLocationPermission();
  if (permission === LOCATION_PERMISSION.UNDETERMINED && options.mayAsk !== false) {
    permission = await requestPermissionExclusively('location', requestLocationPermission);
  }
  logger.debug('[map-center] quyền vị trí', { status: permission });
  if (permission !== LOCATION_PERMISSION.GRANTED) return immediate;

  // Có hạn giờ: một lần đo trong nhà treo vô hạn, và ở đây người dùng đang nhìn một tấm bản đồ
  // chưa vẽ. Hết giờ thì mở ở hằng số — chậm còn tệ hơn mở sai chỗ, vì sai chỗ thì kéo là xong.
  const coords = await withTimeout(readDeviceCoords(), OPEN_TIMEOUT_MS);
  logger.debug('[map-center] toạ độ thiết bị', {
    found: coords !== null,
    source: coords?.source ?? null,
  });
  if (!coords) return immediate;

  return { center: { lat: coords.latitude, lng: coords.longitude }, source: 'device' };
}

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
