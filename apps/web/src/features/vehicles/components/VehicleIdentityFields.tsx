'use client';

import {
  CATALOG_REVIEW_STATUS,
  CATALOG_TYPE,
  VEHICLE_DATA_SPEC_FIELDS,
  VEHICLE_TYPE,
  normalizeCatalogSearch,
  variantCoversYear,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { App, Button, Col, Form, Row, Select } from 'antd';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useController,
  useFormState,
  useWatch,
  type Control,
  type UseFormSetValue,
} from 'react-hook-form';

import { SelectField } from '@/components/form/SelectField';
import { useCatalogItems, useCatalogOptions } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import {
  useBrandVehicleDataOptions,
  useCreateOwnerModel,
  useVehicleDataOptions,
} from '@/features/vehicle-data/hooks';
import type { VehicleDataOption } from '@/features/vehicle-data/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useCatalogModelSpec, valueForSpecRule } from '../hooks/use-catalog-model-spec';
import { matchesVehicleDataSpec, useSelectedVehicleData } from '../hooks/use-catalog-spec-lock';
import suggestionStyles from './CatalogSuggestions.module.css';

interface VehicleIdentityFieldsProps {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Lý do ô bị khoá (xe đã lên chợ) — nơi gọi truyền chữ, component không tự đoán. */
  lockedNotice?: ReactNode;
  disabled?: boolean;
  /**
   * Dọn mẫu xe khi đổi loại xe hoặc đổi hãng. Không có nó thì một chiếc xe máy vẫn giữ
   * `vehicleCatalogModelId` của chiếc Vios vừa chọn nhầm, và server mới là nơi phát hiện ra.
   */
  setValue?: UseFormSetValue<VehicleFormValues>;
  /** Hiện dấu * ở hãng + mẫu xe — wizard thêm xe bắt buộc đủ điều kiện lên chợ. */
  required?: boolean;
}

/** Giá trị nội bộ của ô "Mẫu xe" gộp — không bao giờ ghi xuống form. */
const MANUAL_VALUE = '__manual__';
const variantValue = (id: string) => `v:${id}`;
const modelValue = (id: string) => `m:${id}`;
/** Các ô thông số xe chuẩn điền được — mảng thường cho `useWatch` (hằng gốc là `readonly`). */
const SPEC_FIELD_NAMES = [...VEHICLE_DATA_SPEC_FIELDS];

/**
 * Hãng xe → MẪU XE (ADR 0102).
 *
 * Ô "Mẫu xe" là MỘT ô tìm kiếm gộp dòng xe + phiên bản + đời từ dữ liệu xe chuẩn (ADR 0090):
 * "Vios 1.5G CVT · 2018 - 2022". Chọn một xe chuẩn là xong phần nhận dạng — mọi thông số có trong
 * dữ liệu được ĐIỀN NGAY và khoá lại (bút cạnh nhãn để sửa ô sai), tên xe do server ghép. Dòng xe
 * chưa có xe chuẩn nào hiện riêng tên dòng (chỉ điền theo dòng, `catalogSpecRule`). Mục cuối "Nhập
 * tay" mở cặp ô cũ Dòng xe → Phiên bản, gõ thêm được dòng/phiên bản mới (chờ duyệt, ADR 0090).
 *
 * Bốn màn dùng chung đúng component này (wizard đăng nhanh, thêm xe ở `/manage`, sửa xe, Owner
 * Lite), nên ba luật sống ở đây một lần:
 *
 *  1. Danh sách hãng lọc theo LOẠI XE.
 *  2. Ô mẫu xe khoá tới khi chọn hãng, chia nhóm "đang phân phối" / "mẫu xe đời trước".
 *  3. Đổi loại xe hoặc đổi hãng thì mẫu đang chọn bị xoá; đổi dòng thì phiên bản bị xoá — dọn trong
 *     trình xử lý của chính cú đổi, không trong effect nhìn giá trị.
 *
 * Giá trị lưu xuống là `vehicleCatalogModelId` (+ `vehicleCatalogVariantId`); `brand`/`model` do
 * BACKEND chép từ danh mục (xem `VehiclesService.applyCatalogModel`).
 */
