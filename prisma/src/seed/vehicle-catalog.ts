/**
 * DANH MỤC HÃNG & MẪU XE của thị trường Việt Nam — dữ liệu nền (`SEED_MODE=system`).
 *
 * Đây KHÔNG phải dữ liệu demo. Nó là danh mục mà chủ xe thật sẽ chọn khi đăng xe, nên mọi mẫu
 * trong file này đều kèm `sourceUrl` trỏ tới một trang tra được và `verifiedAt` là ngày đối
 * chiếu. Quy tắc một dòng:
 *
 *     không có nguồn thì không có mẫu.
 *
 * Nguồn có HAI HẠNG, và hai hạng đó phân biệt được từ chính hằng đang dùng: `SOURCE` là trang sản
 * phẩm chính hãng, `MARKET_SOURCE` là bảng giá thị trường — dùng cho những hãng mà trang chính
 * hãng chặn truy cập tự động. Đọc docblock của `MARKET_SOURCE` trước khi thêm mẫu vào hạng hai.
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
 * Hãng nào chưa đối chiếu được mẫu nào thì khai ở `UNVERIFIED_BRANDS` bên dưới: hãng vẫn có trong
 * danh mục để chủ xe chọn, nhưng danh sách mẫu để trống cho tới khi có người mở trang và đối
 * chiếu tay. Sau đợt rà 14/09/2026 thì danh sách đó rỗng.
 */
import { CATALOG_MARKET_STATUS, MOTORBIKE_CATEGORY, VEHICLE_TYPE } from '@xeprime/types';

/**
 * Ngày đối chiếu MẶC ĐỊNH — đợt rà đầu tiên (Toyota, Honda, Hyundai, Mitsubishi, Yamaha).
 *
 * Mẫu nào được rà ở đợt sau thì mang `verifiedAt` riêng. Dùng chung một hằng cho cả file nghĩa
 * là mỗi lần bổ sung một hãng, toàn bộ hãng cũ cũng được đóng dấu "vừa kiểm tra" — một lời khai
 * sai về chính dữ liệu của mình.
 */
export const CATALOG_VERIFIED_AT = new Date('2026-09-09T00:00:00.000Z');

/** Đợt rà thứ hai: bổ sung 14 hãng chưa có mẫu nào (VinFast, Kia, Mazda, Ford, …). */
export const CATALOG_VERIFIED_AT_ROUND_2 = new Date('2026-09-14T00:00:00.000Z');

/** Trang nguồn — một hằng cho mỗi trang, để không có URL nào bị gõ lệch giữa hai mẫu. */
const SOURCE = {
  TOYOTA: 'https://www.toyota.com.vn/danh-sach-xe',
  HONDA_CAR: 'https://www.honda.com.vn/o-to/san-pham',
  HONDA_BIKE: 'https://www.honda.com.vn/xe-may/san-pham',
  YAMAHA: 'https://yamaha-motor.com.vn/xe/',
  HYUNDAI: 'https://hyundai.thanhcong.vn/',
  MITSUBISHI: 'https://mitsubishi-motors.com.vn/',
  KIA: 'https://kiavietnam.com.vn/',
  SUZUKI_CAR: 'https://www.suzuki.com.vn/automobile',
  SYM: 'https://www.sym.com.vn/',
} as const;

/**
 * Nguồn THỨ CẤP — bảng giá thị trường, dùng cho những hãng mà trang chính hãng CHẶN truy cập tự
 * động (HTTP 403 / chứng chỉ TLS không khớp tên miền, kiểm 14/09/2026).
 *
 * Đây là một sự nhượng bộ có ý thức, không phải nới lỏng luật "không có nguồn thì không có mẫu":
 * mỗi mẫu vẫn trỏ tới MỘT trang tra được, và người rà lại sau này biết chính xác mình đang đọc
 * loại nguồn nào. Đổi lại, danh mục không còn 14 hãng rỗng — mà một hãng rỗng thì chủ xe buộc
 * phải bỏ trống ô "Mẫu xe", và toàn bộ lợi ích của danh mục chuẩn hoá biến mất ở đúng những hãng
 * đông xe dịch vụ nhất (VinFast, Kia, Mazda, Ford).
 *
 * Việc cần làm sau: mở tay từng trang chính hãng, đối chiếu và chuyển dần sang `SOURCE`.
 */
