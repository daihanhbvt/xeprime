/**
 * Đồng bộ DANH MỤC XE — hãng, tiện nghi, mẫu xe. Chạy ở cả `SEED_MODE=system`.
 *
 * Vì sao ở seed chứ không ở migration như bốn chiều danh mục gốc: danh sách mẫu xe SỐNG. Hãng ra
 * mẫu mới mỗi năm, và bản thân danh mục có màn quản trị để admin sửa. Một migration chỉ chạy đúng
 * một lần, nên nó không phải chỗ để giữ một danh sách còn lớn lên; seed idempotent thì chạy lại
 * được sau mỗi lần bổ sung.
 *
 * Idempotent theo đúng nghĩa: id tất định từ `seedId`, không xoá-tạo-lại, và KHÔNG
 * ghi đè những gì admin đã sửa bằng tay — nhãn/thứ tự của hãng giữ nguyên (chỉ chiều áp dụng
 * `vehicleTypes` do file này làm chủ), mẫu xe chỉ được điền vào ô còn trống (`syncModels`).
 */
import {
  CATALOG_MARKET_STATUS,
  CATALOG_SEAT_COUNT_MAX,
  CATALOG_SEAT_COUNT_MIN,
  VEHICLE_FEATURE_LABEL,
  VEHICLE_FEATURE_VEHICLE_TYPES,
  VEHICLE_TYPE,
  catalogModelKey,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesForFuels,
} from '@xeprime/types';

import { log, prisma, seedId } from './context';
import {
  ADDITIONAL_BRANDS,
  BRAND_VEHICLE_TYPES,
  CATALOG_MODELS,
  CATALOG_VERIFIED_AT,
  UNMATCHED_CAR_SPEC_KEYS,
  UNVERIFIED_BRANDS,
  type CatalogModelSeed,
} from './vehicle-catalog';

/**
 * Chiều áp dụng của HÃNG: xe máy không hiện Toyota, ô tô không hiện Yamaha.
 *
 * Hãng nào không có trong bảng thì để nguyên (mảng rỗng = mọi loại) — im lặng gán bừa cho một
 * hãng lạ là cách nhanh nhất để nó biến mất khỏi form mà không ai hiểu vì sao.
 */
async function syncBrands(): Promise<number> {
  let touched = 0;

  for (const brand of ADDITIONAL_BRANDS) {
    await prisma.catalogItem.upsert({
      where: { type_key: { type: 'vehicle_brand', key: brand.key } },
      update: { vehicleTypes: [...brand.vehicleTypes] },
      create: {
        id: seedId(`catalog:vehicle_brand:${brand.key}`),
        type: 'vehicle_brand',
        key: brand.key,
        label: brand.label,
        sortOrder: brand.sortOrder,
        vehicleTypes: [...brand.vehicleTypes],
      },
    });
    touched += 1;
  }

  for (const [key, vehicleTypes] of Object.entries(BRAND_VEHICLE_TYPES)) {
    const result = await prisma.catalogItem.updateMany({
      where: { type: 'vehicle_brand', key },
      data: { vehicleTypes: [...vehicleTypes] },
    });
    touched += result.count;
  }

  return touched;
}

/**
 * Tiện nghi: bổ sung bộ của xe máy và gắn chiều áp dụng cho toàn bộ.
 *
 * Nguồn của cả nhãn lẫn chiều áp dụng là `@xeprime/types` — backend đã dùng chính hai hằng đó để
 * TỪ CHỐI một tiện nghi sai loại xe, nên danh mục hiển thị phải sinh từ cùng chỗ. Gõ tay lần thứ
 * hai ở đây là tạo ra một danh sách trông thì đúng nhưng lệch dần theo thời gian.
 */
