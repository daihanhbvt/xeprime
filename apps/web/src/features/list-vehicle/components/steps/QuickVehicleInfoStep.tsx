'use client';

import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES } from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useCatalogOptions } from '@/features/catalog/use-catalog';
import { CATALOG_TYPE } from '@xeprime/types';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';
import { VehicleClassificationFields } from '@/features/vehicles/components/VehicleClassificationFields';
import { VehicleEnergyFields } from '@/features/vehicles/components/VehicleEnergyFields';
import { VehicleIdentityFields } from '@/features/vehicles/components/VehicleIdentityFields';
import {
  FeaturesSelect,
  useTransmissionOptions,
} from '@/features/vehicles/components/VehicleFormSections';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { suggestVehicleName } from '../../mappers';
import type { QuickVehicleValues } from '../../schema';
import styles from './QuickVehicleSteps.module.css';

interface Props {
  control: Control<QuickVehicleValues>;
  setValue: UseFormSetValue<QuickVehicleValues>;
  vehicleType: string;
}

/**
 * Bước 1 — thông tin xe.
 *
 * Ba khối theo mockup: biển số · thông tin cơ bản · mô tả và tiện nghi. Các ô dùng ĐÚNG những
 * component mà wizard `/manage` và màn sửa xe đang dùng (hãng xe từ catalog, tiện nghi từ
 * catalog, khối năng lượng theo ma trận dùng chung) — không có bộ form thứ hai cho luồng nhanh.
 *
 * Tên hiển thị có nút gợi ý từ hãng + mẫu + năm, nhưng vẫn là một ô người dùng nhìn thấy và sửa
 * được: hệ thống không lưu một cái tên mà chủ xe không biết mình đang đặt.
 */
export function QuickVehicleInfoStep({ control, setValue, vehicleType }: Props) {
  const t = useTranslations('ListYourVehicle.info');
  const tForm = useTranslations('Vehicles.form');
  const domainLabel = useDomainLabel();

  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const brandOptions = useCatalogOptions(CATALOG_TYPE.VEHICLE_BRAND, brand);

  // Tên mẫu để gợi ý tên xe lấy từ DANH MỤC — ô "Mẫu xe" giờ là select, không còn chữ tự do.
  const { models } = useCatalogModels({
    vehicleType: vehicleType || VEHICLE_TYPE.CAR,
    brandKey: brand,
    includeId: modelId,
  });
  const model = models.find((m) => m.id === modelId)?.label ?? null;

  const transmissionOptions = useTransmissionOptions(vehicleType || VEHICLE_TYPE.CAR, fuelType);
  const vehicleTypeOptions = useMemo(
    () =>
      VEHICLE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleType', value),
      })),
    [domainLabel],
  );

  const suggestedName = suggestVehicleName({
    brandLabel: brandOptions.find((option) => option.value === brand)?.label ?? brand,
    model,
    manufactureYear: year,
  });

  return (
    <div className={styles.stack}>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('typeTitle')}</h3>
        <RadioGroupField
          control={control}
          name="vehicleType"
          label={t('typeLabel')}
          options={vehicleTypeOptions}
          required
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('plateTitle')}</h3>
        <p className={styles.blockHint}>{t('plateHint')}</p>
        <TextField
          control={control}
          name="plateNumber"
          label={tForm('specs.plateNumber')}
          placeholder={tForm('specs.platePlaceholder')}
          required
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('basicTitle')}</h3>
        <Row gutter={16}>
          {/*
            Hãng → Mẫu xe và các ô phân loại dùng CHUNG component với form đầy đủ ở `/manage`:
            một chủ xe đăng nhanh rồi vào sửa lại phải thấy đúng những ô đó, hỏi đúng cách đó.
          */}
          <Col xs={24}>
            <VehicleIdentityFields
              control={control as never}
              vehicleType={vehicleType || VEHICLE_TYPE.CAR}
              setValue={setValue as never}
            />
          </Col>
          <Col xs={24}>
            <VehicleClassificationFields
              control={control as never}
              vehicleType={vehicleType || VEHICLE_TYPE.CAR}
              setValue={setValue as never}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="manufactureYear"
              label={tForm('specs.manufactureYear')}
              min={1980}
              max={new Date().getFullYear() + 1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="color"
              label={tForm('specs.color')}
              placeholder={tForm('specs.colorPlaceholder')}
            />
          </Col>
          <Col xs={24}>
            <TextField
              control={control}
              name="name"
              label={t('nameLabel')}
              placeholder={t('namePlaceholder')}
              help={
                suggestedName ? (
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => setValue('name', suggestedName, { shouldValidate: true })}
                  >
                    {t('nameSuggestion', { name: suggestedName })}
                  </button>
                ) : (
                  t('nameHelp')
                )
              }
              required
            />
          </Col>
        </Row>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('energyTitle')}</h3>
        <VehicleEnergyFields
          control={control as never}
          vehicleType={vehicleType || VEHICLE_TYPE.CAR}
          transmissionOptions={transmissionOptions}
          setValue={setValue as never}
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('descriptionTitle')}</h3>
        <TextAreaField
          control={control}
          name="description"
          label={tForm('media.description')}
          placeholder={tForm('media.descriptionPlaceholder')}
          help={t('descriptionHelp')}
          maxLength={4000}
          rows={5}
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('featuresTitle')}</h3>
        <FeaturesSelect
          control={control as never}
          vehicleType={vehicleType || VEHICLE_TYPE.CAR}
        />
      </section>
    </div>
  );
}
