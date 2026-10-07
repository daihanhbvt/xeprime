'use client';

import { CATALOG_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFormState, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { SelectField } from '@/components/form/SelectField';
import { useCatalogItems, useCatalogOptions } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { useCatalogModelSpec, valueForSpecRule } from '../hooks/use-catalog-model-spec';

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
 * Cặp chọn PHỤ THUỘC: Hãng xe → Mẫu xe.
 *
 * Ba luật mà cả bốn màn (wizard đăng nhanh, tạo xe ở `/manage`, sửa xe, Owner Lite) phải giống
 * nhau tuyệt đối, nên chúng sống ở đúng một component:
 *
 *  1. Danh sách hãng lọc theo LOẠI XE — người đăng xe máy không thấy Toyota, người đăng ô tô
 *     không thấy Piaggio.
 *  2. Ô "Mẫu xe" khoá cho tới khi chọn hãng, có ô tìm kiếm, và chia hai nhóm "đang phân phối" /
 *     "mẫu xe đời trước" — phần lớn xe cho thuê ở Việt Nam là xe đời trước, gộp phẳng thì xe
 *     đang bán chìm nghỉm.
 *  3. Đổi loại xe hoặc đổi hãng thì mẫu đang chọn bị xoá.
 *
 * Giá trị lưu xuống là `vehicleCatalogModelId`; `brand`/`model` do BACKEND chép từ danh mục —
 * client không tự đặt cặp chữ đó nữa (xem `VehiclesService.applyCatalogModel`). Đó là lý do
 * không còn đường nào lưu được một chiếc xe máy hiệu Toyota tên Vios.
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
  const domainLabel = useDomainLabel();

  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });

  const brandOptions = useBrandOptions(vehicleType, brand);
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
        options: group.options,
      })),
    [groups, domainLabel],
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
          loading={isLoading}
          notFoundContent={isLoading ? null : t('modelEmpty')}
          allowClear
          showSearch
        />
      </Col>
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
    if (fuel !== (fuelType ?? null)) setValue('fuelType', fuel as VehicleFormValues['fuelType'], opts);
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