const MARKET_SOURCE = {
  VINFAST_CAR: 'https://bonbanh.com/gia-xe-oto-vinfast',
  VINFAST_BIKE: 'https://xemaynamtien.net/tin-tuc/xe-may-dien-vinfast-2026-ra-mat-4-mau-moi/',
  KIA_LEGACY: 'https://oto.com.vn/bang-gia-xe-o-to-kia-moi-nhat',
  MAZDA: 'https://oto.com.vn/bang-gia-xe-o-to-mazda-moi-nhat',
  FORD: 'https://oto.com.vn/bang-gia-xe-o-to-ford-moi-nhat',
  NISSAN: 'https://oto.com.vn/bang-gia-xe-o-to-nissan-moi-nhat',
  PEUGEOT: 'https://oto.com.vn/bang-gia-xe-o-to-peugeot-moi-nhat',
  MERCEDES: 'https://oto.com.vn/bang-gia-xe-o-to-mercedes-benz-moi-nhat',
  BMW: 'https://oto.com.vn/bang-gia-xe-o-to-bmw-moi-nhat',
  VOLKSWAGEN: 'https://oto.com.vn/bang-gia-xe-o-to-volkswagen-moi-nhat',
  MINI: 'https://oto.com.vn/bang-gia-xe-o-to-mini-moi-nhat',
  CHEVROLET: 'https://oto.com.vn/bang-gia-xe-o-to-chevrolet-moi-nhat',
  PIAGGIO: 'https://giaxe.2banh.vn/bang-gia-xe-piaggio-41.html',
  VESPA: 'https://giaxe.2banh.vn/bang-gia-xe-vespa-117.html',
  SUZUKI_BIKE: 'https://giaxe.2banh.vn/bang-gia-xe/bang-gia-xe-may-suzuki-40.html',
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
  vespa: [VEHICLE_TYPE.MOTORBIKE],
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
  /*
   * Vespa là HÃNG RIÊNG trong danh mục, không gộp vào Piaggio dù cùng tập đoàn: chủ xe tìm ô
   * "Hãng xe" theo chữ trên yếm xe, và "Piaggio / Vespa Sprint" là một cái tên không tồn tại ở
   * đâu ngoài bảng dữ liệu của chúng ta. Vespa cũng là dòng cho thuê đông nhất của Piaggio Group
   * tại Việt Nam, nên chôn nó xuống một tầng là chôn đúng thứ người dùng đang tìm.
   */
  { key: 'vespa', label: 'Vespa', vehicleTypes: [VEHICLE_TYPE.MOTORBIKE], sortOrder: 19 },
];

/**
 * Hãng CÓ trong danh mục nhưng chưa đối chiếu được mẫu xe từ TRANG CHÍNH HÃNG.
 *
 * Sau đợt rà 14/09/2026 thì mọi hãng đều đã có mẫu, nên danh sách này rỗng — nhưng 14 hãng trong
 * `MARKET_SOURCE` mới chỉ đối chiếu qua bảng giá thị trường, và phần việc "mở tay trang chính
 * hãng" vẫn còn nợ ở đó.
 *
 * Giữ lại cấu trúc vì nó là thứ nói cho người rà danh mục sau này biết chỗ nào còn thiếu và VÌ
 * SAO thiếu, thay vì tưởng danh mục đã đủ. Hãng nào mất mẫu trong tương lai thì thêm lại vào đây.
 */
export const UNVERIFIED_BRANDS: readonly { key: string; url: string; reason: string }[] = [];

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
  /** Ngày đối chiếu của riêng mẫu này; bỏ trống = `CATALOG_VERIFIED_AT` (đợt rà đầu tiên). */
  verifiedAt?: Date;
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

// ── Đợt rà 2 (14/09/2026) — 14 hãng trước đó không có mẫu nào ────────────────────────────────

/**
 * Helper của đợt 2: gắn sẵn `verifiedAt` để không phải lặp lại ở từng mẫu.
 *
 * Không gộp với `SOURCE`/`CATALOG_VERIFIED_AT` của đợt 1 vì hai đợt khác nhau ở LOẠI nguồn
 * (trang chính hãng ↔ bảng giá thị trường) và ở ngày đối chiếu — hai thông tin mà người rà lại
 * sau này cần phân biệt được.
 */
function round2(model: Omit<CatalogModelSeed, 'verifiedAt'>): CatalogModelSeed {
  return { ...model, verifiedAt: CATALOG_VERIFIED_AT_ROUND_2 };
}