async function syncFeatures(): Promise<number> {
  const keys = Object.keys(VEHICLE_FEATURE_LABEL);
  let order = 0;

  for (const key of keys) {
    const label = (VEHICLE_FEATURE_LABEL as Record<string, string>)[key]!;
    const vehicleTypes = [...(VEHICLE_FEATURE_VEHICLE_TYPES[key] ?? [])];

    await prisma.catalogItem.upsert({
      where: { type_key: { type: 'vehicle_feature', key } },
      // Nhãn KHÔNG ghi đè: admin có thể đã đổi cách gọi cho hợp giọng sản phẩm. Chiều áp dụng thì
      // ghi đè, vì nó là luật nghiệp vụ chứ không phải lựa chọn trình bày.
      update: { vehicleTypes },
      create: {
        id: seedId(`catalog:vehicle_feature:${key}`),
        type: 'vehicle_feature',
        key,
        label,
        sortOrder: order,
        vehicleTypes,
      },
    });
    order += 1;
  }

  return keys.length;
}

/**
 * Mẫu xe — HỘI TỤ danh mục mà không giành quyền của admin.
 *
 * Danh mục có màn quản trị, nên sau lần nạp đầu tiên DB mới là nguồn sự thật, không phải file
 * này. Bốn luật:
 *
 *  1. Mẫu chưa có (theo `key`) ⇒ tạo đầy đủ.
 *  2. Mẫu admin đã XOÁ (`deleted_at`) ⇒ bỏ qua. Xoá cứng từng làm lần chạy sau tạo lại đúng mẫu
 *     vừa bị gỡ — dòng xoá mềm còn giữ `key` chính là để seed nhận ra điều đó.
 *  3. Mẫu admin đã THÊM/SỬA (`admin_edited_at`) ⇒ bỏ qua. Ô trống ở đó có thể là admin cố ý xoá
 *     một giá trị sai — điền lại là cãi admin.
 *  4. Mẫu còn lại ⇒ CHỈ điền vào ô còn TRỐNG (số chỗ, nguồn năng lượng, hộp số, phân khúc, nguồn).
 *     Nhãn, nhóm thị trường, bật/tắt, thứ tự giữ nguyên — bản cũ `upsert` ghi đè tất cả.
 *
 * Mọi dòng trước khi ghi đều qua `seedSpecProblem` — CHÍNH luật mà API áp cho admin: file nguồn
 * sai thì seed dừng; còn dòng GHÉP (nửa có sẵn trong DB, nửa từ file) không hợp lệ thì chỉ bỏ
 * phần năng lượng/hộp số của lượt điền đó và in ra, không ghi một tổ hợp form sẽ từ chối.
 */
async function syncModels(): Promise<{
  created: number;
  filled: number;
  skippedDeleted: number;
  skippedEdited: number;
}> {
  const existing = await prisma.vehicleCatalogModel.findMany({
    select: {
      id: true,
      key: true,
      vehicleType: true,
      deletedAt: true,
      adminEditedAt: true,
      seatCounts: true,
      fuelTypes: true,
      transmissions: true,
      motorbikeCategory: true,
      sourceUrl: true,
    },
  });
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const result = { created: 0, filled: 0, skippedDeleted: 0, skippedEdited: 0 };

  for (const m of CATALOG_MODELS) {
    const problem = seedSpecProblem(m);
    if (problem) throw new Error(`[catalog] ${m.brandKey}/${m.label}: ${problem}`);

    const key = catalogModelKey(m.brandKey, m.label);
    const seatCounts = [...(m.seatCounts ?? [])];
    const fuelTypes = [...(m.fuelTypes ?? [])];
    const transmissions = [...(m.transmissions ?? [])];
    // Ngày đối chiếu của CHÍNH mẫu này. Một hằng cho cả file sẽ đóng dấu "vừa kiểm tra" lên
    // những hãng không ai mở lại trang, và mốc đó là thứ duy nhất nói được dữ liệu cũ tới đâu.
    const verifiedAt = m.verifiedAt ?? CATALOG_VERIFIED_AT;
    const row = byKey.get(key);

    if (!row) {
      await prisma.vehicleCatalogModel.create({
        data: {
          id: seedId(`catalog-model:${key}`),
          key,
          label: m.label,
          brandKey: m.brandKey,
          vehicleType: m.vehicleType,
          marketStatus: m.marketStatus ?? CATALOG_MARKET_STATUS.CURRENT,
          motorbikeCategory: m.motorbikeCategory ?? null,
          seatCounts,
          fuelTypes,
          transmissions,
          sourceUrl: m.sourceUrl,
          verifiedAt,
        },
      });
      result.created += 1;
      continue;
    }
    if (row.deletedAt) {
      result.skippedDeleted += 1;
      continue;
    }
    if (row.adminEditedAt) {
      result.skippedEdited += 1;
      continue;
    }

    const energy = {
      ...(row.fuelTypes.length === 0 && fuelTypes.length > 0 ? { fuelTypes } : {}),
      ...(row.transmissions.length === 0 && transmissions.length > 0 ? { transmissions } : {}),
    };
    const merged = {
      ...m,
      vehicleType: row.vehicleType,
      fuelTypes: energy.fuelTypes ?? row.fuelTypes,
      transmissions: energy.transmissions ?? row.transmissions,
    };
    const mergedProblem = seedSpecProblem(merged);
    if (mergedProblem) {
      log(`  bỏ điền năng lượng/hộp số của ${m.brandKey}/${m.label}: ${mergedProblem}`);
    }

    const patch = {
      ...(row.seatCounts.length === 0 && seatCounts.length > 0 ? { seatCounts } : {}),
      ...(mergedProblem ? {} : energy),
      ...(row.motorbikeCategory == null && m.motorbikeCategory
        ? { motorbikeCategory: m.motorbikeCategory }
        : {}),
      ...(row.sourceUrl == null ? { sourceUrl: m.sourceUrl, verifiedAt } : {}),
    };
    if (Object.keys(patch).length === 0) continue;

    await prisma.vehicleCatalogModel.update({ where: { id: row.id }, data: patch });
    result.filled += 1;
  }

  return result;
}

