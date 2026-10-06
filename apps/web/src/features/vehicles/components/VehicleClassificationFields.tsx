'use client';

import { MOTORBIKE_CATEGORY_VALUES, vehicleFieldPolicy } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { Col, Form, Radio, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useController, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { useCatalogModelSpec } from '../hooks/use-catalog-model-spec';

interface VehicleClassificationFieldsProps {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  /** Ô kiểu dáng ô tô dùng thẻ có ảnh, nên nơi gọi tự dựng và truyền vào đây. */
  bodyTypePicker?: ReactNode;
  /** Hiện dấu * ở số chỗ (khi loại xe cần) — wizard thêm xe nhanh bắt buộc đủ điều kiện lên chợ. */
  required?: boolean;
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
  required = false,
}: VehicleClassificationFieldsProps) {
  const t = useTranslations('Vehicles.form.specs');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fuelType = useWatch({ control, name: 'fuelType' });
  const policy = vehicleFieldPolicy(vehicleType, fuelType);
  const spec = useCatalogModelSpec(control, vehicleType);
  const seatRequired = required && policy.seatCount === 'required';
  const seatCount = useWatch({ control, name: 'seatCount' });
  // Khoá CHỈ khi giá trị đã khớp mẫu: xe cũ lưu lệch (VF 5 mà ghi 4 chỗ) vẫn phải sửa lại được.
  const seatLocked =
    Boolean(spec.model) && spec.seats.kind === 'fixed' && seatCount === spec.seats.value;

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
          {/*
            Số chỗ theo MẪU XE đang chọn (`catalogSpecRule`): một cấu hình ⇒ điền sẵn và khoá;
            nhiều cấu hình ⇒ chỉ chọn trong đó; mẫu chưa khai ⇒ nhập tự do như trước.
          */}
          {spec.model && spec.seats.kind === 'choice' ? (
            <SeatChoiceField
              control={control}
              label={t('seatCount')}
              required={seatRequired}
              values={spec.seats.values}
              disabled={disabled}
              help={t('specChoiceFromModel', {
                model: spec.model.label,
                values: spec.seats.values.map((count) => tCommon('units.seat', { count })).join(', '),
              })}
            />
          ) : (
            <NumberField
              control={control}
              name="seatCount"
              label={t('seatCount')}
              required={seatRequired}
              placeholder={t('seatPlaceholder')}
              min={1}
              max={64}
              disabled={disabled || seatLocked}
              help={
                seatLocked && spec.model
                  ? t('specFromModel', { model: spec.model.label })
                  : undefined
              }
            />
          )}
        </Col>
      ) : null}

      {policy.motorbikeCategory !== 'hidden' ? (
        <Col xs={24} sm={12}>
          <SelectField
            control={control}
            name="motorbikeCategory"
            label={t('motorbikeCategory')}
            required={required && policy.motorbikeCategory === 'required'}
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

/**
 * Số chỗ khi mẫu xe có NHIỀU cấu hình (VF 9: 6 hoặc 7 chỗ) — nút chọn thay cho ô nhập số, để chủ
 * xe không gõ được một con số mà dòng xe đó không có. Giá trị lưu vẫn là SỐ như ô nhập thường.
 */
function SeatChoiceField({
  control,
  label,
  values,
  required,
  disabled,
  help,
}: {
  control: Control<VehicleFormValues>;
  label: string;
  values: readonly number[];
  required?: boolean;
  disabled?: boolean;
  help?: ReactNode;
}) {
  const tCommon = useTranslations('Common');
  const { field, fieldState } = useController({ control, name: 'seatCount' });
  const helpText = fieldState.error?.message ?? help;
  // Giá trị ĐANG LƯU nằm ngoài các bản của mẫu (VF 9 ghi 4 chỗ) vẫn hiện thành một nút đã chọn —
  // ô chọn không được giấu đúng con số nó sắp gửi đi (cùng luật với `FuelTypeSelect`).
  const current = typeof field.value === 'number' ? field.value : null;
  const shown = current != null && !values.includes(current) ? [...values, current] : values;

  return (
    <Form.Item
      label={label}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText}
    >
      <Radio.Group
        optionType="button"
        value={field.value ?? undefined}
        onChange={(e) => field.onChange(e.target.value as number)}
        disabled={disabled}
        aria-label={label}
        options={shown.map((count) => ({ value: count, label: tCommon('units.seat', { count }) }))}
      />
    </Form.Item>
  );
}
