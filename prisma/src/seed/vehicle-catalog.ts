/**
 * DANH MỤC HÃNG & MẪU XE của thị trường Việt Nam — dữ liệu nền (`SEED_MODE=system`).
 *
 * Đây KHÔNG phải dữ liệu demo. Nó là danh mục mà chủ xe thật sẽ chọn khi đăng xe, nên mọi mẫu
 * trong file này đều kèm `sourceUrl` trỏ tới TRANG SẢN PHẨM CHÍNH HÃNG đã đối chiếu và
 * `verifiedAt` là ngày đối chiếu. Quy tắc một dòng:
 *
 *     không có nguồn thì không có mẫu.
 *
 * Vì sao vài trường để trống có chủ đích:
 *
 *  - `engineDisplacementCc`: tên thương mại ("SH350i", "Vario 160") là DUNG TÍCH DANH NGHĨA,
 *    không phải dung tích thực (SH350i là 330cc). Điền số từ tên xe là bịa một thông số kỹ thuật
 *    rồi đem gợi ý cho chủ xe. Để trống — chủ xe đọc đúng con số trên đăng ký xe, và admin bổ
 *    sung sau khi có bảng thông số chính hãng.
 *  - `seatCount` của ô tô: cùng lý do — cùng một dòng xe có bản 7 và bản 8 chỗ.
 *  - `fuelTypes` / `transmissions`: chỉ điền khi cả DÒNG xe chỉ có một lựa chọn (xe điện, xe
 *    hybrid). Xe xăng phổ thông có nhiều phiên bản số sàn/tự động nên để rỗng = "chưa xác minh",
 *    và form KHÔNG lọc theo nó (xem `vehicle_catalog_models.fuel_types` trong schema).
 *
 * Các hãng chưa đối chiếu được (trang chính hãng chặn truy cập tự động — HTTP 403) nằm ở
 * `UNVERIFIED_BRANDS` bên dưới: hãng vẫn có trong danh mục để chủ xe chọn, nhưng KHÔNG có mẫu
 * nào được thêm cho tới khi có người mở trang và đối chiếu tay.
 */
import { CATALOG_MARKET_STATUS, MOTORBIKE_CATEGORY, VEHICLE_TYPE } from '@xeprime/types';

/** Ngày đối chiếu toàn bộ nguồn trong file này. */
export const CATALOG_VERIFIED_AT = new Date('2026-09-09T00:00:00.000Z');

/** Trang nguồn — một hằng cho mỗi trang, để không có URL nào bị gõ lệch giữa hai mẫu. */
const SOURCE = {
  TOYOTA: 'https://www.toyota.com.vn/danh-sach-xe',
  HONDA_CAR: 'https://www.honda.com.vn/o-to/san-pham',
  HONDA_BIKE: 'https://www.honda.com.vn/xe-may/san-pham',
  YAMAHA: 'https://yamaha-motor.com.vn/xe/',
  HYUNDAI: 'https://hyundai.thanhcong.vn/',
  MITSUBISHI: 'https://mitsubishi-motors.com.vn/',
} as const;

/**
 * Loại phương tiện mỗi hãng có bán tại Việt Nam — quyết định hãng nào hiện ra khi chủ xe đã chọn
 * "Ô tô" hay "Xe máy". Mảng rỗng nghĩa là "áp dụng mọi loại", nên phải khai tường minh.
 */
export const BRAND_VEHICLE_TYPES: Readonly<Record<string, readonly string[]>> = {
  // Chỉ ô tô
  toyota: [VEHICLE_TYPE.CAR],
  hyundai: [VEHICLE_TYPE.CAR],
  kia: [VEHICLE_TYPE.CAR],
  mazda: [VEHICLE_TYPE.CAR],
  ford: [VEHICLE_TYPE.CAR],
  mitsubishi: [VEHICLE_TYPE.CAR],
  nissan: [VEHICLE_TYPE.CAR],
  chevrolet: [VEHICLE_TYPE.CAR],
  peugeot: [VEHICLE_TYPE.CAR],
  volkswagen: [VEHICLE_TYPE.CAR],
  bmw: [VEHICLE_TYPE.CAR],
  mercedes: [VEHICLE_TYPE.CAR],
  mini: [VEHICLE_TYPE.CAR],
  // Cả hai
  honda: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  suzuki: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  vinfast: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  // Chỉ xe máy
  yamaha: [VEHICLE_TYPE.MOTORBIKE],
  piaggio: [VEHICLE_TYPE.MOTORBIKE],
  sym: [VEHICLE_TYPE.MOTORBIKE],
};