export function VehicleIdentityFields({
  control,
  vehicleType,
  lockedNotice,
  disabled,
  setValue,
  required = false,
}: VehicleIdentityFieldsProps) {
  const t = useTranslations('Vehicles.form.specs');
  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const variantLabel = useWatch({ control, name: 'catalogVariantLabel' });
  // Xe đang mang một phiên bản GÕ TAY thì ô gộp không có dòng nào để hiện nó — mở sẵn chế độ nhập tay.
  const [manual, setManual] = useState(() => Boolean(variantLabel));
  const brandOptions = useBrandOptions(vehicleType, brand);
  // Gõ thêm / nhập tay chỉ mở ở form có `setValue` (đăng/sửa xe của chủ xe) — không ở màn chỉ đọc.
  const editable = Boolean(setValue) && !disabled;

  /*
   * Đổi hãng (hoặc đổi loại xe) → mẫu cũ chắc chắn sai, bỏ ngay cùng phiên bản.
   *
   * So với giá trị TRƯỚC ĐÓ chứ không chạy vô điều kiện: một effect xoá mỗi lần render sẽ thổi
   * bay lựa chọn hợp lệ ngay khi form sửa vừa nạp dữ liệu xe.
   */
  const previous = useRef<{ brand?: string | null; vehicleType: string }>({
    brand,
    vehicleType,
  });
  // Xe chuẩn đang chọn + thông số hiện tại: đổi hãng thì query của hãng MỚI chưa có xe chuẩn cũ,
  // nên giữ lại bản cuối cùng thấy được để gỡ đúng các ô nó đã tự điền.
  const selected = useSelectedVehicleData(control, vehicleType);
  const lastSelected = useRef(selected);
  const specValues = useWatch({ control, name: SPEC_FIELD_NAMES });
  useEffect(() => {
    const changed =
      previous.current.brand !== brand || previous.current.vehicleType !== vehicleType;
    previous.current = { brand, vehicleType };
    if (!changed || !setValue) return;
    if (lastSelected.current) {
      clearPreviousVehicleDataSpecs(lastSelected.current, specValues, setValue);
      lastSelected.current = null;
    }
    clearModel(setValue);
    // `specValues` chỉ được ĐỌC lúc hãng/loại xe đổi — thêm vào deps là xoá lại mỗi lần gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, vehicleType, setValue]);
  // Đặt SAU effect trên: lượt render đổi hãng còn giữ bản xe chuẩn cũ cho effect kia đọc.
  useEffect(() => {
    if (selected) lastSelected.current = selected;
  }, [selected]);

  usePrefillFromModel(control, vehicleType, modelId, setValue);

  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="brand"
          label={t('brand')}
          required={required}
          options={brandOptions}
          placeholder={t('brandPlaceholder')}
          help={lockedNotice}
          disabled={disabled}
          allowClear
          showSearch
        />
      </Col>
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
        <Col xs={24} sm={12}>
          <ModelVariantSelect
            control={control}
            vehicleType={vehicleType}
            required={required}
            disabled={disabled}
            lockedNotice={lockedNotice}
            setValue={setValue}
            onManual={editable ? () => setManual(true) : undefined}
          />
        </Col>
      )}
    </Row>
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
 * Chép thông số của xe chuẩn vào form (ADR 0102 — tự điền ngay khi chọn, ghi đè ô cũ vì chủ xe vừa
 * nói "xe tôi là bản này"). Ô xe chuẩn chưa khai thì giữ nguyên; tiện ích được CỘNG thêm, không thay.
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
 * Đổi mẫu xe ⇒ gỡ thông số mà xe chuẩn CŨ đã tự điền và chủ xe chưa sửa (ô còn đúng giá trị của
 * nó). Không gỡ thì chọn VF 5 Plus rồi đổi sang một dòng chưa có xe chuẩn (Nerio Green) sẽ để lại
 * kiểu dáng + quãng đường + pin của VF 5 Plus, trông như dữ liệu của Nerio Green. Ô chủ xe đã tự sửa
 * thì giữ nguyên.
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

/** Ô "Mẫu xe" gộp dòng + phiên bản + đời của một hãng — xem `VehicleIdentityFields`. */
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
  disabled?: boolean;
  lockedNotice?: ReactNode;
  setValue?: UseFormSetValue<VehicleFormValues>;
  /** Có ⇒ cuối danh sách có mục "Nhập tay". */
  onManual?: () => void;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const yearsOf = useVariantYears();
  const selectId = `vehicle-model-variant-${useId()}`;
  const helpId = `${selectId}-help`;

  const brand = useWatch({ control, name: 'brand' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const features = useWatch({ control, name: 'features' });
  const specValues = useWatch({ control, name: SPEC_FIELD_NAMES });
  // Lỗi "bắt buộc" của dòng xe hiện ngay dưới ô gộp — đây là ô duy nhất ghi ra nó.
  const { field, fieldState } = useController({ control, name: 'vehicleCatalogModelId' });
  const modelId = field.value;

  const { models, isLoading } = useCatalogModels({
    vehicleType,
    brandKey: brand,
    includeId: modelId,
  });
  const groups = useCatalogModelGroups(models);
  const { options: variants, isLoading: variantsLoading } = useBrandVehicleDataOptions({
    vehicleType,
    brandKey: brand,
    includeId: variantId,
  });

  const options = useMemo(() => {
    const mark = (label: string, pending: boolean) =>
      pending ? tCatalog('newOption', { label }) : label;
    // Nhãn gọn như hãng gọi xe ("VF 5 Plus"); ĐỜI chỉ thêm khi cùng một phiên bản có nhiều đời
    // (Vios 1.5G CVT 2018 - 2022 và 2023 - nay) — lúc đó nó là thứ duy nhất phân biệt hai dòng.
    const sameName = new Map<string, number>();
    for (const v of variants) {
      const key = `${v.modelId}|${normalizeCatalogSearch(v.label)}`;
      sameName.set(key, (sameName.get(key) ?? 0) + 1);
    }
    const grouped = groups
      .map((group) => ({
        label: domainLabel('catalogMarketStatus', group.marketStatus),
        options: group.options.flatMap((o) => {
          const model = models.find((m) => m.id === o.value);
          if (!model) return [];
          const modelPending = model.reviewStatus === CATALOG_REVIEW_STATUS.PENDING;
          const rows = variants
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
              };
            });
          // Dòng chưa có xe chuẩn nào ⇒ chọn theo dòng. Xe đang gắn dòng mà không gắn phiên bản thì
          // vẫn phải thấy đúng thứ nó đang mang.
          if (rows.length === 0 || (model.id === modelId && !variantId)) {
            rows.unshift({ value: modelValue(model.id), label: mark(model.label, modelPending) });
          }
          return rows;
        }),
      }))
      .filter((group) => group.options.length > 0);
    return onManual
      ? [...grouped, { value: MANUAL_VALUE, label: tCatalog('manualEntry') }]
      : grouped;
  }, [groups, models, variants, modelId, variantId, onManual, domainLabel, tCatalog, yearsOf]);

  const record = (variantId && variants.find((v) => v.id === variantId)) || null;
  const yearOutside =
    record && year != null && !variantCoversYear(record, year) ? yearsOf(record) : null;

  function handleChange(value: string | undefined) {
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
    message.success(tCatalog('applied'));
  }

  const error = fieldState.error?.message;
  const help =
    error ??
    lockedNotice ??
    (yearOutside
      ? tCatalog('yearOutsideVariant', { year: year ?? '', years: yearOutside })
      : brand
        ? tCatalog('modelVariantHelp')
        : t('modelPickBrandFirst'));

  return (
    <Form.Item
      label={tCatalog('modelVariant')}
      htmlFor={selectId}
      required={required}
      validateStatus={error ? 'error' : yearOutside ? 'warning' : ''}
      help={<span id={helpId}>{help}</span>}
    >
      <Select
        id={selectId}
        aria-describedby={helpId}
        value={variantId ? variantValue(variantId) : modelId ? modelValue(modelId) : undefined}
        onChange={handleChange}
        onBlur={field.onBlur}
        options={options}
        placeholder={tCatalog('modelVariantPlaceholder')}
        // Khoá tới khi có hãng: danh sách mẫu xe không kèm hãng là vài trăm dòng vô nghĩa.
        disabled={disabled || !brand}
        loading={isLoading || variantsLoading}
        notFoundContent={isLoading || variantsLoading ? null : t('modelEmpty')}
        status={error ? 'error' : yearOutside ? 'warning' : undefined}
        allowClear
        showSearch
        // Tìm không dấu ("vios 1.5g"); mục "Nhập tay" luôn còn ở cuối dù gõ gì.
        filterOption={(input, option) => {
          const row = option as { value?: string; label?: string } | undefined;
          return (
            row?.value === MANUAL_VALUE ||
            normalizeCatalogSearch(String(row?.label ?? '')).includes(normalizeCatalogSearch(input))
          );
        }}
      />
    </Form.Item>
  );
}