/** Ô tô ĐIỆN: nguồn năng lượng và truyền động là thuộc tính của cả dòng, không phải của phiên bản. */
const EV_SPECS = { fuelTypes: ['electric'], transmissions: ['direct_drive'] } as const;

const ROUND_2_CAR_MODELS: readonly CatalogModelSeed[] = [
  // ── VinFast ───────────────────────────────────────────────────────────────
  // Toàn bộ dải xe đang bán đều thuần điện — đó là thông tin của chính hãng xe, không phải suy đoán.
  ...[
    'VF 3',
    'VF 5',
    'VF 6',
    'VF 7',
    'VF 8',
    'VF 9',
    'VF MPV 7',
    'Minio Green',
    'Herio Green',
    'Nerio Green',
    'Limo Green',
    'EC Van',
  ].map((label) =>
    round2({
      brandKey: 'vinfast',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      ...EV_SPECS,
      sourceUrl: MARKET_SOURCE.VINFAST_CAR,
    }),
  ),

  // ── Kia (THACO) ───────────────────────────────────────────────────────────
  // Bản "New"/"Hybrid" trên trang hãng là PHIÊN BẢN của cùng một dòng, không phải dòng riêng —
  // tách chúng ra sẽ đẻ "Sorento" và "New Sorento" đứng cạnh nhau trong ô chọn của chủ xe.
  ...[
    'Morning',
    'Soluto',
    'K3',
    'K5',
    'Sonet',
    'Seltos',
    'Carens',
    'Sportage',
    'Sorento',
    'Carnival',
  ].map((label) =>
    round2({
      brandKey: 'kia',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: SOURCE.KIA,
    }),
  ),

  // ── Mazda (THACO) ─────────────────────────────────────────────────────────
  ...['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-8'].map((label) =>
    round2({
      brandKey: 'mazda',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: MARKET_SOURCE.MAZDA,
    }),
  ),

  // ── Ford ──────────────────────────────────────────────────────────────────
  // `Ranger Raptor` đứng riêng chứ không phải phiên bản của Ranger: khác khung gầm, khác hệ treo,
  // và khách thuê tìm đúng cái tên đó.
  ...['Ranger', 'Ranger Raptor', 'Everest', 'Territory', 'Transit'].map((label) =>
    round2({
      brandKey: 'ford',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: MARKET_SOURCE.FORD,
    }),
  ),
  round2({
    brandKey: 'ford',
    vehicleType: VEHICLE_TYPE.CAR,
    label: 'Mustang Mach-E',
    ...EV_SPECS,
    sourceUrl: MARKET_SOURCE.FORD,
  }),

  // ── Suzuki ô tô ───────────────────────────────────────────────────────────
  // Super Carry (tải/van) không đưa vào: nền tảng cho thuê xe du lịch — cùng luật đã áp cho dải
  // xe thương mại của Hyundai ở đợt 1.
  ...['Swift', 'Ciaz', 'Ertiga', 'XL7', 'Jimny', 'Fronx'].map((label) =>
    round2({
      brandKey: 'suzuki',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: SOURCE.SUZUKI_CAR,
    }),
  ),

  // ── Nissan ────────────────────────────────────────────────────────────────
  ...['Almera', 'Navara', 'Terra'].map((label) =>
    round2({
      brandKey: 'nissan',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: MARKET_SOURCE.NISSAN,
    }),
  ),
  round2({
    brandKey: 'nissan',
    vehicleType: VEHICLE_TYPE.CAR,
    label: 'Kicks e-POWER',
    // e-POWER chạy điện hoàn toàn nhưng có máy xăng phát điện — đó là hybrid, không phải xe điện.
    fuelTypes: ['hybrid'],
    sourceUrl: MARKET_SOURCE.NISSAN,
  }),

  // ── Peugeot (THACO) ───────────────────────────────────────────────────────
  ...['2008', '3008', '5008', '408', '508', 'Traveller'].map((label) =>
    round2({
      brandKey: 'peugeot',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: MARKET_SOURCE.PEUGEOT,
    }),
  ),

  // ── Mercedes-Benz ─────────────────────────────────────────────────────────
  // Khai theo DÒNG (C-Class, GLC…) chứ không theo mã máy (C 200, GLC 300): mã máy là phiên bản,
  // và một danh sách 60 mã máy là ô chọn không ai dùng được.
  ...['C-Class', 'E-Class', 'S-Class', 'GLB', 'GLC', 'GLE', 'GLS', 'G-Class', 'V-Class'].map(
    (label) =>
      round2({
        brandKey: 'mercedes',
        vehicleType: VEHICLE_TYPE.CAR,
        label,
        sourceUrl: MARKET_SOURCE.MERCEDES,
      }),
  ),
  ...['EQB', 'EQE', 'EQS', 'EQS SUV'].map((label) =>
    round2({
      brandKey: 'mercedes',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      ...EV_SPECS,
      sourceUrl: MARKET_SOURCE.MERCEDES,
    }),
  ),

  // ── BMW (THACO) ───────────────────────────────────────────────────────────
  ...[
    '3 Series',
    '4 Series',
    '5 Series',
    '7 Series',
    'X1',
    'X3',
    'X4',
    'X5',
    'X6',
    'X7',
    'XM',
    'Z4',
  ].map((label) =>
    round2({
      brandKey: 'bmw',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: MARKET_SOURCE.BMW,
    }),
  ),
  ...['i4', 'i7', 'iX3'].map((label) =>
    round2({
      brandKey: 'bmw',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      ...EV_SPECS,
      sourceUrl: MARKET_SOURCE.BMW,
    }),
  ),

  // ── Volkswagen ────────────────────────────────────────────────────────────
  ...['Virtus', 'T-Cross', 'Tiguan', 'Teramont', 'Teramont X', 'Viloran', 'Touareg', 'Golf'].map(
    (label) =>
      round2({
        brandKey: 'volkswagen',
        vehicleType: VEHICLE_TYPE.CAR,
        label,
        sourceUrl: MARKET_SOURCE.VOLKSWAGEN,
      }),
  ),

  // ── MINI ──────────────────────────────────────────────────────────────────
  ...['Cooper', 'Countryman', 'Clubman', 'Convertible'].map((label) =>
    round2({
      brandKey: 'mini',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      sourceUrl: MARKET_SOURCE.MINI,
    }),
  ),
];

