import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@xeprime/api-client';
import { useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CATALOG_REVIEW_STATUS, CATALOG_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import { vehicleDataApi } from '@/api/catalog';
import { SelectControl } from '@/components/ui/SelectControl';
import type { VehicleFormValues } from '@xeprime/validators';
import { SelectField } from '@/components/ui/SelectField';
import type { SelectControlOption } from '@/components/ui/SelectControl';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import { useCatalogModelSpec, valueForSpecRule } from '../hooks/use-catalog-model-spec';

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
  required = false,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Lý do ô bị khoá (xe đã lên chợ) — nơi gọi truyền chữ, component không tự đoán. */
  lockedNotice?: string;
  disabled?: boolean;
  /** Đánh dấu bắt buộc (wizard thêm xe — điều kiện lên chợ). Luật thật ở schema. */
  required?: boolean;
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

  usePrefillFromModel(control, vehicleType, modelId, setValue);

  return (
    <YStack gap={space.md}>
      {/* Figma: Hãng xe | Dòng xe cùng một hàng, hai cột bằng nhau. */}
      <XStack gap={space.md}>
        <YStack f={1} minWidth={0}>
          <SelectField
            control={control}
            name="brand"
            label={t('brand')}
            required={required}
            options={brandOptions}
            placeholder={t('brandPlaceholder')}
            disabled={disabled}
            {...(lockedNotice ? { hint: lockedNotice } : {})}
          />
        </YStack>
        <YStack f={1} minWidth={0}>
          <SelectField
            control={control}
            name="vehicleCatalogModelId"
            label={t('model')}
            required={required}
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
      </XStack>
      <VariantField control={control} disabled={disabled} setValue={setValue} />
    </YStack>
  );
}

/** Giá trị giả của dòng "Thêm phiên bản …" trong tấm chọn - không bao giờ vào form. */
const NEW_VARIANT = '__new_variant__';

/**
 * Ô "Phiên bản" (xe chuẩn của Dữ liệu xe, ADR 0090) - bản native của ô cùng tên trong
 * `VehicleIdentityFields` web: lọc theo năm sản xuất, cái đang gắn luôn có mặt; không có thì gõ tên
 * mới (`catalogVariantLabel`, server gắn hoặc tự ghi nhận). Đổi dòng xe ⇒ bỏ phiên bản cũ.
 */
