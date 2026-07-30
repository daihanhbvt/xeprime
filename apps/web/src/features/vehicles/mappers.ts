import type { VehicleFormValues } from '@xeprime/validators';
import {
  VEHICLE_TYPE,
  type BodyType,
  type FuelType,
  type ServiceType,
  type VehicleOperationStatus,
  type VehicleType,
} from '@xeprime/types';
import type { CreateVehicleInput, VehicleDetail } from './types';

/** Text rỗng coi như bỏ trống — không gửi chuỗi rỗng lên API. */
function textOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Giá trị form → payload API (create/update dùng chung; update là Partial nên thừa trường vẫn hợp lệ).
 * Tiền hoá string tại đây (ADR 0007): form giữ number, JSON đi string.
 */
export function formValuesToInput(values: VehicleFormValues): CreateVehicleInput {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    vehicleType: values.vehicleType,
    serviceType: values.serviceType,
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
    operationStatus: v.operationStatus as VehicleOperationStatus,
    plateNumber: v.plateNumber ?? '',
    brand: v.brand ?? '',
    model: v.model ?? '',
    color: v.color ?? '',
    fuelType: (v.fuelType ?? null) as FuelType | null,
    bodyType: (v.bodyType ?? null) as BodyType | null,
    manufactureYear: v.manufactureYear ?? null,
    seatCount: v.seatCount ?? null,
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
