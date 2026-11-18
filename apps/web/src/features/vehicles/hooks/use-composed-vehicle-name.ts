'use client';

import { CATALOG_TYPE, VEHICLE_TYPE, composeVehicleName } from '@xeprime/types';

import { useCatalogItems } from '@/features/catalog/use-catalog';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useBrandVehicleDataOptions } from '@/features/vehicle-data/hooks';

/** Các trường form đủ để ghép tên — `DeepPartial` của RHF nên mọi trường đều có thể thiếu. */
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
 * Tên xe sẽ được lưu khi THÊM xe (ADR 0102): tên đã có thì giữ, không thì ghép "Hãng Dòng Phiên bản
 * Năm" bằng ĐÚNG hàm server dùng (`composeVehicleName`) — khung xem trước và hộp xác nhận hiện đúng
 * cái tên chủ xe sẽ thấy sau khi lưu. Đọc lại các query ô chọn đang dùng (cùng khoá ⇒ cùng cache).
 */
export function useComposedVehicleName(values: ComposedNameValues): string {
  const vehicleType = values.vehicleType || VEHICLE_TYPE.CAR;
  const { items: brands } = useCatalogItems(CATALOG_TYPE.VEHICLE_BRAND);
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
