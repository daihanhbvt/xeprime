import { logger } from '@/lib/logger';
import { LOCATION_PERMISSION, type DeviceCoords, type LocationPermission } from '@/lib/device-location';

/**
 * Tỉnh mà trang chủ mở ra ở LẦN ĐẦU, khi người dùng chưa tự chọn gì.
 *
 * Bài toán: một người đang ở Bình Định mở app lần đầu và thấy xe ở khắp nơi — trong khi thứ họ
 * muốn gần như chắc chắn là xe quanh chỗ họ đứng. Nhưng đoán sai còn tệ hơn không đoán: lọc theo
 * một tỉnh KHÔNG CÓ XE nào là một trang chủ rỗng ở ngay lần mở đầu tiên, và người dùng không có
 * cách nào biết vì sao.
 *
 * Nên chuỗi ưu tiên dưới đây kết thúc bằng **Toàn quốc**, và mọi mắt xích đều phải đi qua cùng một
 * cửa kiểm: mã đó có nằm trong danh mục tỉnh ĐANG CÓ XE (`/public/destinations`) không.
 *
 * ## Thứ tự (dừng ở mắt xích đầu tiên trả lời được)
 *
 * 1. **Tỉnh người dùng đã TỰ CHỌN** (`province-memory`) — cục bộ, tức thì, và là ý muốn có thật.
 *    Thắng tất cả, kể cả khi vị trí thiết bị nói khác: người ở Hà Nội thuê xe cho chuyến đi Đà
 *    Nẵng vẫn muốn thấy Đà Nẵng.
 * 2. **Phép đo vị trí đã lưu** (`geo-province-memory`, hạn 12 giờ) — cũng cục bộ, không tốn GPS
 *    và không tốn một lời gọi mạng nào.
 * 3. **Địa chỉ giao xe đã xác nhận** (`delivery-address-memory`) — người này từng khai nhận xe ở
 *    đâu. Đứng TRƯỚC GPS vì nó là thứ chính họ gõ, và không phải hỏi quyền.
 * 4. **Vị trí thiết bị** → `/places/reverse` → `suggestedProvinceCode`. Đây là mắt xích DUY NHẤT
 *    hỏi quyền, và chỉ hỏi khi ba mắt xích trên đều im lặng.
 * 5. **Toàn quốc** — không đoán được, và đó là một câu trả lời đúng chứ không phải một thất bại.
 *
 * Kết quả của mắt xích 4 được NHỚ dù ra tỉnh nào, kể cả `''`: không nhớ thì mỗi lần mở trang chủ
 * ở một tỉnh chưa có xe lại là một lần bật GPS cho không.
 *
 * ## Không mắt xích nào ghi vào bộ nhớ LỰA CHỌN
 *
 * `rememberProvince` chỉ được gọi từ thao tác chủ động của người dùng (ADR 0042 điều 6). Một tỉnh
 * máy tự đoán mà ghi vào đó sẽ tự phong thành "người dùng đã chọn", sống 180 ngày, và theo họ
 * sang mọi ô địa chỉ trong sản phẩm.
 */

export const PROVINCE_SOURCE = {
  /** Người dùng đã tự chọn ở lượt trước. */
  REMEMBERED: 'remembered',
  /** Phép đo vị trí còn hạn, đọc từ bộ đệm cục bộ. */
  GEO_CACHE: 'geo-cache',
  /** Tỉnh của địa chỉ giao xe người dùng đã xác nhận. */
  DELIVERY_ADDRESS: 'delivery-address',
  /** Vừa đo vị trí thiết bị và tra ngược ra tỉnh. */
  DEVICE: 'device',
  /** Không đoán được — không lọc tỉnh. */
  NATIONWIDE: 'nationwide',
} as const;

export type ProvinceSource = (typeof PROVINCE_SOURCE)[keyof typeof PROVINCE_SOURCE];

export interface InitialProvince {
  /** `''` = Toàn quốc. */
  readonly code: string;
  readonly source: ProvinceSource;
}