function VariantField({
  control,
  disabled,
  setValue,
}: {
  control: Control<VehicleFormValues>;
  disabled?: boolean;
  setValue?: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.catalog');
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const variantLabel = useWatch({ control, name: 'catalogVariantLabel' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const [search, setSearch] = useState('');

  const { data: variants, isLoading } = useQuery({
    queryKey: queryKeys.catalog.variants(modelId ?? '', year ?? null, variantId ?? ''),
    queryFn: () => vehicleDataApi.options({ modelId: modelId!, year, includeId: variantId }),
    enabled: Boolean(modelId),
    staleTime: 5 * 60 * 1000,
  });

  const previousModel = useRef(modelId);
  useEffect(() => {
    // Bỏ qua null → id (form vừa nạp/điền sẵn dòng xe): chỉ ĐỔI dòng xe mới làm phiên bản cũ sai.
    const changed = previousModel.current != null && previousModel.current !== modelId;
    previousModel.current = modelId;
    if (changed && setValue) {
      setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
      setValue('catalogVariantLabel', null, { shouldDirty: true });
    }
  }, [modelId, setValue]);

  const options = useMemo(() => {
    const list = (variants ?? []).map((v) => {
      const years =
        v.yearFrom != null && v.yearTo != null && v.yearFrom !== v.yearTo
          ? t('years', { from: v.yearFrom, to: v.yearTo })
          : v.yearFrom != null && v.yearTo == null
            ? t('yearsOpen', { from: v.yearFrom })
            : v.yearTo != null && v.yearFrom == null
              ? t('yearsUntil', { to: v.yearTo })
              : v.yearFrom != null
                ? String(v.yearFrom)
                : null;
      const base = [v.label || t('variantAny'), years].filter(Boolean).join(' · ');
      return {
        value: v.id,
        label: v.reviewStatus === CATALOG_REVIEW_STATUS.PENDING ? t('newOption', { label: base }) : base,
      };
    });
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list;
    // Gõ thêm chỉ mở ở form có `setValue` (đăng/sửa xe của chủ xe).
    return setValue && !disabled && search.trim()
      ? [...filtered, { value: NEW_VARIANT, label: t('addVariant', { text: search.trim() }) }]
      : filtered;
  }, [variants, search, t, setValue, disabled]);

  const onChange = (next: string) => {
    if (!setValue) return;
    const opts = { shouldDirty: true } as const;
    if (next === NEW_VARIANT) {
      setValue('vehicleCatalogVariantId', null, opts);
      setValue('catalogVariantLabel', search.trim(), opts);
    } else {
      setValue('vehicleCatalogVariantId', next || null, opts);
      setValue('catalogVariantLabel', null, opts);
    }
    setSearch('');
  };

  return (
    <SelectControl
      label={t('variant')}
      value={variantId ?? null}
      options={options}
      onChange={onChange}
      placeholder={variantLabel ? t('newVariant', { name: variantLabel }) : t('variantPlaceholder')}
      hint={modelId ? t('variantHelp') : t('variantPickModelFirst')}
      disabled={disabled || !modelId || !setValue}
      onSearch={setSearch}
      searchPlaceholder={t('variantPlaceholder')}
      emptyText={isLoading ? undefined : t('variantEmpty')}
      allowClear
    />
  );
}

/**
 * Chọn một MẪU XE MỚI ⇒ điền sẵn số chỗ, nguồn năng lượng, hộp số và phân khúc theo danh mục —
 * bản native của `usePrefillFromModel` bên web, cùng luật `valueForSpecRule`.
 *
 * Chỉ chạy khi người dùng ĐỔI sang một mẫu khác mẫu đã lưu, và đợi tới khi mẫu đó tải xong: form
 * sửa vừa nạp xe (hay quay về mẫu cũ sau `reset`) không phải một lượt chọn mẫu, điền lại lúc đó là
 * ghi đè dữ liệu đã lưu.
 */
function usePrefillFromModel(
  control: Control<VehicleFormValues>,
  vehicleType: string,
  modelId: string | null | undefined,
  setValue: UseFormSetValue<VehicleFormValues> | undefined,
) {
  const spec = useCatalogModelSpec(control, vehicleType);
  const seatCount = useWatch({ control, name: 'seatCount' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const transmission = useWatch({ control, name: 'transmission' });
  const savedModelId = useFormState({ control }).defaultValues?.vehicleCatalogModelId ?? null;

  const pending = useRef<string | null>(null);
  const lastModelId = useRef(modelId);
  useEffect(() => {
    if (lastModelId.current !== modelId) {
      pending.current = modelId && modelId !== savedModelId ? modelId : null;
    }
    lastModelId.current = modelId;
  }, [modelId, savedModelId]);

  useEffect(() => {
    const model = spec.model;
    if (!setValue || !model || pending.current !== model.id) return;
    pending.current = null;

    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (model.vehicleType === VEHICLE_TYPE.CAR) {
      const seats = valueForSpecRule(spec.seats, seatCount);
      if (seats !== (seatCount ?? null)) setValue('seatCount', seats, opts);
    }
    const fuel = valueForSpecRule(spec.fuel, fuelType);
    if (fuel !== (fuelType ?? null)) setValue('fuelType', fuel as VehicleFormValues['fuelType'], opts);
    // Hộp số theo ĐÚNG nguồn năng lượng vừa đặt (Camry hybrid ⇒ e-CVT).
    const gear = valueForSpecRule(spec.transmissionFor(fuel), transmission);
    if (gear !== (transmission ?? null)) {
      setValue('transmission', gear as VehicleFormValues['transmission'], opts);
    }
    if (model.motorbikeCategory) {
      setValue(
        'motorbikeCategory',
        model.motorbikeCategory as VehicleFormValues['motorbikeCategory'],
        opts,
      );
    }
  }, [spec, seatCount, fuelType, transmission, setValue]);
}