/**
 * "Nhập tay": cặp ô Dòng xe → Phiên bản như trước ADR 0102 — chọn dòng có sẵn hoặc gõ dòng mới
 * (tạo ngay, chờ duyệt), chọn hoặc gõ phiên bản (server ghi nhận vào Dữ liệu xe để admin duyệt).
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
  disabled?: boolean;
  setValue: UseFormSetValue<VehicleFormValues>;
  onBackToList: () => void;
}) {
  const t = useTranslations('Vehicles.form.specs');
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const yearsOf = useVariantYears();
  const createModel = useCreateOwnerModel();

  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const variantLabel = useWatch({ control, name: 'catalogVariantLabel' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const features = useWatch({ control, name: 'features' });
  const canCreate = !disabled;

  const { models, isLoading } = useCatalogModels({
    vehicleType,
    brandKey: brand,
    includeId: modelId,
  });
  const groups = useCatalogModelGroups(models);
  const optionGroups = useMemo(
    () =>
      groups.map((group) => ({
        label: domainLabel('catalogMarketStatus', group.marketStatus),
        options: group.options.map((o) => {
          const model = models.find((m) => m.id === o.value);
          return model?.reviewStatus === CATALOG_REVIEW_STATUS.PENDING
            ? { ...o, label: tCatalog('newOption', { label: o.label }) }
            : o;
        }),
      })),
    [groups, models, domainLabel, tCatalog],
  );

  // Phiên bản của dòng đã chọn, ưu tiên đúng đời; cái đang gắn luôn có mặt (`includeId`).
  const { options: variants, isLoading: variantsLoading } = useVehicleDataOptions({
    modelId,
    year,
    includeId: variantId,
  });
  const variantOptions = useMemo(
    () =>
      variants.map((v) => {
        const base = [v.label || tCatalog('variantAny'), yearsOf(v)].filter(Boolean).join(' · ');
        return {
          value: v.id,
          label:
            v.reviewStatus === CATALOG_REVIEW_STATUS.PENDING
              ? tCatalog('newOption', { label: base })
              : base,
        };
      }),
    [variants, tCatalog, yearsOf],
  );

  /** Dòng xe chưa có: tạo ngay (chờ duyệt) rồi chọn nó cho xe này. */
  function createModelFrom(label: string) {
    if (!brand || createModel.isPending) return;
    createModel.mutate(
      { vehicleType, brandKey: brand, label },
      {
        onSuccess: (model) => {
          setValue('vehicleCatalogModelId', model.id, { shouldDirty: true, shouldValidate: true });
          setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
          setValue('catalogVariantLabel', null, { shouldDirty: true });
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="vehicleCatalogModelId"
          label={t('model')}
          required={required}
          options={[]}
          optionGroups={optionGroups}
          placeholder={t('modelPlaceholder')}
          help={brand ? t('modelHelp') : t('modelPickBrandFirst')}
          disabled={disabled || !brand}
          loading={isLoading || createModel.isPending}
          notFoundContent={isLoading ? null : t('modelEmpty')}
          allowClear
          showSearch
          // Đổi dòng ⇒ phiên bản cũ (chọn hay gõ) thuộc dòng cũ, bỏ ngay.
          onAfterChange={() => {
            setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
            setValue('catalogVariantLabel', null, { shouldDirty: true });
          }}
          creatable={
            canCreate && brand
              ? {
                  optionLabel: (text) => tCatalog('addModel', { text }),
                  onCreate: createModelFrom,
                }
              : undefined
          }
        />
      </Col>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="vehicleCatalogVariantId"
          label={tCatalog('variant')}
          options={variantOptions}
          placeholder={variantLabel ? variantLabel : tCatalog('variantPlaceholder')}
          help={modelId ? tCatalog('variantHelp') : tCatalog('variantPickModelFirst')}
          disabled={disabled || !modelId}
          loading={variantsLoading}
          notFoundContent={variantsLoading ? null : tCatalog('variantEmpty')}
          allowClear
          showSearch
          // Chọn một phiên bản có sẵn ⇒ bỏ tên đã gõ, điền thông số như ô gộp.
          onAfterChange={(value) => {
            setValue('catalogVariantLabel', null, { shouldDirty: true });
            const picked = variants.find((v) => v.id === value);
            if (picked) applyVehicleDataSpecs(picked, vehicleType, features, setValue);
          }}
          creatable={
            canCreate && modelId
              ? {
                  optionLabel: (text) => tCatalog('addVariant', { text }),
                  onCreate: (text) => {
                    setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
                    setValue('catalogVariantLabel', text, { shouldDirty: true });
                  },
                }
              : undefined
          }
        />
        {variantLabel ? (
          <p className={suggestionStyles.note}>
            {tCatalog('newVariant', { name: variantLabel })}{' '}
            <Button
              type="link"
              size="small"
              className={suggestionStyles.link}
              onClick={() => setValue('catalogVariantLabel', null, { shouldDirty: true })}
            >
              {tCatalog('undoNewVariant')}
            </Button>
          </p>
        ) : null}
      </Col>
      <Col xs={24}>
        <Button
          type="link"
          size="small"
          className={suggestionStyles.link}
          onClick={onBackToList}
          disabled={disabled}
        >
          {tCatalog('backToList')}
        </Button>
      </Col>
    </>
  );
}

function useBrandOptions(vehicleType: string, current: string | null | undefined) {
  const { items } = useCatalogItems(CATALOG_TYPE.VEHICLE_BRAND);
  const fallback = useCatalogOptions(CATALOG_TYPE.VEHICLE_BRAND, current);

  return useMemo(() => {
    const options = items
      // Mảng rỗng = hãng chưa gắn nhãn loại xe ⇒ hiện cho mọi loại. Bỏ vế này thì một hãng admin
      // vừa thêm biến mất khỏi cả hai form mà không ai hiểu vì sao.
      .filter(
        (item) =>
          item.vehicleTypes.length === 0 ||
          (item.vehicleTypes as readonly string[]).includes(vehicleType),
      )
      .map((item) => ({ value: item.key, label: item.label }));

    if (current && !options.some((o) => o.value === current)) {
      // Xe đang lưu một hãng không còn hợp lệ cho loại xe này (dữ liệu cũ, hoặc admin vừa sửa
      // chiều áp dụng): vẫn hiện đúng cái đang có, nhãn lấy từ danh sách đầy đủ.
      options.push(fallback.find((o) => o.value === current) ?? { value: current, label: current });
    }
    return options;
  }, [items, fallback, vehicleType, current]);
}

/**
 * Chọn MẪU XE ⇒ điền sẵn số chỗ, nguồn năng lượng, phân khúc theo danh mục (`catalogSpecRule`).
 *
 * Chỉ chạy khi người dùng ĐỔI mẫu, không chạy lúc form sửa vừa nạp xe: ghi đè dữ liệu chủ xe đã
 * lưu chỉ vì mở trang là âm thầm sửa xe của họ. Dữ liệu mẫu đến sau giá trị ô chọn (đổi mẫu là
 * đổi `includeId` ⇒ một lượt tải mới), nên lượt điền chờ tới khi đúng mẫu đó có trong tay.
 *
 * Hộp số điền theo nguồn năng lượng vừa đặt (`transmissionFor`); `VehicleEnergyFields` vẫn là nơi
 * khoá ô và tự sửa hộp số khi chủ xe đổi nguồn năng lượng sau đó.
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
  // Mẫu ĐÃ LƯU của xe: quay về nó (bấm Huỷ ⇒ `reset`) không phải một lượt chọn mẫu mới, và điền lại
  // lúc đó sẽ ghi đè dữ liệu cũ rồi để form ở trạng thái "đã sửa" sau một cú Huỷ.
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
    if (fuel !== (fuelType ?? null))
      setValue('fuelType', fuel as VehicleFormValues['fuelType'], opts);
    // Hộp số theo ĐÚNG nguồn năng lượng vừa đặt (Camry hybrid ⇒ e-CVT). Trống nguồn năng lượng thì
    // luật là `free` và hộp số giữ nguyên; `VehicleEnergyFields` vẫn tự lo phần xe điện.
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