export interface InitialProvinceDeps {
  /** Tỉnh này có xe trên chợ không — danh mục của CHÍNH bề mặt này (ADR 0042 điều 6). */
  hasVehicles: (provinceCode: string) => boolean;
  readRemembered: () => Promise<string | null>;
  readGeoCache: () => Promise<string | null>;
  readDeliveryProvince: () => Promise<string | null>;
  /** Được phép hỏi quyền vị trí không — trang kết quả và chế độ khách vẫn resolve, chỉ không hỏi. */
  mayAskPermission: boolean;
  getPermission: () => Promise<LocationPermission>;
  requestPermission: () => Promise<LocationPermission>;
  readCoords: () => Promise<DeviceCoords | null>;
  /** `/places/reverse` — trả mã tỉnh gợi ý, `null` khi bản đồ tắt hoặc không quy được. */
  reverseProvince: (coords: DeviceCoords) => Promise<string | null>;
  rememberGeo: (provinceCode: string) => void;
}

const NATIONWIDE: InitialProvince = { code: '', source: PROVINCE_SOURCE.NATIONWIDE };

export async function resolveInitialProvince(deps: InitialProvinceDeps): Promise<InitialProvince> {
  const remembered = await deps.readRemembered();
  logger.debug('[home-province] bộ nhớ lựa chọn', {
    code: remembered ?? null,
    hasVehicles: remembered ? deps.hasVehicles(remembered) : null,
  });
  if (remembered && deps.hasVehicles(remembered)) {
    return { code: remembered, source: PROVINCE_SOURCE.REMEMBERED };
  }

  const cached = await deps.readGeoCache();
  logger.debug('[home-province] bộ đệm vị trí', {
    code: cached,
    hasVehicles: cached ? deps.hasVehicles(cached) : null,
  });
  if (cached !== null) {
    // `''` đã đo rồi và ra Toàn quốc — dừng ở đây, đừng bật GPS lần nữa trong 12 giờ.
    if (cached === '') return NATIONWIDE;
    if (deps.hasVehicles(cached)) return { code: cached, source: PROVINCE_SOURCE.GEO_CACHE };
  }

  const delivery = await deps.readDeliveryProvince();
  logger.debug('[home-province] địa chỉ giao xe đã nhớ', {
    code: delivery ?? null,
    hasVehicles: delivery ? deps.hasVehicles(delivery) : null,
  });
  if (delivery && deps.hasVehicles(delivery)) {
    return { code: delivery, source: PROVINCE_SOURCE.DELIVERY_ADDRESS };
  }

  const fromDevice = await resolveFromDevice(deps);
  return fromDevice ?? NATIONWIDE;
}

async function resolveFromDevice(deps: InitialProvinceDeps): Promise<InitialProvince | null> {
  const current = await deps.getPermission();
  logger.debug('[home-province] quyền vị trí', {
    status: current,
    mayAsk: deps.mayAskPermission,
  });

  let permission = current;
  if (permission === LOCATION_PERMISSION.UNDETERMINED) {
    // Chưa quyết ⇒ được phép hỏi MỘT lần. Đã từ chối thì thôi: hộp thoại thứ hai cho cùng một
    // quyền là cách nhanh nhất để bị tắt vĩnh viễn trong Cài đặt.
    if (!deps.mayAskPermission) return null;
    permission = await deps.requestPermission();
    logger.debug('[home-province] kết quả xin quyền', { status: permission });
  }
  if (permission !== LOCATION_PERMISSION.GRANTED) return null;

  const coords = await deps.readCoords();
  logger.debug('[home-province] toạ độ thiết bị', {
    found: coords !== null,
    source: coords?.source ?? null,
    accuracy: coords?.accuracy ?? null,
  });
  if (!coords) return null;

  const code = await deps.reverseProvince(coords);
  logger.debug('[home-province] tra ngược ra tỉnh', {
    code: code ?? null,
    hasVehicles: code ? deps.hasVehicles(code) : null,
  });

  // Nhớ cả khi tra hụt: `''` nghĩa là "đã đo, không ra tỉnh nào đang có xe" — đúng thứ cần nhớ để
  // không đo lại ngay lần mở sau.
  deps.rememberGeo(code && deps.hasVehicles(code) ? code : '');

  if (!code || !deps.hasVehicles(code)) return null;
  return { code, source: PROVINCE_SOURCE.DEVICE };
}
