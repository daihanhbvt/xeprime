'use client';

import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleRegistrationReading,
} from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { VehicleClassificationFields } from '@/features/vehicles/components/VehicleClassificationFields';
import { BodyTypePicker } from '@/features/vehicles/components/VehicleFormSections';
import { VehicleEnergyFields } from '@/features/vehicles/components/VehicleEnergyFields';
import { VehicleIdentityFields } from '@/features/vehicles/components/VehicleIdentityFields';
import { RegistrationTextField } from '@/features/vehicles/components/RegistrationTextField';
import {
  useTransmissionOptions,
} from '@/features/vehicles/components/VehicleFormSections';
import { useDomainLabel } from '@/i18n/use-domain-label';

import type { QuickVehicleValues } from '../../schema';

interface Props {
  control: Control<QuickVehicleValues>;
  setValue: UseFormSetValue<QuickVehicleValues>;
  vehicleType: string;
  /** Lượt đọc cà vẹt — biển số + màu khoá theo nó (ADR 0102). */
  registrationReading?: VehicleRegistrationReading | null;
}

/**
 * Bước 1 — thông tin xe.
 *
 * Các khối: loại xe · biển số · thông tin cơ bản · năng lượng. Mô tả và tiện nghi chuyển sang bước 3
 * "Tiện ích & mô tả" (Figma 24352:70390, 17/11/2026). Các ô dùng ĐÚNG những
 * component mà wizard `/manage` và màn sửa xe đang dùng (hãng xe từ catalog, tiện nghi từ
 * catalog, khối năng lượng theo ma trận dùng chung) — không có bộ form thứ hai cho luồng nhanh.
 *
 * Không hỏi tên xe (ADR 0102): server ghép "Hãng Dòng Phiên bản Năm" từ mẫu xe đã chọn, khung xem
 * trước hiện đúng tên đó; chủ xe đổi tên ở màn sửa xe.
 */
export function QuickVehicleInfoStep({
  control,
  setValue,
  vehicleType,
  registrationReading,
}: Props) {
  const t = useTranslations('ListYourVehicle.info');
  const tForm = useTranslations('Vehicles.form');
  const domainLabel = useDomainLabel();

  const fuelType = useWatch({ control, name: 'fuelType' });

  const transmissionOptions = useTransmissionOptions(vehicleType || VEHICLE_TYPE.CAR, fuelType);
  const vehicleTypeOptions = useMemo(
    () =>
      VEHICLE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleType', value),
      })),
    [domainLabel],
  );

  /*
   * MỘT Row phẳng (Figma `24352:79234`: lưới 3 cột liền) - wizard bọc trong `threeColumnFields`
   * để mọi ô rơi vào cùng lưới; thứ tự ô theo Figma: loại xe · biển số · hãng · dòng · năm…
   */
  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        {/* Loại xe: ô chọn như Figma (18/11/2026) - cùng kiểu wizard gian hàng. */}
        <SelectField
          control={control}
          name="vehicleType"
          label={tForm('basic.vehicleType')}
          options={vehicleTypeOptions}
          required
        />
      </Col>
      <Col xs={24} sm={12}>
        {/* Đọc được trên cà vẹt ⇒ điền + khoá, bút trong ô để sửa (ADR 0102). */}
        <RegistrationTextField
          control={control as never}
          name="plateNumber"
          reading={registrationReading}
          label={tForm('specs.plateNumber')}
          fieldLabel={tForm('specs.plateNumber')}
          placeholder={tForm('specs.platePlaceholder')}
          help={t('plateHint')}
          required
        />
      </Col>
      {/*
        Hãng → Mẫu xe và các ô phân loại dùng CHUNG component với form đầy đủ ở `/manage`:
        một chủ xe đăng nhanh rồi vào sửa lại phải thấy đúng những ô đó, hỏi đúng cách đó.
      */}
      <Col xs={24}>
        <VehicleIdentityFields
          required
          control={control as never}
          vehicleType={vehicleType || VEHICLE_TYPE.CAR}
          setValue={setValue as never}
        />
      </Col>
      <Col xs={24} sm={12}>
        <NumberField
          control={control}
          name="manufactureYear"
          required
          label={tForm('specs.manufactureYear')}
          min={1980}
          max={new Date().getFullYear() + 1}
        />
      </Col>
      <Col xs={24} sm={12}>
        <RegistrationTextField
          control={control as never}
          name="color"
          reading={registrationReading}
          label={tForm('specs.color')}
          fieldLabel={tForm('specs.color')}
          placeholder={tForm('specs.colorPlaceholder')}
        />
      </Col>
      <Col xs={24}>
        <VehicleClassificationFields
          required
          control={control as never}
          vehicleType={vehicleType || VEHICLE_TYPE.CAR}
          bodyTypePicker={<BodyTypePicker control={control as never} />}
          setValue={setValue as never}
        />
      </Col>
      <Col xs={24}>
        <VehicleEnergyFields
          control={control as never}
          vehicleType={vehicleType || VEHICLE_TYPE.CAR}
          transmissionOptions={transmissionOptions}
          setValue={setValue as never}
          // Luồng nhanh của chủ xe: chỉ hỏi ô ÁP DỤNG cho nhiên liệu đã chọn (như bản cũ) - không bày
          // ô khoá "chỉ dành cho xe điện" làm dài form (18/11/2026).
          fuelRequired
        />
      </Col>
    </Row>
  );
}
