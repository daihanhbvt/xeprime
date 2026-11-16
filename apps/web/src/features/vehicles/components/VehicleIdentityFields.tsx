'use client';

import { CATALOG_REVIEW_STATUS, CATALOG_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { App, Button, Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { SelectField } from '@/components/form/SelectField';
import { useCatalogItems, useCatalogOptions } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useCreateOwnerModel, useVehicleDataOptions } from '@/features/vehicle-data/hooks';
import type { VehicleDataOption } from '@/features/vehicle-data/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useCatalogModelSpec, valueForSpecRule } from '../hooks/use-catalog-model-spec';
import { CatalogSpecSuggestionCard, useVehicleCatalogSuggestion } from './CatalogSuggestions';
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
  /** Hiện dấu * ở hãng + dòng xe — wizard thêm xe nhanh bắt buộc đủ điều kiện lên chợ. */
  required?: boolean;
}

/**
 * Cặp chọn PHỤ THUỘC: Hãng xe → Dòng xe → Phiên bản.
 *
 * Ba luật mà cả bốn màn (wizard đăng nhanh, tạo xe ở `/manage`, sửa xe, Owner Lite) phải giống
 * nhau tuyệt đối, nên chúng sống ở đúng một component:
 *
 *  1. Danh sách hãng lọc theo LOẠI XE — người đăng xe máy không thấy Toyota, người đăng ô tô
 *     không thấy Piaggio.
 *  2. Ô "Dòng xe" khoá cho tới khi chọn hãng, có ô tìm kiếm, và chia hai nhóm "đang phân phối" /
 *     "mẫu xe đời trước" — phần lớn xe cho thuê ở Việt Nam là xe đời trước, gộp phẳng thì xe
 *     đang bán chìm nghỉm.
 *  3. Đổi loại xe hoặc đổi hãng thì dòng đang chọn bị xoá; đổi dòng thì phiên bản bị xoá.
 *
 * Không thấy dòng xe / phiên bản: chủ xe GÕ ngay trong ô (dòng "Thêm …"), không qua hộp thoại nào.
 * Dòng xe gõ mới được tạo ngay (chờ duyệt); phiên bản gõ mới đi kèm lượt lưu xe — server tự ghi
 * nhận dữ liệu từ chính chiếc xe này vào màn Dữ liệu xe để admin duyệt (ADR 0090).
 *
 * Giá trị lưu xuống là `vehicleCatalogModelId`; `brand`/`model` do BACKEND chép từ danh mục —
 * client không tự đặt cặp chữ đó nữa (xem `VehiclesService.applyCatalogModel`).
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
  const tCatalog = useTranslations('Vehicles.form.catalog');
  const domainLabel = useDomainLabel();

  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const variantId = useWatch({ control, name: 'vehicleCatalogVariantId' });
  const variantLabel = useWatch({ control, name: 'catalogVariantLabel' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const features = useWatch({ control, name: 'features' });
  const createModel = useCreateOwnerModel();

  const brandOptions = useBrandOptions(vehicleType, brand);
  const { models, isLoading } = useCatalogModels({
    vehicleType,
    brandKey: brand,
    includeId: modelId,
  });
  const groups = useCatalogModelGroups(models);
  const selectedModel = models.find((m) => m.id === modelId) ?? null;

  // Phiên bản (xe chuẩn): lọc theo năm sản xuất; cái đang gắn luôn có mặt (`includeId`).
  const { options: variants, isLoading: variantsLoading } = useVehicleDataOptions({
    modelId,
    year,
    includeId: variantId,
  });
  const variantOptions = useMemo(
    () =>
      variants.map((v) => {
        const years =
          v.yearFrom != null && v.yearTo != null && v.yearFrom !== v.yearTo
            ? tCatalog('years', { from: v.yearFrom, to: v.yearTo })
            : v.yearFrom != null && v.yearTo == null
              ? tCatalog('yearsOpen', { from: v.yearFrom })
              : v.yearTo != null && v.yearFrom == null
                ? tCatalog('yearsUntil', { to: v.yearTo })
                : v.yearFrom != null
                  ? String(v.yearFrom)
                  : null;
        const base = [v.label || tCatalog('variantAny'), years].filter(Boolean).join(' · ');
        return {
          value: v.id,
          label:
            v.reviewStatus === CATALOG_REVIEW_STATUS.PENDING
              ? tCatalog('newOption', { label: base })
              : base,
        };
      }),
    [variants, tCatalog],
  );
  const suggestion = useVehicleCatalogSuggestion({ modelId, variantId, year });
  // Gõ thêm chỉ mở ở form có `setValue` (đăng/sửa xe của chủ xe) — không ở màn chỉ đọc.
  const canCreate = Boolean(setValue) && !disabled;

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

  /*
   * Đổi hãng (hoặc đổi loại xe) → mẫu cũ chắc chắn sai, bỏ ngay.
   *
   * So với giá trị TRƯỚC ĐÓ chứ không chạy vô điều kiện: một effect xoá mỗi lần render sẽ thổi
   * bay lựa chọn hợp lệ ngay khi form sửa vừa nạp dữ liệu xe.
   */
  const previous = useRef<{ brand?: string | null; vehicleType: string }>({
    brand,
    vehicleType,
  });
  useEffect(() => {
    const changed =
      previous.current.brand !== brand || previous.current.vehicleType !== vehicleType;
    previous.current = { brand, vehicleType };
    if (changed && setValue) setValue('vehicleCatalogModelId', null, { shouldDirty: true });
  }, [brand, vehicleType, setValue]);

  // Đổi dòng xe ⇒ phiên bản cũ (chọn hay gõ) thuộc dòng cũ, bỏ ngay.
  const previousModel = useRef(modelId);
  useEffect(() => {
    const changed = previousModel.current !== modelId;
    previousModel.current = modelId;
    if (changed && setValue) {
      setValue('vehicleCatalogVariantId', null, { shouldDirty: true });
      setValue('catalogVariantLabel', null, { shouldDirty: true });
    }
  }, [modelId, setValue]);

  /** "Áp dụng thông số": chép một lần các giá trị của xe chuẩn; tiện ích được CỘNG thêm. */
  function applyRecord(v: VehicleDataOption) {
    if (!setValue) return;
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    const isCar = vehicleType === VEHICLE_TYPE.CAR;
    if (isCar && v.seatCount != null) setValue('seatCount', v.seatCount, opts);
    if (v.fuelType) setValue('fuelType', v.fuelType as VehicleFormValues['fuelType'], opts);
    if (v.transmission) {
      setValue('transmission', v.transmission as VehicleFormValues['transmission'], opts);
    }
    if (isCar && v.bodyType)
      setValue('bodyType', v.bodyType as VehicleFormValues['bodyType'], opts);
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
      const value = v[key];
      if (value != null) setValue(key, value, opts);
    }
    if (v.fuelConsumptionCombined) {
      setValue('fuelConsumptionCombined', Number(v.fuelConsumptionCombined), opts);
    }
    if (v.batteryCapacityKwh) setValue('batteryCapacityKwh', Number(v.batteryCapacityKwh), opts);
    if (v.featureKeys.length > 0) {
      const merged = [...new Set([...(features ?? []), ...v.featureKeys])];
      setValue('features', merged as VehicleFormValues['features'], opts);
    }
    message.success(tCatalog('applied'));
  }

  /** Dòng xe chưa có: tạo ngay (chờ duyệt) rồi chọn nó cho xe này. */
  function createModelFrom(label: string) {
    if (!brand || !setValue || createModel.isPending) return;
    createModel.mutate(
      { vehicleType, brandKey: brand, label },
      {
        onSuccess: (model) =>
          setValue('vehicleCatalogModelId', model.id, { shouldDirty: true, shouldValidate: true }),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  usePrefillFromModel(control, vehicleType, modelId, setValue);

  const recordName = suggestion?.record
    ? [selectedModel?.label, suggestion.record.label].filter(Boolean).join(' ')
    : '';

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
          // Khoá tới khi có hãng: danh sách mẫu xe không kèm hãng là vài trăm dòng vô nghĩa.
          disabled={disabled || !brand}
          loading={isLoading || createModel.isPending}
          notFoundContent={isLoading ? null : t('modelEmpty')}
          allowClear
          showSearch
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
          // Chọn một phiên bản có sẵn ⇒ bỏ tên đã gõ.
          onAfterChange={() => setValue?.('catalogVariantLabel', null, { shouldDirty: true })}
          creatable={
            canCreate && modelId
              ? {
                  optionLabel: (text) => tCatalog('addVariant', { text }),
                  onCreate: (text) => {
                    setValue?.('vehicleCatalogVariantId', null, { shouldDirty: true });
                    setValue?.('catalogVariantLabel', text, { shouldDirty: true });
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
              onClick={() => setValue?.('catalogVariantLabel', null, { shouldDirty: true })}
            >
              {tCatalog('undoNewVariant')}
            </Button>
          </p>
        ) : null}
      </Col>
      {setValue && suggestion?.record ? (
        <Col xs={24}>
          <CatalogSpecSuggestionCard
            record={suggestion.record}
            name={recordName}
            vehicleType={vehicleType}
            onApply={applyRecord}
          />
        </Col>
      ) : null}
    </Row>
  );
}

/** Danh sách hãng đã lọc theo loại xe, giữ lại giá trị đang lưu nếu nó không còn hợp lệ. */
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
