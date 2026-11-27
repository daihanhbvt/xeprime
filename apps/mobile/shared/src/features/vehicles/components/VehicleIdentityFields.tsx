import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useController,
  useFormState,
  useWatch,
  type Control,
  type UseFormSetValue,
} from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_REVIEW_STATUS,
  CATALOG_TYPE,
  VEHICLE_DATA_SPEC_FIELDS,
  VEHICLE_TYPE,
  normalizeCatalogSearch,
  variantCoversYear,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import type { VehicleDataOption } from '@/api/catalog';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { SelectControl, type SelectControlOption } from '@/components/ui/SelectControl';
import { SelectField } from '@/components/ui/SelectField';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontWeight, space } from '@/theme/tokens';
import { useCatalogModelSpec, valueForSpecRule } from '../hooks/use-catalog-model-spec';
import {
  matchesVehicleDataSpec,
  useBrandVehicleDataOptions,
  useCreateOwnerModel,
  useSelectedVehicleData,
  useVehicleDataOptions,
} from '../hooks/use-vehicle-data';

/** Giá trị nội bộ của ô "Mẫu xe" gộp - không bao giờ ghi xuống form. */
const MANUAL_VALUE = '__manual__';
const NEW_MODEL = '__new_model__';
const NEW_VARIANT = '__new_variant__';
const variantValue = (id: string) => `v:${id}`;
const modelValue = (id: string) => `m:${id}`;
/** Các ô thông số xe chuẩn điền được - mảng thường cho `useWatch` (hằng gốc là `readonly`). */
const SPEC_FIELD_NAMES = [...VEHICLE_DATA_SPEC_FIELDS];

