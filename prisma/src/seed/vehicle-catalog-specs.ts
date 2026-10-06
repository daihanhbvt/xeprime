/**
 * THÔNG SỐ ĐIỀN SẴN của mẫu ô tô — số chỗ, nguồn năng lượng, hộp số (bổ sung 06/10/2026).
 *
 * Trước đợt này seed để trống cả ba cột cho gần như mọi mẫu ô tô, nên form đăng xe không có gì để
 * điền sẵn và chủ chiếc VF 5 vẫn phải tự khai "5 chỗ · Điện". Luật đọc một thông số
 * (`catalogSpecRule` ở @xeprime/types):
 *
 *     một giá trị  ⇒ form điền sẵn và KHOÁ ô
 *     nhiều giá trị ⇒ chủ xe chọn TRONG các giá trị đó
 *     bỏ trống     ⇒ chưa xác minh, chủ xe khai tự do
 *
 * Vì vậy mỗi mảng ở đây là HỢP của mọi đời xe mang tên đó từng bán chính hãng tại Việt Nam — một
 * mẫu trong danh mục đại diện cho cả tên thương mại, không riêng đời mới nhất. Chủ chiếc Accent
 * 2019 số tự động 4 cấp phải chọn được "Số tự động", dù bản 2024 chỉ còn số sàn và CVT. Thiếu một
 * giá trị ở đây là KHOÁ nhầm một chủ xe thật; vì thế:
 *
 *     chỉ ghi khi chắc chắn — không chắc thì BỎ TRỐNG trường đó, đừng đoán.
 *
 * Nguồn: thông số công bố của các phiên bản đã bán tại Việt Nam, tổng hợp theo cùng trang nguồn
 * mà mỗi mẫu đã khai ở `vehicle-catalog.ts`. Đợt này KHÔNG đổi `verifiedAt` của mẫu: đó là ngày
 * đối chiếu DANH SÁCH mẫu, và thông số chưa được mở lại từng trang để đối chiếu. Admin sửa được
 * mọi giá trị ở màn quản trị; seed chỉ điền vào ô còn trống (`catalog-sync.ts`), nên sửa tay không
 * bị lần chạy sau ghi đè.
 *
 * Xe máy không cần bảng này: phân khúc, nguồn năng lượng và hộp số đã khai ngay ở từng nhóm mẫu.
 */
import { FUEL_TYPE, TRANSMISSION_TYPE_EXT } from '@xeprime/types';

const G = FUEL_TYPE.GASOLINE;
const D = FUEL_TYPE.DIESEL;
const H = FUEL_TYPE.HYBRID;
const P = FUEL_TYPE.PLUG_IN_HYBRID;

const MT = TRANSMISSION_TYPE_EXT.MANUAL;
const AT = TRANSMISSION_TYPE_EXT.AUTOMATIC;
const CVT = TRANSMISSION_TYPE_EXT.CVT;
const ECVT = TRANSMISSION_TYPE_EXT.E_CVT;
const DCT = TRANSMISSION_TYPE_EXT.DCT;

export interface CatalogModelSpecSeed {
  seatCounts?: readonly number[];
  fuelTypes?: readonly string[];
  transmissions?: readonly string[];
}

/** Khoá tra: `<brandKey>/<label>` — đúng nhãn đã khai ở `vehicle-catalog.ts`. */
export function catalogSpecKey(brandKey: string, label: string): string {
  return `${brandKey}/${label}`;
}

function spec(
  seatCounts: readonly number[] | null,
  fuelTypes: readonly string[] | null,
  transmissions: readonly string[] | null,
): CatalogModelSpecSeed {
  return {
    ...(seatCounts ? { seatCounts } : {}),
    ...(fuelTypes ? { fuelTypes } : {}),
    ...(transmissions ? { transmissions } : {}),
  };
}

/**
 * Bảng thông số theo `<hãng>/<mẫu>`. `null` = không chắc ⇒ để trống (chủ xe khai tự do).
 *
 * Xe điện đã mang sẵn nguồn năng lượng và hộp số ở `vehicle-catalog.ts` (`EV_SPECS`), nên ở đây
 * chỉ bổ sung số chỗ cho chúng.
 */
