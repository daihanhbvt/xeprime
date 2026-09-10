'use client';

import { MOTORBIKE_CATEGORY_VALUES, vehicleFieldPolicy } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { useDomainLabel } from '@/i18n/use-domain-label';

interface VehicleClassificationFieldsProps {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Ô kiểu dáng ô tô dùng thẻ có ảnh, nên nơi gọi tự dựng và truyền vào đây. */
  bodyTypePicker?: ReactNode;
  disabled?: boolean;
  /** Dọn ô không còn nghĩa khi đổi loại xe — form phải hiện đúng thứ sắp được lưu. */
  setValue?: UseFormSetValue<VehicleFormValues>;
}

/**
 * Ô PHÂN LOẠI xe — khác nhau hoàn toàn giữa ô tô và xe máy.
 *
 * Ô tô có số chỗ ngồi và kiểu dáng thân xe (Sedan/SUV/MPV). Xe máy không có cả hai: nó có PHÂN
 * KHÚC (tay ga / xe số / côn tay…). Hai chiều này đối xứng nhau — chúng là thứ khách dùng để lọc
 * ngoài chợ, nên chọn sai đồng nghĩa với "không ai tìm thấy chiếc xe".
 *
 * Ma trận quyết định là `vehicleFieldPolicy` ở `@xeprime/types` — cùng hàm mà Yup, DTO backend và
 * checklist lên chợ dùng. Trước bản này form hỏi chung một bộ, nên xe máy mang theo "5 chỗ" và
 * "Sedan", và bộ lọc ngoài chợ đọc đúng những giá trị đó.
 */
export function VehicleClassificationFields({
  control,
  vehicleType,
  bodyTypePicker,
  disabled,
  setValue,
}: VehicleClassificationFieldsProps) {
  const t = useTranslations('Vehicles.form.specs');
  const domainLabel = useDomainLabel();
  const fuelType = useWatch({ control, name: 'fuelType' });
  const policy = vehicleFieldPolicy(vehicleType, fuelType);

  const categoryOptions = useMemo(
    () =>
      MOTORBIKE_CATEGORY_VALUES.map((value) => ({
        value,
        label: domainLabel('motorbikeCategory', value),
      })),
    [domainLabel],
  );

  /*
   * Đổi ô tô ↔ xe máy thì hai chiều này loại trừ nhau. Xoá tại form để người dùng thấy đúng thứ
   * sắp lưu; server vẫn dọn thêm một lần vì nó không tin client.
   */
  useEffect(() => {
    if (!setValue) return;
    if (policy.seatCount === 'hidden') setValue('seatCount', null);
    if (policy.bodyType === 'hidden') setValue('bodyType', null);
    if (policy.motorbikeCategory === 'hidden') setValue('motorbikeCategory', null);
  }, [policy.seatCount, policy.bodyType, policy.motorbikeCategory, setValue]);

  return (
    <Row gutter={16}>
      {policy.seatCount !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="seatCount"
            label={t('seatCount')}
            placeholder={t('seatPlaceholder')}
            min={1}
            max={64}
            disabled={disabled}
          />
        </Col>
      ) : null}

      {policy.motorbikeCategory !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <SelectField
            control={control}
            name="motorbikeCategory"
            label={t('motorbikeCategory')}
            options={categoryOptions}
            placeholder={t('motorbikeCategoryPlaceholder')}
            help={t('motorbikeCategoryHelp')}
            disabled={disabled}
            allowClear
          />
        </Col>
      ) : null}

      {policy.bodyType !== 'hidden' && bodyTypePicker ? <Col xs={24}>{bodyTypePicker}</Col> : null}
    </Row>
  );
}
