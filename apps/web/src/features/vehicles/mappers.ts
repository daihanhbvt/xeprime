import type { VehicleFormValues } from '@xeprime/validators';
import {
  VEHICLE_TYPE,
  VEHICLE_SOURCE_TYPE,
  type BodyType,
  type FuelType,
  type ServiceType,
  type TransmissionType,
  type VehicleOperationStatus,
  type VehicleSourceType,
  type VehicleType,
} from '@xeprime/types';
import type { CreateVehicleInput, UpdateVehicleInput, VehicleDetail } from './types';

/** Text rỗng coi như bỏ trống — không gửi chuỗi rỗng lên API. */
function textOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Giá trị form → payload API (create/update dùng chung; update là Partial nên thừa trường vẫn hợp lệ).
 * Tiền hoá string tại đây (ADR 0007): form giữ number, JSON đi string.
 */
export function formValuesToInput(values: VehicleFormValues): CreateVehicleInput {
  return {
    code: textOrUndefined(values.code),
    name: values.name.trim(),
    vehicleType: values.vehicleType,
    serviceType: values.serviceType,
    sourceType: values.sourceType,
    operationStatus: values.operationStatus,
    plateNumber: textOrUndefined(values.plateNumber),
    brand: textOrUndefined(values.brand),
    model: textOrUndefined(values.model),
    color: textOrUndefined(values.color),
    fuelType: values.fuelType ?? undefined,
    // Các trường nullable mới gửi null tường minh để XOÁ được giá trị khi sửa (backend nhận null).
    bodyType: values.vehicleType === VEHICLE_TYPE.CAR ? (values.bodyType ?? null) : null,
    manufactureYear: values.manufactureYear ?? undefined,
    seatCount: values.seatCount ?? undefined,
    lengthMm: values.lengthMm ?? undefined,
    widthMm: values.widthMm ?? undefined,
    heightMm: values.heightMm ?? undefined,
    curbWeightKg: values.curbWeightKg ?? undefined,
    engineDisplacementCc: values.engineDisplacementCc ?? undefined,
    horsepowerHp: values.horsepowerHp ?? undefined,
    transmission: values.transmission ?? undefined,
    fuelConsumptionCity: values.fuelConsumptionCity ?? undefined,
    fuelConsumptionHighway: values.fuelConsumptionHighway ?? undefined,
    fuelConsumptionCombined: values.fuelConsumptionCombined ?? undefined,
    weekdayPrice: values.weekdayPrice == null ? undefined : String(values.weekdayPrice),
    weekendPrice: values.weekendPrice == null ? undefined : String(values.weekendPrice),
    hourlyPrice: values.hourlyPrice == null ? null : String(values.hourlyPrice),
    deliveryEnabled: values.deliveryEnabled,
    noCollateral: values.noCollateral,
    discountPercent: values.discountPercent ?? null,
    description: textOrUndefined(values.description),
    mainImageUrl: values.mainImageUrl ?? undefined,
    // Gửi mảng để backend replace-set; lọc URL rỗng phòng dữ liệu cũ có dòng trống.
    images: (values.images ?? []).map((u) => u.trim()).filter(Boolean),
    features: values.features ?? [],
  };
}

/**
 * Chi tiết xe (API) → giá trị form khi vào trang sửa.
 * Các trường enum ở đây do backend bảo đảm hợp lệ (contract), nên ép về union là trung thực.
 */
export function vehicleToFormValues(v: VehicleDetail): VehicleFormValues {
  return {
    code: v.code,
    name: v.name,
    vehicleType: v.vehicleType as VehicleType,
    serviceType: v.serviceType as ServiceType,
    sourceType: (v.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType,
    operationStatus: v.operationStatus as VehicleOperationStatus,
    plateNumber: v.plateNumber ?? '',
    brand: v.brand ?? '',
    model: v.model ?? '',
    color: v.color ?? '',
    fuelType: (v.fuelType ?? null) as FuelType | null,
    bodyType: (v.bodyType ?? null) as BodyType | null,
    manufactureYear: v.manufactureYear ?? null,
    seatCount: v.seatCount ?? null,
    lengthMm: v.lengthMm ?? null,
    widthMm: v.widthMm ?? null,
    heightMm: v.heightMm ?? null,
    curbWeightKg: v.curbWeightKg ?? null,
    engineDisplacementCc: v.engineDisplacementCc ?? null,
    horsepowerHp: v.horsepowerHp ?? null,
    transmission: (v.transmission ?? null) as TransmissionType | null,
    fuelConsumptionCity: v.fuelConsumptionCity == null ? null : Number(v.fuelConsumptionCity),
    fuelConsumptionHighway:
      v.fuelConsumptionHighway == null ? null : Number(v.fuelConsumptionHighway),
    fuelConsumptionCombined:
      v.fuelConsumptionCombined == null ? null : Number(v.fuelConsumptionCombined),
    weekdayPrice: v.weekdayPrice == null ? null : Number(v.weekdayPrice),
    weekendPrice: v.weekendPrice == null ? null : Number(v.weekendPrice),
    hourlyPrice: v.hourlyPrice == null ? null : Number(v.hourlyPrice),
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    discountPercent: v.discountPercent ?? null,
    description: v.description ?? '',
    mainImageUrl: v.mainImageUrl ?? null,
    images: v.images ?? [],
    // Key tiện ích do backend bảo đảm hợp lệ (contract) → ép về union của form là trung thực.
    features: (v.features ?? []) as VehicleFormValues['features'],
  };
}

/** Payload riêng của tab Thông tin — không mang media/giá để tránh ghi đè dữ liệu tab khác. */
export function informationValuesToInput(values: VehicleFormValues): UpdateVehicleInput {
  return {
    name: values.name.trim(),
    vehicleType: values.vehicleType,
    serviceType: values.serviceType,
    operationStatus: values.operationStatus,
    plateNumber: textOrNull(values.plateNumber),
    brand: textOrNull(values.brand),
    model: textOrNull(values.model),
    color: textOrNull(values.color),
    fuelType: values.fuelType,
    bodyType: values.vehicleType === VEHICLE_TYPE.CAR ? (values.bodyType ?? null) : null,
    manufactureYear: values.manufactureYear,
    seatCount: values.seatCount,
    lengthMm: values.lengthMm,
    widthMm: values.widthMm,
    heightMm: values.heightMm,
    curbWeightKg: values.curbWeightKg,
    engineDisplacementCc: values.engineDisplacementCc,
    horsepowerHp: values.horsepowerHp,
    transmission: values.transmission,
    fuelConsumptionCity: values.fuelConsumptionCity,
    fuelConsumptionHighway: values.fuelConsumptionHighway,
    fuelConsumptionCombined: values.fuelConsumptionCombined,
  };
}

/** Payload riêng của tab Hình ảnh — replace-set có chủ đích cho gallery/features. */
export function mediaValuesToInput(values: VehicleFormValues): UpdateVehicleInput {
  return {
    mainImageUrl: values.mainImageUrl,
    images: (values.images ?? []).map((url) => url.trim()).filter(Boolean),
    features: values.features ?? [],
    // Chuỗi rỗng là thao tác xoá mô tả có chủ đích; không đổi thành undefined.
    description: textOrNull(values.description),
  };
}