const ROUND_2_MOTORBIKE_MODELS: readonly CatalogModelSeed[] = [
  // ── VinFast xe máy điện ───────────────────────────────────────────────────
  /*
   * CHỈ bốn mẫu mà nguồn nêu đích danh là dải 2026. Dải xe máy điện VinFast còn rộng hơn thế
   * (Klara, Evo Lite, Motio, Vero…), nhưng các trang tổng hợp gọi tên chúng mỗi nơi một kiểu và
   * trang chính hãng trả HTTP 403 — chép một cái tên sai vào danh mục còn tệ hơn là thiếu nó,
   * vì nó sẽ được hàng trăm chủ xe chọn rồi in ra hợp đồng.
   */
  ...['Evo200', 'Feliz S', 'Vento S', 'Theon S'].map((label) =>
    round2({
      brandKey: 'vinfast',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.SCOOTER,
      ...EV_SPECS,
      sourceUrl: MARKET_SOURCE.VINFAST_BIKE,
    }),
  ),

  // ── Piaggio ───────────────────────────────────────────────────────────────
  ...['Liberty', 'Medley', 'Beverly', 'MP3'].map((label) =>
    round2({
      brandKey: 'piaggio',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.SCOOTER,
      fuelTypes: ['gasoline'],
      transmissions: ['automatic_cvt'],
      sourceUrl: MARKET_SOURCE.PIAGGIO,
    }),
  ),

  // ── Vespa ─────────────────────────────────────────────────────────────────
  ...['Primavera', 'Sprint', 'GTS', 'GTV'].map((label) =>
    round2({
      brandKey: 'vespa',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.SCOOTER,
      fuelTypes: ['gasoline'],
      transmissions: ['automatic_cvt'],
      sourceUrl: MARKET_SOURCE.VESPA,
    }),
  ),

  // ── SYM ───────────────────────────────────────────────────────────────────
  // Phân khúc lấy đúng theo cách trang chính hãng xếp nhóm ("Xe tay ga" · "Xe số").
  ...['TPBW 125', 'Naga 150', 'Tuscany 150', 'Angel 110'].map((label) =>
    round2({
      brandKey: 'sym',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.SCOOTER,
      fuelTypes: ['gasoline'],
      transmissions: ['automatic_cvt'],
      sourceUrl: SOURCE.SYM,
    }),
  ),
  ...['Priti 125', 'Priti 50'].map((label) =>
    round2({
      brandKey: 'sym',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.UNDERBONE,
      fuelTypes: ['gasoline'],
      transmissions: ['semi_automatic'],
      sourceUrl: SOURCE.SYM,
    }),
  ),

  // ── Suzuki xe máy ─────────────────────────────────────────────────────────
  ...['Raider R150', 'Satria F150'].map((label) =>
    round2({
      brandKey: 'suzuki',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      label,
      motorbikeCategory: M.SPORT,
      fuelTypes: ['gasoline'],
      transmissions: ['manual_clutch'],
      sourceUrl: MARKET_SOURCE.SUZUKI_BIKE,
    }),
  ),
  round2({
    brandKey: 'suzuki',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    label: 'V-Strom 250SX',
    motorbikeCategory: M.ADVENTURE,
    fuelTypes: ['gasoline'],
    transmissions: ['manual_clutch'],
    sourceUrl: MARKET_SOURCE.SUZUKI_BIKE,
  }),
];

