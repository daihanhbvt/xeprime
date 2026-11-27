import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@xeprime/api-client';
import {
  CATALOG_TYPE,
  VEHICLE_TYPE,
  composeVehicleName,
  normalizePlateNumber,
  type VehicleDataSpecField,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { vehicleDataApi, type VehicleDataOption } from '@/api/catalog';
import type { FieldLock } from '@/components/ui/LockedValueField';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';

/*
 * Bản native của các hook ADR 0102 bên web (`vehicle-data/hooks`, `use-catalog-spec-lock`,
 * `use-spec-field-lock`, `use-composed-vehicle-name`, `use-registration-autofill`) - cùng luật, cùng
 * khoá query (cùng cache giữa ô chọn, ô khoá và tên xem trước).
 */

const EMPTY_OPTIONS: VehicleDataOption[] = [];

/** Mọi xe chuẩn đã duyệt của một hãng (ADR 0102) - nguồn của ô "Mẫu xe" gộp VÀ của luật khoá. */
export function useBrandVehicleDataOptions(params: {
  vehicleType: string;
  brandKey: string | null | undefined;
  includeId: string | null | undefined;
}) {
  const { vehicleType, brandKey, includeId } = params;
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.catalog.brandVariants(vehicleType, brandKey ?? '', includeId ?? ''),
    queryFn: () => vehicleDataApi.brandOptions({ vehicleType, brandKey: brandKey!, includeId }),
    enabled: Boolean(brandKey),
    staleTime: 5 * 60 * 1000,
  });
  return { options: data ?? EMPTY_OPTIONS, isLoading: Boolean(brandKey) && isLoading, isError };
}

/** Phiên bản của MỘT dòng xe, lọc theo năm (chế độ "Nhập tay"); cái đang gắn luôn có mặt. */
export function useVehicleDataOptions(params: {
  modelId: string | null | undefined;
  year: number | null | undefined;
  includeId: string | null | undefined;
}) {
  const { modelId, year, includeId } = params;
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.catalog.variants(modelId ?? '', year ?? null, includeId ?? ''),
    queryFn: () => vehicleDataApi.options({ modelId: modelId!, year, includeId }),
    enabled: Boolean(modelId),
    staleTime: 5 * 60 * 1000,
  });
  return { options: data ?? EMPTY_OPTIONS, isLoading: Boolean(modelId) && isLoading };
}

/** Dòng xe chủ xe gõ mới (tạo ngay, chờ duyệt) - làm mới cả nhánh `catalog`. */
export function useCreateOwnerModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: vehicleDataApi.createOwnerModel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
  });
}

