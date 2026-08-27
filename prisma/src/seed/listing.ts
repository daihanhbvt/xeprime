/**
 * Bản sao của `ListingsService.syncFromVehicle` dành cho seed (ADR 0008).
 *
 * Vì sao chép lại thay vì gọi service: seed là script Node chạy độc lập, không dựng NestJS
 * container. Nhưng nó phải cho ra ĐÚNG cùng một snapshot — kể cả luật "miễn thế chấp" suy từ
 * chính sách hiệu lực (không phải cờ nhập tay trên xe) và luật vị trí lấy từ CHI NHÁNH.
 *
 * Nếu `ListingsService` đổi luật, file này phải đổi theo. Trong app, writer duy nhất của
 * `public_listings` vẫn là `ListingsService` — seed không mở thêm một đường ghi thứ hai cho
 * runtime, nó chỉ dựng sẵn dữ liệu trước khi app chạy.
 */
import {
  COLLATERAL_MODE,
  LISTING_STATUS,
  REVIEW_STATUS,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';
import { prisma, seedId } from './context';

/** "Miễn thế chấp" = chính sách hiệu lực của xe ở chế độ `none`. Precedence: xe → loại xe → chung. */
async function resolveNoCollateral(
  tenantId: string,
  vehicleId: string,
  vehicleType: string,
): Promise<boolean> {
  const rows = await prisma.rentalPolicy.findMany({
    where: { tenantId, OR: [{ vehicleId }, { vehicleId: null }] },
    select: { vehicleId: true, vehicleType: true, collateralMode: true },
  });
  const row =
    rows.find((r) => r.vehicleId === vehicleId) ??
    rows.find((r) => r.vehicleId === null && r.vehicleType === vehicleType) ??
    rows.find((r) => r.vehicleId === null && r.vehicleType === null);

  // Chưa cấu hình chính sách nào ⇒ false: không hứa miễn cọc khi chưa ai quyết định điều đó.
  return row?.collateralMode === COLLATERAL_MODE.NONE;
}

/** Đồng bộ snapshot marketplace của MỘT xe. Trả về true khi snapshot ở trạng thái `active`. */
export async function syncListing(vehicleId: string): Promise<boolean> {
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      vehicleType: true,
      serviceTypes: true,
      brand: true,
      model: true,
      seatCount: true,
      fuelType: true,
      bodyType: true,
      mainImageUrl: true,
      weekdayPrice: true,
      weekendPrice: true,
      hourlyPrice: true,
      monthlyPrice: true,
      withDriverDailyPrice: true,
      withDriverInterCityPrice: true,
      withDriverOneWayPrice: true,
      deliveryEnabled: true,
      discountPercent: true,
      publicStatus: true,
      deletedAt: true,
      branchId: true,
      branch: { select: { provinceCode: true, province: { select: { name: true } } } },
      tenant: { select: { slug: true } },
      features: { select: { featureKey: true } },
    },
  });
  if (!v) return false;

  const active = !v.deletedAt && v.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  if (!active) {
    const status = v.deletedAt ? LISTING_STATUS.ARCHIVED : LISTING_STATUS.HIDDEN;
    await prisma.publicListing.updateMany({ where: { vehicleId }, data: { status } });
    return false;
  }

  const agg = await prisma.review.aggregate({
    where: { vehicleId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const snapshot = {
    shopSlug: v.tenant.slug,
    title: v.name,
    status: LISTING_STATUS.ACTIVE,
    vehicleType: v.vehicleType,
    serviceTypes: v.serviceTypes,
    brand: v.brand,
    model: v.model,
    seatCount: v.seatCount,
    fuelType: v.fuelType,
    bodyType: v.bodyType,
    branchId: v.branchId,
    provinceCode: v.branch?.provinceCode ?? null,
    provinceName: v.branch?.province?.name ?? null,
    mainImageUrl: v.mainImageUrl,
    weekdayPrice: v.weekdayPrice,
    weekendPrice: v.weekendPrice,
    hourlyPrice: v.hourlyPrice,
    monthlyPrice: v.monthlyPrice,
    withDriverDailyPrice: v.withDriverDailyPrice,
    withDriverInterCityPrice: v.withDriverInterCityPrice,
    withDriverOneWayPrice: v.withDriverOneWayPrice,
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: await resolveNoCollateral(v.tenantId, v.id, v.vehicleType),
    discountPercent: v.discountPercent,
    features: v.features.map((f) => f.featureKey).sort(),
    ratingAvg: agg._avg.rating != null ? agg._avg.rating.toFixed(2) : null,
    ratingCount: agg._count._all,
  };

  await prisma.publicListing.upsert({
    where: { vehicleId },
    create: { id: seedId(`listing:${vehicleId}`), tenantId: v.tenantId, vehicleId, ...snapshot },
    update: snapshot,
  });
  return true;
}
