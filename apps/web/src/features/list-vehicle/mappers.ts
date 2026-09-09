import { COLLATERAL_MODE, VEHICLE_TYPE } from '@xeprime/types';

import type { CreateVehicleInput } from '@/features/vehicles/types';
import type { RentalPolicyValues, SaveRentalPolicyInput } from '@/features/rental-policies/types';

import { QUICK_VEHICLE_FIXED, type QuickVehicleValues } from './schema';

const textOrUndefined = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};
const money = (value: number | null | undefined): string | undefined =>
  value != null ? String(Math.round(value)) : undefined;

/**
 * Giá trị form → payload `POST /vehicles`.
 *
 * Ba trường KHÔNG hỏi trong luồng nhanh nhưng vẫn phải đúng: dịch vụ (chỉ tự lái), trạng thái vận
 * hành (sẵn sàng) và nguồn xe (thuộc sở hữu) — đều đổi được sau ở `/manage`. Mã xe không gửi:
 * backend tự sinh, và bắt chủ xe cá nhân nghĩ ra một mã nội bộ là hỏi một thứ họ không có.
 *
 * Biển số chuẩn hoá về CHỮ HOA đã trim ngay tại đây, để cùng một chiếc xe nhập ở hai màn không
 * ra hai chuỗi khác nhau.
 */
export function quickVehicleToCreateInput(values: QuickVehicleValues): CreateVehicleInput {
  return {
    name: values.name.trim(),
    branchId: values.branchId,
    vehicleType: values.vehicleType,
    serviceTypes: [...QUICK_VEHICLE_FIXED.serviceTypes],
    operationStatus: QUICK_VEHICLE_FIXED.operationStatus,
    sourceType: QUICK_VEHICLE_FIXED.sourceType,
    plateNumber: values.plateNumber.trim().toUpperCase(),
    brand: textOrUndefined(values.brand),
    model: textOrUndefined(values.model),
    color: textOrUndefined(values.color),
    fuelType: values.fuelType ?? undefined,
    manufactureYear: values.manufactureYear ?? undefined,
    // Số chỗ chỉ có nghĩa với ô tô, phân khúc chỉ có nghĩa với xe máy — gửi đúng vế của loại
    // xe đang khai, thay vì để server phải dọn hộ.
    seatCount: values.vehicleType === VEHICLE_TYPE.CAR ? (values.seatCount ?? undefined) : undefined,
    motorbikeCategory:
      values.vehicleType === VEHICLE_TYPE.MOTORBIKE ? (values.motorbikeCategory ?? null) : null,
    vehicleCatalogModelId: values.vehicleCatalogModelId ?? null,
    transmission: values.transmission ?? undefined,
    fuelConsumptionCombined: values.fuelConsumptionCombined ?? undefined,
    electricRangeKm: values.electricRangeKm ?? undefined,
    batteryCapacityKwh: values.batteryCapacityKwh ?? undefined,
    electricConsumptionKwhPer100Km: values.electricConsumptionKwhPer100Km ?? undefined,
    engineDisplacementCc: values.engineDisplacementCc ?? undefined,
    description: textOrUndefined(values.description),
    features: values.features ?? [],
    mainImageUrl: values.mainImageUrl ?? undefined,
    images: values.images ?? [],
    weekdayPrice: money(values.weekdayPrice),
    discountPercent: values.discountEnabled ? (values.discountPercent ?? undefined) : undefined,
  } as CreateVehicleInput;
}

/**
 * Giá trị form → bộ CHÍNH SÁCH đầy đủ để ghi đè theo xe.
 *
 * `base` là chính sách HIỆU LỰC trước lần lưu này (ghi đè của xe, nếu chưa có thì mặc định gian
 * hàng). Mọi khối wizard nhanh KHÔNG hỏi — bảo đảm/cọc, phí quá giờ, ưu đãi dài hạn — được chép
 * nguyên từ đó: `PUT /vehicles/:id/pricing` nhận trọn bộ chính sách, nên gửi thiếu một khối là
 * xoá cấu hình mà chủ xe chưa bao giờ yêu cầu xoá.
 *
 * Giao xe tận nơi dựng theo ĐÚNG ngữ nghĩa của máy giá đang chạy: các BẬC phí cố định theo
 * khoảng cách (`deliveryFeeFor` tra bậc), không phải đơn giá theo km. Vùng miễn phí là một bậc
 * phí 0 đứng trước.
 */
export function quickVehicleToPolicyInput(
  values: QuickVehicleValues,
  base: RentalPolicyValues | null,
): SaveRentalPolicyInput {
  const freeKm = values.deliveryFreeWithinKm;
  const radius = values.deliveryMaxRadiusKm;
  const fee = values.deliveryFee;

  const deliveryTiers =
    values.deliveryEnabled && radius != null && fee != null
      ? [
          ...(freeKm != null && freeKm > 0 && freeKm < radius
            ? [{ toKm: freeKm, fee: '0' }]
            : []),
          { toKm: radius, fee: String(Math.round(fee)) },
        ]
      : [];

  return {
    // Khối bảo đảm: giữ NGUYÊN thứ đang hiệu lực. Wizard nhanh không hỏi cọc, nên nó cũng không
    // được quyền đặt lại cọc về 0 cho một gian hàng đang nhận thế chấp.
    collateralMode: base?.collateralMode ?? COLLATERAL_MODE.NONE,
    collateralAssetTypes: base?.collateralAssetTypes ?? [],
    depositAmount: base?.depositAmount ?? '0',

    deliveryEnabled: values.deliveryEnabled,
    deliveryMaxRadiusKm: values.deliveryEnabled ? radius : null,
    deliveryTiers,

    overtimeFeePerHour: base?.overtimeFeePerHour ?? null,
    overtimeGraceMinutes: base?.overtimeGraceMinutes ?? null,
    overtimeRoundingMinutes: base?.overtimeRoundingMinutes ?? null,

    discountEnabled: base?.discountEnabled ?? false,
    discountTiers: base?.discountTiers ?? [],

    includedDistanceKmPerDay: values.mileageLimitEnabled
      ? (values.includedDistanceKmPerDay ?? null)
      : null,
    excessDistanceFeePerKm:
      values.mileageLimitEnabled && values.excessDistanceFeePerKm != null
        ? String(Math.round(values.excessDistanceFeePerKm))
        : null,
  } as SaveRentalPolicyInput;
}

/** Gợi ý tên hiển thị từ hãng + mẫu + năm — người dùng vẫn sửa được, không có tên ẩn nào. */
export function suggestVehicleName(values: {
  brandLabel?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
}): string {
  return [values.brandLabel, values.model, values.manufactureYear]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' ');
}