/** Xe chuẩn đang chọn ở ô "Mẫu xe" - đọc lại ĐÚNG query của ô chọn. */
export function useSelectedVehicleData(
  control: Control<VehicleFormValues>,
  vehicleType: string,
): VehicleDataOption | null {
  const brand = useWatch({ control, name: 'brand' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const { options } = useBrandVehicleDataOptions({ vehicleType, brandKey: brand, includeId: variantId });
  return (variantId && options.find((o) => o.id === variantId)) || null;
}

/** Giá trị của xe chuẩn cho một ô thông số - `null` khi xe chuẩn chưa khai ô đó. */
export function vehicleDataSpecValue(
  record: VehicleDataOption,
  field: VehicleDataSpecField,
): string | number | null {
  const value = record[field] as string | number | null | undefined;
  return value == null || value === '' ? null : value;
}

/** So giá trị form với xe chuẩn - số thập phân của API là chuỗi ("5.70"), form giữ số. */
function sameSpec(formValue: unknown, recordValue: string | number | null): boolean {
  if (recordValue == null || formValue == null || formValue === '') return false;
  if (typeof recordValue === 'number' || typeof formValue === 'number') {
    return Number(formValue) === Number(recordValue);
  }
  return String(formValue) === String(recordValue);
}

/** Ô form còn mang ĐÚNG giá trị xe chuẩn này khai (tự điền, chủ xe chưa sửa) hay không. */
export function matchesVehicleDataSpec(
  formValue: unknown,
  record: VehicleDataOption,
  field: VehicleDataSpecField,
): boolean {
  return sameSpec(formValue, vehicleDataSpecValue(record, field));
}

export interface SpecLock {
  locked: boolean;
  /** Khoá vì khớp xe chuẩn đang chọn (không chỉ vì dòng xe một cấu hình). */
  fromData: boolean;
  unlock: () => void;
}

/**
 * Khoá MỘT ô thông số theo dữ liệu mẫu xe (web `useCatalogSpecLock`): khoá khi xe chuẩn đang chọn
 * có giá trị cho ô VÀ ô mang đúng giá trị đó, hoặc khi dòng xe chỉ có một cấu hình (`modelLocked`).
 * Bấm bút ⇒ mở riêng ô đó cho tới khi đổi mẫu xe.
 */
export function useCatalogSpecLock(
  control: Control<VehicleFormValues>,
  vehicleType: string,
  field: VehicleDataSpecField,
  options: { modelLocked?: boolean } = {},
): SpecLock {
  const record = useSelectedVehicleData(control, vehicleType);
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const value = useWatch({ control, name: field });
  const scope = `${modelId ?? ''}|${record?.id ?? ''}`;
  const [unlockedScope, setUnlockedScope] = useState<string | null>(null);
  const fromData = record != null && sameSpec(value, vehicleDataSpecValue(record, field));
  const locked = unlockedScope !== scope && (fromData || Boolean(options.modelLocked));
  return { locked, fromData: locked && fromData, unlock: () => setUnlockedScope(scope) };
}

/**
 * Khoá theo mẫu xe → `FieldLock` của ô (web `useSpecFieldLock`). `active = false` (ô bị khoá vì lý do
 * KHÁC, vd xe đã lên chợ) ⇒ không khoá theo mẫu: bút không hứa một lần sửa mà ô không cho.
 */
export function useSpecFieldLock(): (lock: SpecLock, label: string, active?: boolean) => FieldLock {
  const t = useTranslations('Vehicles.form.catalog');
  return (lock, label, active = true) => ({
    locked: active && lock.locked,
    editLabel: t('unlockSpecAria', { field: label }),
    onUnlock: lock.unlock,
  });
}

export interface ComposedNameValues {
  name?: string | null;
  vehicleType?: string | null;
  brand?: string | null;
  vehicleCatalogModelId?: string | null;
  vehicleCatalogVariantId?: string | null;
  catalogVariantLabel?: string | null;
  manufactureYear?: number | null;
}

/**
 * Tên xe sẽ được lưu khi THÊM xe (web `useComposedVehicleName`): tên đã có thì giữ, không thì ghép
 * "Hãng Dòng Phiên bản Năm" bằng ĐÚNG hàm server dùng (`composeVehicleName`).
 */
export function useComposedVehicleName(values: ComposedNameValues): string {
  const vehicleType = values.vehicleType || VEHICLE_TYPE.CAR;
  const { catalog } = useCatalog();
  const brands = catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? [];
  const { models } = useCatalogModels({
    vehicleType,
    brandKey: values.brand,
    includeId: values.vehicleCatalogModelId,
  });
  const { options: variants } = useBrandVehicleDataOptions({
    vehicleType,
    brandKey: values.brand,
    includeId: values.vehicleCatalogVariantId,
  });
  const given = values.name?.trim();
  if (given) return given;
  const model = models.find((m) => m.id === values.vehicleCatalogModelId);
  if (!model) return '';
  const variant = variants.find((v) => v.id === values.vehicleCatalogVariantId);
  return composeVehicleName({
    brandLabel: brands.find((b) => b.key === values.brand)?.label ?? values.brand,
    modelLabel: model.label,
    variantLabel: variant?.label || values.catalogVariantLabel,
    manufactureYear: values.manufactureYear,
  });
}

/** Ô của form xe nhận giá trị máy đọc từ cà vẹt (ADR 0102 điều 6). */
export type RegistrationFilledField = 'plateNumber' | 'color';

/**
 * Lượt đọc cà vẹt MỚI ⇒ điền (đè) biển số + màu sơn (web `useApplyRegistrationReading`). Đặt ở thành
 * phần sống suốt wizard (form gốc), không ở bước - bước mount lại sẽ đè chữ chủ xe vừa sửa.
 */
export function useApplyRegistrationReading(
  reading: VehicleRegistrationReading | null | undefined,
  setValue: UseFormSetValue<VehicleFormValues>,
) {
  useEffect(() => {
    if (!reading) return;
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (reading.plateNumber) setValue('plateNumber', reading.plateNumber, opts);
    if (reading.color) setValue('color', reading.color, opts);
  }, [reading, setValue]);
}

/**
 * Ô biển số / màu đang KHOÁ theo cà vẹt (web `useRegistrationFieldLock`): khoá khi ô mang đúng giá
 * trị máy đọc. Bút mở riêng ô đó; ảnh cà vẹt mới = lượt đọc mới ⇒ khoá lại.
 */
export function useRegistrationFieldLock(
  control: Control<VehicleFormValues>,
  field: RegistrationFilledField,
  reading: VehicleRegistrationReading | null | undefined,
) {
  const value = useWatch({ control, name: field });
  const [unlockedFor, setUnlockedFor] = useState<VehicleRegistrationReading | null>(null);
  const read = reading?.[field] ?? null;
  const same =
    read != null &&
    (field === 'plateNumber'
      ? normalizePlateNumber(value) === normalizePlateNumber(read)
      : (value ?? '').trim() === read);
  return {
    locked: same && unlockedFor !== reading,
    value: value ?? '',
    unlock: () => setUnlockedFor(reading ?? null),
  };
}
