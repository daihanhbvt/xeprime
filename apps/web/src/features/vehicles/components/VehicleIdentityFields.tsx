'use client';

import { CATALOG_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { SelectField } from '@/components/form/SelectField';
import { useCatalogItems, useCatalogOptions } from '@/features/catalog/use-catalog';
import { useCatalogModelGroups, useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useDomainLabel } from '@/i18n/use-domain-label';

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

  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="brand"
          label={t('brand')}
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
