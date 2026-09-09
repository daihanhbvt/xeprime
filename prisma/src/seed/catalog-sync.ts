/**
 * Đồng bộ DANH MỤC XE — hãng, tiện nghi, mẫu xe. Chạy ở cả `SEED_MODE=system`.
 *
 * Vì sao ở seed chứ không ở migration như bốn chiều danh mục gốc: danh sách mẫu xe SỐNG. Hãng ra
 * mẫu mới mỗi năm, và bản thân danh mục có màn quản trị để admin sửa. Một migration chỉ chạy đúng
 * một lần, nên nó không phải chỗ để giữ một danh sách còn lớn lên; seed idempotent thì chạy lại
 * được sau mỗi lần bổ sung.
 *
 * Idempotent theo đúng nghĩa: id tất định từ `seedId`, `upsert` chứ không xoá-tạo-lại, và KHÔNG
 * ghi đè những gì admin đã sửa bằng tay ở phần nhãn/thứ tự của hãng — chỉ chiều áp dụng
 * (`vehicleTypes`) là do file này làm chủ.
 */
import {
  VEHICLE_FEATURE_LABEL,
  VEHICLE_FEATURE_VEHICLE_TYPES,
  catalogModelKey,
} from '@xeprime/types';

import { log, prisma, seedId } from './context';
import {
  ADDITIONAL_BRANDS,
  BRAND_VEHICLE_TYPES,
  CATALOG_MODELS,
  CATALOG_VERIFIED_AT,
  UNVERIFIED_BRANDS,
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
 * Mẫu xe. Khoá `key` sinh từ (hãng, nhãn) nên chạy lại seed không sinh bản trùng, và một mẫu đổi
 * cách viết hoa vẫn là chính nó.
 *
 * `sourceUrl`/`verifiedAt` LUÔN được cập nhật: chúng là bằng chứng "đã đối chiếu ngày nào", nên
 * chúng phải mới lại mỗi lần danh sách được rà.
 */
async function syncModels(): Promise<number> {
  for (const m of CATALOG_MODELS) {
    const key = catalogModelKey(m.brandKey, m.label);
    const data = {
      label: m.label,
      brandKey: m.brandKey,
      vehicleType: m.vehicleType,
      marketStatus: m.marketStatus ?? 'current',
      motorbikeCategory: m.motorbikeCategory ?? null,
      fuelTypes: [...(m.fuelTypes ?? [])],
      transmissions: [...(m.transmissions ?? [])],
      sourceUrl: m.sourceUrl,
      verifiedAt: CATALOG_VERIFIED_AT,
    };

    await prisma.vehicleCatalogModel.upsert({
      where: { key },
      update: data,
      create: { id: seedId(`catalog-model:${key}`), key, ...data },
    });
  }

  return CATALOG_MODELS.length;
}

export async function seedVehicleCatalog(): Promise<void> {
  const brands = await syncBrands();
  const features = await syncFeatures();
  const models = await syncModels();

  log(`Danh mục xe: ${brands} hãng · ${features} tiện nghi · ${models} mẫu xe`);
  // In ra chỗ CÒN THIẾU thay vì để nó chìm trong file nguồn: người chạy seed là người có khả năng
  // bổ sung, và một danh mục thiếu mà im lặng thì trông y hệt một danh mục đủ.
  if (UNVERIFIED_BRANDS.length > 0) {
    log(
      `  chưa đối chiếu được mẫu xe: ${UNVERIFIED_BRANDS.map((b) => `${b.key} (${b.reason})`).join(', ')}`,
    );
  }
}