/**
 * Hãng xe → MẪU XE (ADR 0102) - bản native của `VehicleIdentityFields` web.
 *
 * Ô "Mẫu xe" là MỘT ô tìm kiếm gộp dòng xe + phiên bản + đời từ dữ liệu xe chuẩn: chọn một xe chuẩn
 * là xong phần nhận dạng - thông số có trong dữ liệu được ĐIỀN NGAY (các ô tự khoá, bút để sửa), tên
 * xe do server ghép. Dòng xe chưa có xe chuẩn nào hiện riêng tên dòng. Mục cuối "Nhập tay" mở cặp ô
 * Dòng xe → Phiên bản, gõ thêm được dòng/phiên bản mới (chờ duyệt, ADR 0090).
 *
 * Luật chung: hãng lọc theo LOẠI XE; ô mẫu khoá tới khi chọn hãng; đổi loại xe/hãng ⇒ bỏ mẫu và gỡ
 * thông số xe chuẩn cũ đã tự điền. Nhóm "đang phân phối / đời trước" đi vào `hint` của từng dòng
 * (tấm chọn native là danh sách phẳng).
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
  /** Lý do ô bị khoá (xe đã lên chợ) - nơi gọi truyền chữ, component không tự đoán. */
  lockedNotice?: string;
  disabled?: boolean;
  /** Đánh dấu bắt buộc (wizard thêm xe). Luật thật ở schema. */
  required?: boolean;
  /** Dọn mẫu xe khi đổi loại xe hoặc đổi hãng; vắng = màn chỉ đọc (không có "Nhập tay"). */
  setValue?: UseFormSetValue<VehicleFormValues>;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const { catalog } = useCatalog();
  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const variantLabel = useWatch({ control, name: 'catalogVariantLabel' });
  // Xe đang mang một phiên bản GÕ TAY thì ô gộp không có dòng nào để hiện nó - mở sẵn chế độ nhập tay.
  const [manual, setManual] = useState(() => Boolean(variantLabel));
  const editable = Boolean(setValue) && !disabled;

  const brandOptions = useMemo<SelectControlOption[]>(() => {
    const items = catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? [];
    const options = items
      // Mảng rỗng = hãng chưa gắn nhãn loại xe ⇒ hiện cho mọi loại.
      .filter(
        (item) =>
          item.vehicleTypes.length === 0 ||
          (item.vehicleTypes as readonly string[]).includes(vehicleType),
      )
      .map((item) => ({ value: item.key, label: item.label }));
    if (brand && !options.some((option) => option.value === brand)) {
      const known = items.find((item) => item.key === brand);
      options.push({ value: brand, label: known?.label ?? brand });
    }
    return options;
  }, [catalog, vehicleType, brand]);

  /*
   * Đổi hãng (hoặc loại xe) → mẫu cũ chắc chắn sai, bỏ ngay cùng phiên bản, và gỡ thông số xe chuẩn
   * CŨ đã tự điền mà chủ xe chưa sửa. So với giá trị TRƯỚC ĐÓ: form sửa vừa nạp không bị xoá.
   */
  const previous = useRef<{ brand?: string | null; vehicleType: string }>({ brand, vehicleType });
  const selected = useSelectedVehicleData(control, vehicleType);
  const lastSelected = useRef(selected);
  const specValues = useWatch({ control, name: SPEC_FIELD_NAMES });
  useEffect(() => {
    const changed = previous.current.brand !== brand || previous.current.vehicleType !== vehicleType;
    previous.current = { brand, vehicleType };
    if (!changed || !setValue) return;
    if (lastSelected.current) {
      clearPreviousVehicleDataSpecs(lastSelected.current, specValues, setValue);
      lastSelected.current = null;
    }
    clearModel(setValue);
    // `specValues` chỉ ĐỌC lúc hãng/loại xe đổi - thêm vào deps là xoá lại mỗi lần gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, vehicleType, setValue]);
  // Đặt SAU effect trên: lượt render đổi hãng còn giữ bản xe chuẩn cũ cho effect kia đọc.
  useEffect(() => {
    if (selected) lastSelected.current = selected;
  }, [selected]);

  usePrefillFromModel(control, vehicleType, modelId, setValue);

  return (
    <YStack gap={space.md}>
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
      {manual && setValue ? (
        <ManualModelFields
          control={control}
          vehicleType={vehicleType}
          required={required}
          disabled={disabled}
          setValue={setValue}
          onBackToList={() => {
            setValue('catalogVariantLabel', null, { shouldDirty: true });
            setManual(false);
          }}
        />
      ) : (
        <ModelVariantSelect
          control={control}
          vehicleType={vehicleType}
          required={required}
          disabled={disabled}
          lockedNotice={lockedNotice}
          setValue={setValue}
          onManual={editable ? () => setManual(true) : undefined}
        />
      )}
    </YStack>
  );
}

function clearModel(setValue: UseFormSetValue<VehicleFormValues>) {
  const opts = { shouldDirty: true } as const;
  setValue('vehicleCatalogModelId', null, opts);
  setValue('vehicleCatalogVariantId', null, opts);
  setValue('catalogVariantLabel', null, opts);
}

/** Đời của một xe chuẩn: "2018 - 2022" · "2023 - nay" · "đến 2020" · "2019" · rỗng. */
function useVariantYears() {
  const t = useTranslations('Vehicles.form.catalog');
  return useCallback(
    (v: Pick<VehicleDataOption, 'yearFrom' | 'yearTo'>): string | null => {
      if (v.yearFrom != null && v.yearTo != null && v.yearFrom !== v.yearTo) {
        return t('years', { from: v.yearFrom, to: v.yearTo });
      }
      if (v.yearFrom != null && v.yearTo == null) return t('yearsOpen', { from: v.yearFrom });
      if (v.yearTo != null && v.yearFrom == null) return t('yearsUntil', { to: v.yearTo });
      return v.yearFrom != null ? String(v.yearFrom) : null;
    },
    [t],
  );
}

/**
 * Chép thông số của xe chuẩn vào form (ADR 0102 - ghi đè ô cũ vì chủ xe vừa nói "xe tôi là bản
 * này"). Ô xe chuẩn chưa khai thì giữ nguyên; tiện ích được CỘNG thêm, không thay.
 */
function applyVehicleDataSpecs(
  record: VehicleDataOption,
  vehicleType: string,
  features: VehicleFormValues['features'] | undefined,
  setValue: UseFormSetValue<VehicleFormValues>,
) {
  const opts = { shouldDirty: true, shouldValidate: true } as const;
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  if (isCar && record.seatCount != null) setValue('seatCount', record.seatCount, opts);
  if (isCar && record.bodyType) {
    setValue('bodyType', record.bodyType as VehicleFormValues['bodyType'], opts);
  }
  if (record.fuelType) setValue('fuelType', record.fuelType as VehicleFormValues['fuelType'], opts);
  if (record.transmission) {
    setValue('transmission', record.transmission as VehicleFormValues['transmission'], opts);
  }
  const numbers = [
    'engineDisplacementCc',
    'horsepowerHp',
    'lengthMm',
    'widthMm',
    'heightMm',
    'curbWeightKg',
    'electricRangeKm',
  ] as const;
  for (const key of numbers) {
    const value = record[key];
    if (value != null) setValue(key, value, opts);
  }
  if (record.fuelConsumptionCombined) {
    setValue('fuelConsumptionCombined', Number(record.fuelConsumptionCombined), opts);
  }
  if (record.batteryCapacityKwh) {
    setValue('batteryCapacityKwh', Number(record.batteryCapacityKwh), opts);
  }
  if (record.featureKeys.length > 0) {
    const merged = [...new Set([...(features ?? []), ...record.featureKeys])];
    setValue('features', merged as VehicleFormValues['features'], opts);
  }
}

/**
 * Đổi mẫu xe ⇒ gỡ thông số mà xe chuẩn CŨ đã tự điền và chủ xe chưa sửa (ô còn đúng giá trị của nó).
 * Ô chủ xe đã tự sửa thì giữ nguyên.
 */
function clearPreviousVehicleDataSpecs(
  previous: VehicleDataOption,
  current: readonly unknown[],
  setValue: UseFormSetValue<VehicleFormValues>,
) {
  const opts = { shouldDirty: true, shouldValidate: true } as const;
  VEHICLE_DATA_SPEC_FIELDS.forEach((field, index) => {
    if (matchesVehicleDataSpec(current[index], previous, field)) setValue(field, null, opts);
  });
}

/** Ô "Mẫu xe" gộp dòng + phiên bản + đời của một hãng. */
function ModelVariantSelect({
  control,
  vehicleType,
  required,
  disabled,
  lockedNotice,
  setValue,
  onManual,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  required: boolean;
  disabled?: boolean | undefined;
  lockedNotice?: string | undefined;
  setValue?: UseFormSetValue<VehicleFormValues> | undefined;
  /** Có ⇒ cuối danh sách có mục "Nhập tay". */
  onManual?: (() => void) | undefined;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const yearsOf = useVariantYears();
  const [search, setSearch] = useState('');

  const brand = useWatch({ control, name: 'brand' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const features = useWatch({ control, name: 'features' });
  const specValues = useWatch({ control, name: SPEC_FIELD_NAMES });
  // Lỗi "bắt buộc" của dòng xe hiện ngay dưới ô gộp - đây là ô duy nhất ghi ra nó.
  const { field, fieldState } = useController({ control, name: 'vehicleCatalogModelId' });
  const modelId = field.value;

  const { models, isLoading } = useCatalogModels({ vehicleType, brandKey: brand, includeId: modelId });
  const groups = useCatalogModelGroups(models);
  const { options: variants, isLoading: variantsLoading } = useBrandVehicleDataOptions({
    vehicleType,
    brandKey: brand,
    includeId: variantId,
  });

  const options = useMemo<SelectControlOption[]>(() => {
    const mark = (label: string, pending: boolean) =>
      pending ? tCatalog('newOption', { label }) : label;
    // ĐỜI chỉ thêm khi cùng một phiên bản có nhiều đời - lúc đó nó là thứ duy nhất phân biệt.
    const sameName = new Map<string, number>();
    for (const v of variants) {
      const key = `${v.modelId}|${normalizeCatalogSearch(v.label)}`;
      sameName.set(key, (sameName.get(key) ?? 0) + 1);
    }
    const rows = groups.flatMap((group) => {
      const hint = domainLabel('catalogMarketStatus', group.marketStatus);
      return group.options.flatMap((o) => {
        const model = models.find((m) => m.id === o.value);
        if (!model) return [];
        const modelPending = model.reviewStatus === CATALOG_REVIEW_STATUS.PENDING;
        const list: SelectControlOption[] = variants
          .filter((v) => v.modelId === model.id)
          .map((v) => {
            const repeated =
              (sameName.get(`${v.modelId}|${normalizeCatalogSearch(v.label)}`) ?? 0) > 1;
            const years = repeated ? yearsOf(v) : null;
            const name = [model.label, v.label].filter(Boolean).join(' ');
            return {
              value: variantValue(v.id),
              label: mark(
                years ? `${name} · ${years}` : name,
                modelPending || v.reviewStatus === CATALOG_REVIEW_STATUS.PENDING,
              ),
              hint,
            };
          });
        // Dòng chưa có xe chuẩn nào ⇒ chọn theo dòng; xe đang gắn dòng mà không gắn phiên bản thì
        // vẫn phải thấy đúng thứ nó đang mang.
        if (list.length === 0 || (model.id === modelId && !variantId)) {
          list.unshift({ value: modelValue(model.id), label: mark(model.label, modelPending), hint });
        }
        return list;
      });
    });
    // Tìm không dấu ("vios 1.5g"); mục "Nhập tay" luôn còn ở cuối dù gõ gì.
    const needle = normalizeCatalogSearch(search);
    const filtered = needle
      ? rows.filter((row) => normalizeCatalogSearch(row.label).includes(needle))
      : rows;
    return onManual ? [...filtered, { value: MANUAL_VALUE, label: tCatalog('manualEntry') }] : filtered;
  }, [groups, models, variants, modelId, variantId, onManual, domainLabel, tCatalog, yearsOf, search]);

  const record = (variantId && variants.find((v) => v.id === variantId)) || null;
  const yearOutside =
    record && year != null && !variantCoversYear(record, year) ? yearsOf(record) : null;

  function handleChange(value: string) {
    setSearch('');
    if (value === MANUAL_VALUE) {
      onManual?.();
      return;
    }
    if (!setValue) return;
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (record && value !== variantValue(record.id)) {
      clearPreviousVehicleDataSpecs(record, specValues, setValue);
    }
    if (!value) {
      clearModel(setValue);
      return;
    }
    if (value.startsWith('m:')) {
      setValue('vehicleCatalogModelId', value.slice(2), opts);
      setValue('vehicleCatalogVariantId', null, opts);
      setValue('catalogVariantLabel', null, opts);
      return;
    }
    const picked = variants.find((v) => v.id === value.slice(2));
    if (!picked) return;
    setValue('vehicleCatalogModelId', picked.modelId, opts);
    setValue('vehicleCatalogVariantId', picked.id, opts);
    setValue('catalogVariantLabel', null, opts);
    // Đời chỉ một năm ⇒ năm sản xuất chỉ có một đáp án.
    if (year == null && picked.yearFrom != null && picked.yearFrom === picked.yearTo) {
      setValue('manufactureYear', picked.yearFrom, opts);
    }
    applyVehicleDataSpecs(picked, vehicleType, features, setValue);
    toast.showSuccess(tCatalog('applied'));
  }

  const error = fieldState.error?.message;
  const hint =
    lockedNotice ??
    (yearOutside
      ? tCatalog('yearOutsideVariant', { year: year ?? '', years: yearOutside })
      : brand
        ? tCatalog('modelVariantHelp')
        : t('modelPickBrandFirst'));

  return (
    <SelectControl
      label={tCatalog('modelVariant')}
      required={required}
      value={variantId ? variantValue(variantId) : modelId ? modelValue(modelId) : null}
      options={options}
      onChange={handleChange}
      placeholder={tCatalog('modelVariantPlaceholder')}
      hint={hint}
      {...(error ? { error } : {})}
      // Khoá tới khi có hãng: danh sách mẫu xe không kèm hãng là vài trăm dòng vô nghĩa.
      disabled={disabled || !brand || !setValue}
      onSearch={setSearch}
      searchPlaceholder={tCatalog('modelVariantPlaceholder')}
      {...(isLoading || variantsLoading ? {} : { emptyText: t('modelEmpty') })}
      allowClear
    />
  );
}

/**
 * "Nhập tay": cặp ô Dòng xe → Phiên bản như trước ADR 0102 - chọn dòng có sẵn hoặc gõ dòng mới (tạo
 * ngay, chờ duyệt), chọn hoặc gõ phiên bản (server ghi nhận vào Dữ liệu xe để admin duyệt).
 */
function ManualModelFields({
  control,
  vehicleType,
  required,
  disabled,
  setValue,
  onBackToList,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  required: boolean;
  disabled?: boolean | undefined;
  setValue: UseFormSetValue<VehicleFormValues>;
  onBackToList: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.specs');
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const yearsOf = useVariantYears();
  const createModel = useCreateOwnerModel();
  const [modelSearch, setModelSearch] = useState('');
  const [variantSearch, setVariantSearch] = useState('');

  const brand = useWatch({ control, name: 'brand' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const variantLabel = useWatch({ control, name: 'catalogVariantLabel' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const features = useWatch({ control, name: 'features' });
  const { field: modelField, fieldState: modelState } = useController({
    control,
    name: 'vehicleCatalogModelId',
  });
  const modelId = modelField.value;
  const canCreate = !disabled;

  const { models, isLoading } = useCatalogModels({ vehicleType, brandKey: brand, includeId: modelId });
  const groups = useCatalogModelGroups(models);
  const modelOptions = useMemo<SelectControlOption[]>(() => {
    const needle = normalizeCatalogSearch(modelSearch);
    const list = groups.flatMap((group) =>
      group.options
        .map((o) => {
          const model = models.find((m) => m.id === o.value);
          const label =
            model?.reviewStatus === CATALOG_REVIEW_STATUS.PENDING
              ? tCatalog('newOption', { label: o.label })
              : o.label;
          return { value: o.value, label, hint: domainLabel('catalogMarketStatus', group.marketStatus) };
        })
        .filter((o) => !needle || normalizeCatalogSearch(o.label).includes(needle)),
    );
    const typed = modelSearch.trim();
    return canCreate && brand && typed
      ? [...list, { value: NEW_MODEL, label: tCatalog('addModel', { text: typed }) }]
      : list;
  }, [groups, models, modelSearch, canCreate, brand, domainLabel, tCatalog]);

  // Phiên bản của dòng đã chọn, ưu tiên đúng đời; cái đang gắn luôn có mặt (`includeId`).
  const { options: variants, isLoading: variantsLoading } = useVehicleDataOptions({
    modelId,
    year,
    includeId: variantId,
  });
  const variantOptions = useMemo<SelectControlOption[]>(() => {
    const list = variants.map((v) => {
      const base = [v.label || tCatalog('variantAny'), yearsOf(v)].filter(Boolean).join(' · ');
      return {
        value: v.id,
        label:
          v.reviewStatus === CATALOG_REVIEW_STATUS.PENDING
            ? tCatalog('newOption', { label: base })
            : base,
      };
    });
    const needle = normalizeCatalogSearch(variantSearch);
    const filtered = needle
      ? list.filter((o) => normalizeCatalogSearch(o.label).includes(needle))
      : list;
    const typed = variantSearch.trim();
    return canCreate && modelId && typed
      ? [...filtered, { value: NEW_VARIANT, label: tCatalog('addVariant', { text: typed }) }]
      : filtered;
  }, [variants, variantSearch, canCreate, modelId, tCatalog, yearsOf]);

  function onModelChange(next: string) {
    const typed = modelSearch.trim();
    setModelSearch('');
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (next === NEW_MODEL) {
      // Dòng xe chưa có: tạo ngay (chờ duyệt) rồi chọn nó cho xe này.
      if (!brand || createModel.isPending || !typed) return;
      createModel.mutate(
        { vehicleType, brandKey: brand, label: typed },
        {
          onSuccess: (model) => {
            setValue('vehicleCatalogModelId', model.id, opts);
            setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
            setValue('catalogVariantLabel', null, { shouldDirty: true });
          },
          onError: (err) => toast.showError(errorMessage(err)),
        },
      );
      return;
    }
    setValue('vehicleCatalogModelId', next || null, opts);
    // Đổi dòng ⇒ phiên bản cũ (chọn hay gõ) thuộc dòng cũ, bỏ ngay.
    setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
    setValue('catalogVariantLabel', null, { shouldDirty: true });
  }

  function onVariantChange(next: string) {
    const typed = variantSearch.trim();
    setVariantSearch('');
    const opts = { shouldDirty: true } as const;
    if (next === NEW_VARIANT) {
      setValue('vehicleCatalogVariantId', null, opts);
      setValue('catalogVariantLabel', typed, opts);
      return;
    }
    setValue('vehicleCatalogVariantId', next || null, opts);
    // Chọn một phiên bản có sẵn ⇒ bỏ tên đã gõ, điền thông số như ô gộp.
    setValue('catalogVariantLabel', null, opts);
    const picked = variants.find((v) => v.id === next);
    if (picked) applyVehicleDataSpecs(picked, vehicleType, features, setValue);
  }

  const modelError = modelState.error?.message;

  return (
    <YStack gap={space.md}>
      <SelectControl
        label={t('model')}
        required={required}
        value={modelId ?? null}
        options={modelOptions}
        onChange={onModelChange}
        placeholder={t('modelPlaceholder')}
        hint={brand ? t('modelHelp') : t('modelPickBrandFirst')}
        {...(modelError ? { error: modelError } : {})}
        disabled={disabled || !brand || createModel.isPending}
        onSearch={setModelSearch}
        searchPlaceholder={t('modelPlaceholder')}
        {...(isLoading ? {} : { emptyText: t('modelEmpty') })}
        allowClear
      />
      <SelectControl
        label={tCatalog('variant')}
        value={variantId ?? null}
        options={variantOptions}
        onChange={onVariantChange}
        placeholder={variantLabel ? variantLabel : tCatalog('variantPlaceholder')}
        hint={modelId ? tCatalog('variantHelp') : tCatalog('variantPickModelFirst')}
        disabled={disabled || !modelId}
        onSearch={setVariantSearch}
        searchPlaceholder={tCatalog('variantPlaceholder')}
        {...(variantsLoading ? {} : { emptyText: tCatalog('variantEmpty') })}
        allowClear
      />
      {variantLabel ? (
        <XStack ai="center" gap={space.xs} flexWrap="wrap">
          <Text col={colors.textMuted} fos={fieldFontSize.message}>
            {tCatalog('newVariant', { name: variantLabel })}
          </Text>
          <Text
            col={colors.primaryActive}
            fos={fieldFontSize.message}
            fow={fontWeight.semibold}
            accessibilityRole="button"
            onPress={() => setValue('catalogVariantLabel', null, { shouldDirty: true })}
          >
            {tCatalog('undoNewVariant')}
          </Text>
        </XStack>
      ) : null}
      <Text
        col={colors.primaryActive}
        fos={fieldFontSize.message}
        fow={fontWeight.semibold}
        accessibilityRole="button"
        onPress={disabled ? undefined : onBackToList}
      >
        {tCatalog('backToList')}
      </Text>
    </YStack>
  );
}

/**
 * Chọn MẪU XE ⇒ điền sẵn số chỗ, nguồn năng lượng, hộp số, phân khúc theo danh mục
 * (`catalogSpecRule`) - bản native của `usePrefillFromModel` web. Chỉ chạy khi người dùng ĐỔI sang
 * một mẫu khác mẫu đã lưu, và đợi tới khi mẫu đó tải xong.
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