const CAR_SPECS: Readonly<Record<string, CatalogModelSpecSeed>> = {
  // ── Toyota ────────────────────────────────────────────────────────────────
  'toyota/Vios': spec([5], [G], [MT, AT, CVT]),
  'toyota/Wigo': spec([5], [G], [MT, AT, CVT]),
  'toyota/Camry': spec([5], [G, H], [AT, CVT, ECVT]),
  'toyota/Corolla Cross': spec([5], [G, H], [CVT, ECVT]),
  'toyota/Yaris Cross': spec([5], [G, H], [CVT, ECVT]),
  'toyota/Raize': spec([5], [G], [CVT]),
  'toyota/Veloz Cross': spec([7], [G], [CVT]),
  'toyota/Avanza Premio': spec([7], [G], [MT, CVT]),
  'toyota/Innova Cross': spec([7, 8], [G, H], [CVT, ECVT]),
  'toyota/Fortuner': spec([7], [G, D], [MT, AT]),
  'toyota/Hilux': spec([5], [D], [MT, AT]),
  'toyota/Alphard': spec([7], [G, H], [AT, ECVT]),
  'toyota/Land Cruiser': spec(null, [G], [AT]),
  'toyota/Land Cruiser Prado': spec([7], [G], [AT]),
  // đời trước
  'toyota/Innova': spec([7, 8], [G], [MT, AT]),
  'toyota/Avanza': spec([7], [G], [MT, AT]),
  'toyota/Rush': spec([7], [G], [AT]),
  'toyota/Corolla Altis': spec([5], [G, H], [MT, AT, CVT, ECVT]),
  'toyota/Yaris': spec([5], [G], [AT, CVT]),

  // ── Honda ─────────────────────────────────────────────────────────────────
  'honda/City': spec([5], [G], [MT, AT, CVT]),
  'honda/Civic': spec([5], [G, H], [MT, AT, CVT, ECVT]),
  'honda/BR-V': spec([7], [G], [CVT]),
  'honda/HR-V': spec([5], [G, H], [CVT, ECVT]),
  'honda/CR-V': spec([5, 7], [G, H], [AT, CVT, ECVT]),

  // ── Hyundai ───────────────────────────────────────────────────────────────
  'hyundai/Grand i10': spec([5], [G], [MT, AT]),
  'hyundai/Accent': spec([5], [G], [MT, AT, CVT]),
  'hyundai/Elantra': spec([5], [G], [MT, AT, CVT, DCT]),
  'hyundai/Venue': spec([5], [G], null),
  'hyundai/Creta': spec([5], [G], [AT, CVT]),
  'hyundai/Tucson': spec([5], [G, D], [AT, DCT]),
  'hyundai/Santa Fe': spec([7], [G, D, H], [AT, DCT]),
  'hyundai/Palisade': spec(null, [G, D], [AT]),
  'hyundai/Stargazer': spec([7], [G], [CVT]),
  'hyundai/Custin': spec([7], [G], [AT]),
  'hyundai/IONIQ 5': spec([5], null, null),

  // ── Mitsubishi ────────────────────────────────────────────────────────────
  'mitsubishi/Attrage': spec([5], [G], [MT, CVT]),
  'mitsubishi/Xpander': spec([7], [G], [MT, AT, CVT]),
  'mitsubishi/Xpander Cross': spec([7], [G], [AT, CVT]),
  'mitsubishi/Xforce': spec([5], [G], [CVT]),
  'mitsubishi/Destinator': spec([7], [G], [CVT]),
  'mitsubishi/Triton': spec([5], [D], [MT, AT]),
  'mitsubishi/Pajero Sport': spec([7], [G, D], [MT, AT]),

  // ── VinFast ───────────────────────────────────────────────────────────────
  'vinfast/VF 3': spec([4], null, null),
  'vinfast/VF 5': spec([5], null, null),
  'vinfast/VF 6': spec([5], null, null),
  'vinfast/VF 7': spec([5], null, null),
  'vinfast/VF 8': spec([5], null, null),
  'vinfast/VF 9': spec([6, 7], null, null),
  'vinfast/VF MPV 7': spec([7], null, null),
  'vinfast/Minio Green': spec([4], null, null),
  'vinfast/Herio Green': spec([5], null, null),
  'vinfast/Nerio Green': spec([5], null, null),
  'vinfast/Limo Green': spec([7], null, null),
  'vinfast/EC Van': spec([2], null, null),
  'vinfast/VF e34': spec([5], null, null),
  'vinfast/Fadil': spec([5], null, [CVT]),
  'vinfast/Lux A2.0': spec([5], null, [AT]),
  'vinfast/Lux SA2.0': spec([7], null, [AT]),
  'vinfast/President': spec([7], null, [AT]),

  // ── Kia ───────────────────────────────────────────────────────────────────
  'kia/Morning': spec([5], [G], [MT, AT]),
  'kia/Soluto': spec([5], [G], [MT, AT]),
  'kia/K3': spec([5], [G], [MT, AT, DCT]),
  'kia/K5': spec([5], [G], [AT]),
  'kia/Sonet': spec([5], [G], [MT, CVT]),
  'kia/Seltos': spec([5], [G], [CVT, DCT]),
  'kia/Carens': spec(null, [G, D], null),
  'kia/Sportage': spec([5], [G, D], [AT, DCT]),
  'kia/Sorento': spec([7], [G, D, H, P], [AT, DCT]),
  'kia/Carnival': spec([7, 8], [G, D], [AT]),
  // đời trước
  'kia/Cerato': spec([5], [G], [MT, AT]),
  'kia/Optima': spec([5], [G], [AT]),
  'kia/Sedona': spec([7, 8], [G, D], [AT]),
  'kia/Rondo': spec([7], [G, D], [MT, AT]),

  // ── Mazda ─────────────────────────────────────────────────────────────────
  'mazda/Mazda2': spec([5], [G], [AT]),
  'mazda/Mazda3': spec([5], [G], [AT]),
  'mazda/Mazda6': spec([5], [G], [AT]),
  'mazda/CX-3': spec([5], [G], [AT]),
  'mazda/CX-30': spec([5], [G], [AT]),
  'mazda/CX-5': spec([5], [G], [AT]),
  'mazda/CX-8': spec([6, 7], [G], [AT]),

  // ── Ford ──────────────────────────────────────────────────────────────────
  'ford/Ranger': spec([5], [D], [MT, AT]),
  'ford/Ranger Raptor': spec([5], [D], [AT]),
  'ford/Everest': spec([7], [D], [MT, AT]),
  'ford/Territory': spec([5], [G], [DCT]),
  'ford/Transit': spec(null, [D], [MT, AT]),
  'ford/Mustang Mach-E': spec([5], null, null),

  // ── Suzuki ────────────────────────────────────────────────────────────────
  'suzuki/Swift': spec([5], [G], [AT, CVT]),
  'suzuki/Ciaz': spec([5], [G], [MT, AT]),
  'suzuki/Ertiga': spec([7], [G, H], [MT, AT]),
  'suzuki/XL7': spec([7], [G, H], [MT, AT]),
  'suzuki/Jimny': spec([4], [G], [AT]),
  'suzuki/Fronx': spec([5], null, null),

  // ── Nissan ────────────────────────────────────────────────────────────────
  'nissan/Almera': spec([5], [G], [MT, CVT]),
  'nissan/Navara': spec([5], [D], [MT, AT]),
  'nissan/Terra': spec([7], null, null),
  'nissan/Kicks e-POWER': spec([5], null, null),
  // đời trước
  'nissan/Sunny': spec([5], [G], [MT, AT]),
  'nissan/Teana': spec([5], [G], [CVT]),
  'nissan/X-Trail': spec([5, 7], [G], [CVT]),
  'nissan/Juke': spec([5], [G], [CVT]),

  // ── Peugeot ───────────────────────────────────────────────────────────────
  'peugeot/2008': spec([5], [G], [AT]),
  'peugeot/3008': spec([5], [G], [AT]),
  'peugeot/5008': spec([7], [G], [AT]),
  'peugeot/408': spec([5], [G], [AT]),
  'peugeot/508': spec([5], [G], [AT]),
  'peugeot/Traveller': spec([7], [D], [AT]),

  // ── Mercedes-Benz ─────────────────────────────────────────────────────────
  'mercedes/C-Class': spec([5], [G], [AT]),
  'mercedes/E-Class': spec([5], [G], [AT]),
  'mercedes/S-Class': spec(null, [G], [AT]),
  'mercedes/GLB': spec([7], [G], [AT]),
  'mercedes/GLC': spec([5], [G], [AT]),
  'mercedes/GLE': spec([5, 7], [G], [AT]),
  'mercedes/GLS': spec([7], [G], [AT]),
  'mercedes/G-Class': spec([5], [G], [AT]),
  'mercedes/V-Class': spec([7], [G], [AT]),
  'mercedes/EQB': spec([7], null, null),
  'mercedes/EQE': spec([5], null, null),
  'mercedes/EQS': spec([5], null, null),

  // ── BMW ───────────────────────────────────────────────────────────────────
  'bmw/3 Series': spec([5], [G], [AT]),
  'bmw/4 Series': spec([4, 5], [G], [AT]),
  'bmw/5 Series': spec([5], [G], [AT]),
  'bmw/7 Series': spec([5], [G], [AT]),
  'bmw/X1': spec([5], [G], [AT, DCT]),
  'bmw/X3': spec([5], [G], [AT]),
  'bmw/X4': spec([5], [G], [AT]),
  'bmw/X5': spec([5], [G], [AT]),
  'bmw/X6': spec([5], [G], [AT]),
  'bmw/X7': spec([6, 7], [G], [AT]),
  'bmw/XM': spec([5], [P], [AT]),
  'bmw/Z4': spec([2], [G], [AT]),
  'bmw/i4': spec([5], null, null),
  'bmw/i7': spec([5], null, null),
  'bmw/iX3': spec([5], null, null),

  // ── Volkswagen ────────────────────────────────────────────────────────────
  'volkswagen/Virtus': spec([5], [G], [AT]),
  'volkswagen/T-Cross': spec([5], [G], null),
  'volkswagen/Tiguan': spec([5, 7], [G], null),
  'volkswagen/Teramont': spec([7], [G], [AT]),
  'volkswagen/Teramont X': spec([5], [G], [AT]),
  'volkswagen/Viloran': spec([7], [G], [AT]),
  'volkswagen/Touareg': spec([5], [G], [AT]),
  'volkswagen/Golf': spec([5], [G], [DCT]),

  // ── MINI ──────────────────────────────────────────────────────────────────
  'mini/Cooper': spec([4, 5], [G], null),
  'mini/Countryman': spec([5], [G], null),
  'mini/Clubman': spec([5], [G], null),
  'mini/Convertible': spec([4], [G], null),

  // ── Chevrolet (toàn bộ là đời trước) ──────────────────────────────────────
  'chevrolet/Spark': spec([2, 5], [G], [MT, AT]),
  'chevrolet/Aveo': spec([5], [G], [MT, AT]),
  'chevrolet/Cruze': spec([5], [G], [MT, AT]),
  'chevrolet/Orlando': spec([7], [G], [MT, AT]),
  'chevrolet/Captiva': spec([7], [G], [AT]),
  'chevrolet/Trax': spec([5], [G], [AT]),
  'chevrolet/Colorado': spec([5], [D], [MT, AT]),
  'chevrolet/Trailblazer': spec([7], [D], [MT, AT]),
};

export function carSpecFor(brandKey: string, label: string): CatalogModelSpecSeed | undefined {
  return CAR_SPECS[catalogSpecKey(brandKey, label)];
}

/** Khoá trong bảng mà không khớp mẫu nào — seed in ra để một lỗi gõ tên không chìm im lặng. */
export function unmatchedCarSpecKeys(knownKeys: ReadonlySet<string>): string[] {
  return Object.keys(CAR_SPECS).filter((key) => !knownKeys.has(key));
}