/** Hãng xe máy chưa có trong danh mục gốc — thêm để chủ xe máy không phải chọn "Khác". */
export const ADDITIONAL_BRANDS: readonly {
  key: string;
  label: string;
  vehicleTypes: readonly string[];
  sortOrder: number;
}[] = [
  { key: 'piaggio', label: 'Piaggio', vehicleTypes: [VEHICLE_TYPE.MOTORBIKE], sortOrder: 17 },
  { key: 'sym', label: 'SYM', vehicleTypes: [VEHICLE_TYPE.MOTORBIKE], sortOrder: 18 },
];

/**
 * Hãng CÓ trong danh mục nhưng CHƯA đối chiếu được mẫu xe: trang sản phẩm chính hãng trả HTTP 403
 * với truy cập tự động (09/09/2026). Chủ xe vẫn chọn được hãng và tự gõ tên mẫu; danh sách mẫu
 * để trống cho tới khi có người mở trang và nhập tay.
 *
 * Đây là danh sách công khai chứ không phải ghi chú nội bộ: nó là thứ nói cho người rà danh mục
 * sau này biết chỗ nào còn thiếu và VÌ SAO thiếu, thay vì tưởng danh mục đã đủ.
 */
export const UNVERIFIED_BRANDS: readonly { key: string; url: string; reason: string }[] = [
  { key: 'vinfast', url: 'https://vinfastauto.com/vn_vi/san-pham', reason: 'HTTP 403' },
  { key: 'ford', url: 'https://www.ford.com.vn/vehicles/', reason: 'HTTP 403' },
  { key: 'piaggio', url: 'https://www.piaggio.com/vn_VI/', reason: 'HTTP 403' },
];

export interface CatalogModelSeed {
  brandKey: string;
  vehicleType: string;
  /** Tên hiển thị ĐÚNG như hãng công bố. */
  label: string;
  marketStatus?: string;
  motorbikeCategory?: string;
  fuelTypes?: readonly string[];
  transmissions?: readonly string[];
  sourceUrl: string;
}

const M = MOTORBIKE_CATEGORY;

/**
 * Ô TÔ — các dòng đang phân phối chính hãng tại Việt Nam.
 *
 * Danh sách lấy đúng theo trang sản phẩm của từng hãng, không thêm dòng nào từ trí nhớ. Các dòng
 * xe thương mại (xe tải, xe khách) của Hyundai không đưa vào: nền tảng cho thuê xe du lịch.
 */
const CAR_MODELS: readonly CatalogModelSeed[] = [
  // ── Toyota ────────────────────────────────────────────────────────────────
  ...[
    'Vios',
    'Wigo',
    'Camry',
    'Corolla Cross',
    'Yaris Cross',
    'Raize',
    'Veloz Cross',
    'Avanza Premio',
    'Innova Cross',
    'Fortuner',
    'Hilux',
    'Alphard',
    'Land Cruiser',
    'Land Cruiser Prado',
  ].map((label) => ({
    brandKey: 'toyota',
    vehicleType: VEHICLE_TYPE.CAR,
    label,
    sourceUrl: SOURCE.TOYOTA,
  })),

  // ── Honda ô tô ────────────────────────────────────────────────────────────
  ...['City', 'Civic', 'BR-V', 'HR-V', 'CR-V'].map((label) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.CAR,
    label,
    sourceUrl: SOURCE.HONDA_CAR,
  })),

  // ── Hyundai ───────────────────────────────────────────────────────────────
  ...[
    'Grand i10',
    'Accent',
    'Elantra',
    'Venue',
    'Creta',
    'Tucson',
    'Santa Fe',
    'Palisade',
    'Stargazer',
    'Custin',
  ].map((label) => ({
    brandKey: 'hyundai',
    vehicleType: VEHICLE_TYPE.CAR,
    label,
    sourceUrl: SOURCE.HYUNDAI,
  })),
  {
    brandKey: 'hyundai',
    vehicleType: VEHICLE_TYPE.CAR,
    label: 'IONIQ 5',
    // Dòng thuần điện — đây là thông tin của chính dòng xe, không phải suy đoán theo phiên bản.
    fuelTypes: ['electric'],
    transmissions: ['direct_drive'],
    sourceUrl: SOURCE.HYUNDAI,
  },

  // ── Mitsubishi ────────────────────────────────────────────────────────────
  ...['Attrage', 'Xpander', 'Xpander Cross', 'Xforce', 'Destinator', 'Triton', 'Pajero Sport'].map(
    (label) => ({
      brandKey: 'mitsubishi',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: SOURCE.MITSUBISHI,
    }),
  ),
];

