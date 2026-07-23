import type { VehicleFormValues } from '@xeprime/validators';
import type { FuelType, ServiceType, VehicleOperationStatus, VehicleType } from '@xeprime/types';
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
    manufactureYear: values.manufactureYear ?? undefined,
    seatCount: values.seatCount ?? undefined,
    weekdayPrice: values.weekdayPrice == null ? undefined : String(values.weekdayPrice),
    weekendPrice: values.weekendPrice == null ? undefined : String(values.weekendPrice),
    description: textOrUndefined(values.description),
    mainImageUrl: values.mainImageUrl ?? undefined,
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
    manufactureYear: v.manufactureYear ?? null,
    seatCount: v.seatCount ?? null,
    weekdayPrice: v.weekdayPrice == null ? null : Number(v.weekdayPrice),
    weekendPrice: v.weekendPrice == null ? null : Number(v.weekendPrice),
    description: v.description ?? '',
    mainImageUrl: v.mainImageUrl ?? null,
  };
}