/**
 * Cùng luật API áp cho admin (`CatalogModelService.validateSpec`) — trả lý do hỏng, `null` nếu ổn.
 * Nhận cả dòng GHÉP (DB + file), nên không ném: nơi gọi tự quyết dừng hay bỏ qua.
 */
function seedSpecProblem(
  m: Pick<CatalogModelSeed, 'vehicleType' | 'seatCounts' | 'fuelTypes' | 'transmissions'>,
): string | null {
  const isMotorbike = m.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const seats = m.seatCounts ?? [];
  if (isMotorbike && seats.length > 0) return 'xe máy không có số chỗ';
  if (seats.some((s) => s < CATALOG_SEAT_COUNT_MIN || s > CATALOG_SEAT_COUNT_MAX)) {
    return 'số chỗ ngoài biên';
  }
  const fuels = m.fuelTypes ?? [];
  const allowedFuels = vehicleFuelTypesFor(m.vehicleType) as readonly string[];
  const badFuel = fuels.find((f) => !allowedFuels.includes(f));
  if (badFuel) return `nguồn năng lượng "${badFuel}" sai loại xe`;
  const allowed = vehicleTransmissionTypesForFuels(m.vehicleType, fuels) as readonly string[];
  const bad = (m.transmissions ?? []).find((t) => !allowed.includes(t));
  if (bad) return `hộp số "${bad}" không khớp nguồn năng lượng`;
  return null;
}

export async function seedVehicleCatalog(): Promise<void> {
  const brands = await syncBrands();
  const features = await syncFeatures();
  const models = await syncModels();

  log(
    `Danh mục xe: ${brands} hãng · ${features} tiện nghi · ${CATALOG_MODELS.length} mẫu xe ` +
      `(tạo mới ${models.created} · điền thông số ${models.filled} · bỏ qua đã xoá ${models.skippedDeleted} · bỏ qua admin đã sửa ${models.skippedEdited})`,
  );
  if (UNMATCHED_CAR_SPEC_KEYS.length > 0) {
    log(`  thông số ô tô không khớp mẫu nào: ${UNMATCHED_CAR_SPEC_KEYS.join(', ')}`);
  }
  // In ra chỗ CÒN THIẾU thay vì để nó chìm trong file nguồn: người chạy seed là người có khả năng
  // bổ sung, và một danh mục thiếu mà im lặng thì trông y hệt một danh mục đủ.
  if (UNVERIFIED_BRANDS.length > 0) {
    log(
      `  chưa đối chiếu được mẫu xe: ${UNVERIFIED_BRANDS.map((b) => `${b.key} (${b.reason})`).join(', ')}`,
    );
  }
}