/**
 * XE MÁY — phân khúc lấy đúng theo cách CHÍNH HÃNG xếp nhóm trên trang sản phẩm (Honda: "Xe ga" ·
 * "Xe số" · "Xe côn tay" · "Mô tô; Yamaha: "Xe tay ga" · "Xe số & côn tay" · "Xe điện" ·
 * "Mô tô thể thao"), không tự phân loại lại.
 */
const MOTORBIKE_MODELS: readonly CatalogModelSeed[] = [
  // ── Honda — xe ga ─────────────────────────────────────────────────────────
  ...[
    'Vision',
    'LEAD',
    'Air Blade 125',
    'Air Blade 160',
    'Vario 125',
    'Vario 160',
    'SH Mode 125',
    'SH125i',
    'SH160i',
    'SH350i',
    'ADV350',
  ].map((label) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.SCOOTER,
    fuelTypes: ['gasoline'],
    transmissions: ['automatic_cvt'],
    sourceUrl: SOURCE.HONDA_BIKE,
  })),
  // ── Honda — xe số ─────────────────────────────────────────────────────────
  ...['Wave Alpha', 'Wave RSX', 'Blade', 'Future 125 FI', 'Super Cub C125', 'CT125'].map(
    (label) => ({
      brandKey: 'honda',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.UNDERBONE,
      fuelTypes: ['gasoline'],
      transmissions: ['semi_automatic'],
      sourceUrl: SOURCE.HONDA_BIKE,
    }),
  ),
  // ── Honda — côn tay & mô tô ───────────────────────────────────────────────
  ...['Winner R', 'CBR150R', 'CBR500R', 'CBR650R', 'CBR1000RR-R'].map((label) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.SPORT,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.HONDA_BIKE,
  })),
  ...['CB500 Hornet', 'CB650R', 'CB1000 Hornet', "CB350 H'ness"].map((label) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.NAKED,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.HONDA_BIKE,
  })),
  ...['Rebel 500', 'Rebel 1100', 'CL500'].map((label) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.CRUISER,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.HONDA_BIKE,
  })),
  ...['NX500', 'Transalp', 'Africa Twin'].map((label) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.ADVENTURE,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.HONDA_BIKE,
  })),
  {
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label: 'Gold Wing',
    motorbikeCategory: M.TOURING,
    fuelTypes: ['gasoline'],
    sourceUrl: SOURCE.HONDA_BIKE,
  },

  // ── Yamaha — xe tay ga ────────────────────────────────────────────────────
  ...['Janus', 'Latte', 'Grande', 'Freego', 'LEXi', 'NVX', 'NMAX', 'XMAX', 'TMAX'].map((label) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.SCOOTER,
    fuelTypes: ['gasoline'],
    transmissions: ['automatic_cvt'],
    sourceUrl: SOURCE.YAMAHA,
  })),
  {
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label: 'GEAR 125 Hybrid',
    motorbikeCategory: M.SCOOTER,
    // Hãng bán đúng một bản hybrid cho dòng này — tên thương mại nói thẳng điều đó.
    fuelTypes: ['hybrid'],
    transmissions: ['automatic_cvt'],
    sourceUrl: SOURCE.YAMAHA,
  },
  {
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label: "NEO's",
    motorbikeCategory: M.SCOOTER,
    fuelTypes: ['electric'],
    transmissions: ['direct_drive'],
    sourceUrl: SOURCE.YAMAHA,
  },
  // ── Yamaha — xe số ────────────────────────────────────────────────────────
  ...['Sirius', 'Sirius FI', 'Jupiter Finn', 'PG-1'].map((label) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.UNDERBONE,
    fuelTypes: ['gasoline'],
    transmissions: ['semi_automatic'],
    sourceUrl: SOURCE.YAMAHA,
  })),
  // ── Yamaha — côn tay & mô tô thể thao ─────────────────────────────────────
  ...['Exciter 155 VVA', 'Exciter 155 VVA TCS'].map((label) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.SPORT,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.YAMAHA,
  })),
  ...['YZF-R15', 'YZF-R3', 'YZF-R7'].map((label) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.SPORT,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.YAMAHA,
  })),
  ...['MT-15', 'MT-03', 'MT-07', 'MT-09', 'MT-10', 'XS155R'].map((label) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.NAKED,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.YAMAHA,
  })),
  ...['Ténéré 700', 'WR155R'].map((label) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    motorbikeCategory: M.ADVENTURE,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.YAMAHA,
  })),
  {
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label: 'TRACER-09',
    motorbikeCategory: M.TOURING,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: SOURCE.YAMAHA,
  },
];