/**
 * Mẫu ĐỜI TRƯỚC của đợt 2 — cùng lý do với `LEGACY_MODELS`: đây là nhóm xe ĐÔNG NHẤT ngoài dịch
 * vụ cho thuê. Một chiếc Fadil hay Cerato đời 2019 vẫn chạy hàng ngày, và bắt chủ nó chọn "Khác"
 * là vứt bỏ chuẩn hoá ở đúng chỗ cần nhất.
 */
const ROUND_2_LEGACY_MODELS: readonly CatalogModelSeed[] = [
  // VinFast: dải xe xăng đã dừng sản xuất từ 2022 khi hãng chuyển hẳn sang thuần điện.
  ...['Fadil', 'Lux A2.0', 'Lux SA2.0', 'President'].map((label) =>
    round2({
      brandKey: 'vinfast',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      marketStatus: CATALOG_MARKET_STATUS.LEGACY,
      fuelTypes: ['gasoline'],
      sourceUrl: MARKET_SOURCE.VINFAST_CAR,
    }),
  ),
  round2({
    brandKey: 'vinfast',
    vehicleType: VEHICLE_TYPE.CAR,
    label: 'VF e34',
    marketStatus: CATALOG_MARKET_STATUS.LEGACY,
    ...EV_SPECS,
    sourceUrl: MARKET_SOURCE.VINFAST_CAR,
  }),

  // Kia: hai dòng đã ĐỔI TÊN chứ không biến mất (Cerato → K3, Sedona → Carnival). Giữ tên cũ vì
  // giấy đăng ký của chiếc xe đang chạy vẫn ghi tên đó.
  ...['Cerato', 'Optima', 'Sedona', 'Rondo'].map((label) =>
    round2({
      brandKey: 'kia',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      marketStatus: CATALOG_MARKET_STATUS.LEGACY,
      sourceUrl: MARKET_SOURCE.KIA_LEGACY,
    }),
  ),

  // Nissan: các dòng đã rời bảng giá chính hãng.
  ...['Sunny', 'Teana', 'X-Trail', 'Juke'].map((label) =>
    round2({
      brandKey: 'nissan',
      vehicleType: VEHICLE_TYPE.CAR,
      label,
      marketStatus: CATALOG_MARKET_STATUS.LEGACY,
      sourceUrl: MARKET_SOURCE.NISSAN,
    }),
  ),

  /*
   * Chevrolet KHÔNG còn phân phối chính hãng tại Việt Nam (GM chuyển mảng này cho VinFast năm
   * 2018), nên toàn bộ dải xe của hãng nằm ở nhóm đời trước — không có mẫu `current` nào. Xe vẫn
   * chạy dịch vụ rất nhiều, đặc biệt Spark và Cruze.
   */
  ...['Spark', 'Aveo', 'Cruze', 'Orlando', 'Captiva', 'Trax', 'Colorado', 'Trailblazer'].map(
    (label) =>
      round2({
        brandKey: 'chevrolet',
        vehicleType: VEHICLE_TYPE.CAR,
        label,
        marketStatus: CATALOG_MARKET_STATUS.LEGACY,
        sourceUrl: MARKET_SOURCE.CHEVROLET,
      }),
  ),
];

/** Toàn bộ mẫu xe của danh mục nền. */
export const CATALOG_MODELS: readonly CatalogModelSeed[] = [
  ...CAR_MODELS,
  ...MOTORBIKE_MODELS,
  ...LEGACY_MODELS,
  ...ROUND_2_CAR_MODELS,
  ...ROUND_2_MOTORBIKE_MODELS,
  ...ROUND_2_LEGACY_MODELS,
];
