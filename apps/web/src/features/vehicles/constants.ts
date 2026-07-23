import {
  FUEL_TYPE_LABEL,
  FUEL_TYPE_VALUES,
  SERVICE_TYPE_LABEL,
  SERVICE_TYPE_VALUES,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  type FuelType,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import type { SelectFieldOption } from '@/components/form/SelectField';
import type { VehicleSort } from './types';

/** Nhãn option đến từ META/LABEL của `@xeprime/types` — thêm giá trị mới chỉ sửa một chỗ (ADR 0005). */
function fromLabel<T extends string>(
  values: readonly T[],
  label: Readonly<Record<T, string>>,
): SelectFieldOption[] {
  return values.map((value) => ({ value, label: label[value] }));
}

function fromMeta<T extends string>(
  values: readonly T[],
  meta: Readonly<Record<T, { label: string }>>,
): SelectFieldOption[] {
  return values.map((value) => ({ value, label: meta[value].label }));
}

export const VEHICLE_TYPE_OPTIONS = fromLabel(VEHICLE_TYPE_VALUES, VEHICLE_TYPE_LABEL);
export const SERVICE_TYPE_OPTIONS = fromLabel(SERVICE_TYPE_VALUES, SERVICE_TYPE_LABEL);
export const FUEL_TYPE_OPTIONS = fromLabel(FUEL_TYPE_VALUES, FUEL_TYPE_LABEL);
export const OPERATION_STATUS_OPTIONS = fromMeta(
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_OPERATION_STATUS_META,
);
export const PUBLIC_STATUS_OPTIONS = fromMeta(
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_META,
);

/** Tra nhãn từ giá trị thô (contract trả string) — fallback về chính giá trị nếu lạ. */
export const vehicleTypeLabel = (value: string): string =>
  VEHICLE_TYPE_LABEL[value as VehicleType] ?? value;
export const serviceTypeLabel = (value: string): string =>
  SERVICE_TYPE_LABEL[value as ServiceType] ?? value;
export const fuelTypeLabel = (value: string | null | undefined): string =>
  value ? (FUEL_TYPE_LABEL[value as FuelType] ?? value) : '—';

export const VEHICLE_SORT_OPTIONS: readonly { value: VehicleSort; label: string }[] = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'name_asc', label: 'Tên A → Z' },
  { value: 'code_asc', label: 'Mã tăng dần' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
];
