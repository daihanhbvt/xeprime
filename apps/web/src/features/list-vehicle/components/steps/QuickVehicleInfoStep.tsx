'use client';

import { Col, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { TRANSMISSION_TYPE_VALUES, VEHICLE_TYPE, VEHICLE_TYPE_VALUES } from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useCatalogOptions } from '@/features/catalog/use-catalog';
import { CATALOG_TYPE } from '@xeprime/types';
import { VehicleEnergyFields } from '@/features/vehicles/components/VehicleEnergyFields';
import {
  BrandSelect,
  FeaturesSelect,
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
  const model = useWatch({ control, name: 'model' });
  const year = useWatch({ control, name: 'manufactureYear' });
  const brandOptions = useCatalogOptions(CATALOG_TYPE.VEHICLE_BRAND, brand);

  const transmissionOptions = useMemo(
    () =>
      TRANSMISSION_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('transmissionType', value),
      })),
    [domainLabel],
  );
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
          <Col xs={24} sm={12}>
            <BrandSelect control={control as never} />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="model"
              label={tForm('specs.model')}
              placeholder={tForm('specs.modelPlaceholder')}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="seatCount"
              label={tForm('specs.seatCount')}
              placeholder={tForm('specs.seatPlaceholder')}
              min={1}
              max={64}
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
        <FeaturesSelect control={control as never} />
      </section>
    </div>
  );
}
