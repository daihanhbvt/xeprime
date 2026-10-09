/* Bản native của `apps/web/src/features/vehicles/hooks/use-catalog-model-spec.ts` — giữ đúng luật. */
import { catalogSpecRule, vehicleTransmissionTypesFor, type CatalogSpecRule } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';

import type { CatalogModel } from '@/api/catalog';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';

export interface CatalogModelSpec {
  /** Mẫu đang chọn ở ô "Dòng xe"; null khi chưa chọn hoặc danh sách chưa tải xong. */
  model: CatalogModel | null;
  seats: CatalogSpecRule<number>;
  fuel: CatalogSpecRule<string>;
  /** Hộp số của mẫu ỨNG VỚI một nguồn năng lượng — xem `catalogTransmissionRule`. */
  transmissionFor: (fuelType: string | null | undefined) => CatalogSpecRule<string>;
}

/**
 * Hộp số của mẫu xe cho MỘT nguồn năng lượng cụ thể.
 *
 * Danh mục lưu hộp số là HỢP của mọi bản (Camry xăng + hybrid ⇒ AT · CVT · e-CVT), nên phải giao
 * với bộ hợp lệ của nguồn năng lượng đang chọn: chọn bản hybrid thì chỉ còn e-CVT. Chưa chọn nguồn
 * năng lượng, hoặc giao rỗng (danh mục chưa khai đúng bản đó) ⇒ `free` — không khoá nhầm ai.
 */
export function catalogTransmissionRule(
  model: Pick<CatalogModel, 'vehicleType' | 'transmissions'> | null,
  fuelType: string | null | undefined,
): CatalogSpecRule<string> {
  if (!model || !fuelType) return { kind: 'free' };
  const valid = vehicleTransmissionTypesFor(model.vehicleType, fuelType) as readonly string[];
  return catalogSpecRule(model.transmissions.filter((t) => valid.includes(t)));
}

/**
 * Thông số ĐIỀN SẴN của mẫu xe đang chọn — luật `catalogSpecRule` áp cho từng ô:
 * một giá trị ⇒ điền và khoá, nhiều ⇒ chỉ chọn trong đó, rỗng ⇒ khai tự do.
 *
 * Đọc lại đúng query mà `VehicleIdentityFields` đang dùng (cùng tham số ⇒ cùng cache), nên các ô
 * (dòng xe, số chỗ, nguồn năng lượng, hộp số) cùng nhìn một bản dữ liệu, không thêm request nào.
 */
export function useCatalogModelSpec(
  control: Control<VehicleFormValues>,
  vehicleType: string,
): CatalogModelSpec {
  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const { models } = useCatalogModels({ vehicleType, brandKey: brand, includeId: modelId });
  const model = (modelId && models.find((m) => m.id === modelId)) || null;

  return useMemo(
    () => ({
      model,
      seats: catalogSpecRule(model?.seatCounts),
      fuel: catalogSpecRule(model?.fuelTypes),
      transmissionFor: (fuelType) => catalogTransmissionRule(model, fuelType),
    }),
    [model],
  );
}

/**
 * Giá trị một ô nên nhận khi mẫu xe ĐỔI: bản duy nhất của mẫu; giữ giá trị hiện tại nếu nó còn
 * nằm trong các bản của mẫu; không thì bỏ trống để chủ xe chọn lại — không đoán hộ.
 */
export function valueForSpecRule<T>(rule: CatalogSpecRule<T>, current: T | null | undefined): T | null {
  if (rule.kind === 'fixed') return rule.value;
  if (rule.kind === 'choice') return current != null && rule.values.includes(current) ? current : null;
  return current ?? null;
}