/**
 * Mẫu xe ĐỜI TRƯỚC — đã ngừng phân phối nhưng còn chạy dịch vụ rất nhiều.
 *
 * Không có nhóm này thì chủ chiếc Innova 2018 hay chiếc Wave 110 buộc phải chọn "Khác", và toàn
 * bộ lợi ích của danh mục chuẩn hoá biến mất đúng ở nhóm xe đông nhất. Chúng nằm ở nhóm thứ hai
 * trong ô chọn ("Mẫu xe đời trước"), không lẫn với xe đang bán.
 *
 * Nguồn là chính trang sản phẩm hiện tại của hãng — nơi các dòng này đã BIẾN MẤT so với bản
 * trước đó; đó là bằng chứng "ngừng phân phối", không phải trí nhớ.
 */
const LEGACY_MODELS: readonly CatalogModelSeed[] = [
  // Toyota: các dòng đã rời trang sản phẩm hiện tại (Innova Cross thay Innova, Avanza Premio thay
  // Avanza, Yaris Cross thay Yaris). Nhãn giữ nguyên tên thương mại — `marketStatus` đã nói nó
  // thuộc nhóm nào, thêm hậu tố "(đời cũ)" vào tên xe chỉ làm bẩn dữ liệu hiển thị.
  ...['Innova', 'Avanza', 'Rush', 'Corolla Altis', 'Yaris'].map((label) => ({
    brandKey: 'toyota',
    vehicleType: VEHICLE_TYPE.CAR,
    label,
    marketStatus: CATALOG_MARKET_STATUS.LEGACY,
    sourceUrl: SOURCE.TOYOTA,
  })),
  // Honda: bản dung tích cũ đã được thay bằng bản mới trên chính trang sản phẩm (Air Blade 150 →
  // 160, SH150i → SH160i, Winner X → Winner R).
  ...[
    { label: 'Air Blade 150', category: M.SCOOTER },
    { label: 'SH150i', category: M.SCOOTER },
    { label: 'Winner X', category: M.SPORT },
  ].map(({ label, category }) => ({
    brandKey: 'honda',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    marketStatus: CATALOG_MARKET_STATUS.LEGACY,
    motorbikeCategory: category,
    fuelTypes: ['gasoline'],
    sourceUrl: SOURCE.HONDA_BIKE,
  })),
  // Yamaha: Exciter 150 đã được thay bằng bản 155 VVA; Nouvo và Acruzo không còn trên trang xe.
  ...[
    { label: 'Exciter 150', category: M.SPORT },
    { label: 'Nouvo', category: M.SCOOTER },
    { label: 'Acruzo', category: M.SCOOTER },
  ].map(({ label, category }) => ({
    brandKey: 'yamaha',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label,
    marketStatus: CATALOG_MARKET_STATUS.LEGACY,
    motorbikeCategory: category,
    fuelTypes: ['gasoline'],
    sourceUrl: SOURCE.YAMAHA,
  })),
];

/** Toàn bộ mẫu xe của danh mục nền. */
export const CATALOG_MODELS: readonly CatalogModelSeed[] = [
  ...CAR_MODELS,
  ...MOTORBIKE_MODELS,
  ...LEGACY_MODELS,
];
