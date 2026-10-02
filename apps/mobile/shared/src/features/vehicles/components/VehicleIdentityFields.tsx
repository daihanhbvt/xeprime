import { useEffect, useMemo, useRef, useState } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CATALOG_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { SelectField } from '@/components/ui/SelectField';
import type { SelectControlOption } from '@/components/ui/SelectControl';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';

/**
 * Cặp chọn PHỤ THUỘC: Hãng xe → Mẫu xe — bản native của `VehicleIdentityFields` bên web.
 *
 * Ba luật mà mọi màn khai xe phải giống nhau tuyệt đối, nên chúng sống ở đúng một component:
 *
 *  1. Danh sách hãng lọc theo LOẠI XE — người đăng xe máy không thấy Toyota.
 *  2. Ô "Mẫu xe" khoá cho tới khi chọn hãng, có ô tìm, và tách "đang phân phối" / "mẫu đời
 *     trước" — phần lớn xe cho thuê ở Việt Nam là xe đời trước, gộp phẳng thì xe đang bán chìm.
 *  3. Đổi loại xe hoặc đổi hãng thì mẫu đang chọn bị xoá.
 *
 * Giá trị lưu xuống là `vehicleCatalogModelId`; `brand`/`model` do BACKEND chép từ danh mục —
 * client không tự đặt cặp chữ đó (xem `VehiclesService.applyCatalogModel`). Đó là lý do không
 * còn đường nào lưu được một chiếc xe máy hiệu Toyota tên Vios.
 *
 * Nhóm mẫu xe đi vào `hint` của từng dòng chứ không phải tiêu đề nhóm: tấm chọn native là một
 * danh sách phẳng (`MenuOptionList`), và một dòng tiêu đề giả trong đó bấm được — thứ tệ hơn hẳn
 * một nhãn phụ nằm ngay dưới tên mẫu.
 */
export function VehicleIdentityFields({
  control,
  vehicleType,
  lockedNotice,
  disabled,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Lý do ô bị khoá (xe đã lên chợ) — nơi gọi truyền chữ, component không tự đoán. */
  lockedNotice?: string;
  disabled?: boolean;
  /**
   * Dọn mẫu xe khi đổi loại xe hoặc đổi hãng. Không có nó thì một chiếc xe máy vẫn giữ
   * `vehicleCatalogModelId` của chiếc Vios vừa chọn nhầm, và server mới là nơi phát hiện ra.
   */
  setValue?: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const domainLabel = useDomainLabel();
  const { catalog } = useCatalog();
  const [modelSearch, setModelSearch] = useState('');

  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });

  const brandOptions = useMemo<SelectControlOption[]>(() => {
    const items = catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? [];
    const options = items
      // Mảng rỗng = hãng chưa gắn nhãn loại xe ⇒ hiện cho mọi loại. Bỏ vế này thì một hãng admin
      // vừa thêm biến mất khỏi mọi form mà không ai hiểu vì sao.
      .filter(
        (item) =>
          item.vehicleTypes.length === 0 ||
          (item.vehicleTypes as readonly string[]).includes(vehicleType),
      )
      .map((item) => ({ value: item.key, label: item.label }));

    if (brand && !options.some((option) => option.value === brand)) {
      // Xe đang lưu một hãng không còn hợp lệ cho loại xe này (dữ liệu cũ, hoặc admin vừa sửa
      // chiều áp dụng): vẫn hiện đúng cái đang có, nhãn lấy từ danh sách đầy đủ.
      const known = items.find((item) => item.key === brand);
      options.push({ value: brand, label: known?.label ?? brand });
    }
    return options;
  }, [catalog, vehicleType, brand]);

  const { models, isLoading } = useCatalogModels({
    vehicleType,
    brandKey: brand,
    includeId: modelId,
  });
  const groups = useCatalogModelGroups(models);

  /* Lọc TẠI CHỖ: danh sách mẫu đã nằm sẵn trong bộ nhớ, gọi lại server cho mỗi phím là thừa. */
  const modelOptions = useMemo<SelectControlOption[]>(() => {
    const needle = modelSearch.trim().toLowerCase();
    return groups.flatMap((group) =>
      group.options
        .filter((option) => !needle || option.label.toLowerCase().includes(needle))
        .map((option) => ({
          ...option,
          hint: domainLabel('catalogMarketStatus', group.marketStatus),
        })),
    );
  }, [groups, domainLabel, modelSearch]);

  /*
   * Đổi hãng (hoặc đổi loại xe) → mẫu cũ chắc chắn sai, bỏ ngay.
   *
   * So với giá trị TRƯỚC ĐÓ chứ không chạy vô điều kiện: một effect xoá mỗi lần render sẽ thổi
   * bay lựa chọn hợp lệ ngay khi form sửa vừa nạp dữ liệu xe.
   */
  const previous = useRef<{ brand?: string | null; vehicleType: string }>({ brand, vehicleType });
  useEffect(() => {
    const changed = previous.current.brand !== brand || previous.current.vehicleType !== vehicleType;
    previous.current = { brand, vehicleType };
    if (changed && setValue) setValue('vehicleCatalogModelId', null, { shouldDirty: true });
  }, [brand, vehicleType, setValue]);

  return (
    <YStack gap={space.md}>
      <SelectField
        control={control}
        name="brand"
        label={t('brand')}
        options={brandOptions}
        placeholder={t('brandPlaceholder')}
        disabled={disabled}
        {...(lockedNotice ? { hint: lockedNotice } : {})}
      />
      <SelectField
        control={control}
        name="vehicleCatalogModelId"
        label={t('model')}
        options={modelOptions}
        placeholder={t('modelPlaceholder')}
        // Khoá tới khi có hãng: danh sách mẫu xe không kèm hãng là vài trăm dòng vô nghĩa.
        disabled={disabled || !brand}
        hint={brand ? t('modelHelp') : t('modelPickBrandFirst')}
        onSearch={setModelSearch}
        searchPlaceholder={t('modelPlaceholder')}
        emptyText={isLoading ? undefined : t('modelEmpty')}
      />
    </YStack>
  );
}
