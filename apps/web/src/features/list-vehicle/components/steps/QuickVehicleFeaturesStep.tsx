'use client';

import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { VEHICLE_TYPE } from '@xeprime/types';

import { TextAreaField } from '@/components/form/TextAreaField';
import { FeaturesSelect } from '@/features/vehicles/components/VehicleFormSections';

import type { QuickVehicleValues } from '../../schema';
import styles from './QuickVehicleSteps.module.css';

/**
 * Bước 3 "Tiện ích & mô tả" của luồng đăng nhanh - cùng bố cục với wizard nâng cao (Figma
 * `24352:81824`): tiện nghi rồi mô tả văn bản thường (tối đa 4.000 ký tự). Hai trường này trước nằm
 * cuối bước "Thông tin xe".
 */
export function QuickVehicleFeaturesStep({
  control,
  vehicleType,
}: {
  control: Control<QuickVehicleValues>;
  vehicleType: string;
}) {
  const t = useTranslations('ListYourVehicle.info');
  const tForm = useTranslations('Vehicles.form');

  return (
    <div className={styles.stack}>
      <section className={styles.block}>
        <h3 className={styles.blockTitle} id="vehicle-features-label">
          {t('featuresTitle')}
        </h3>
        <FeaturesSelect control={control as never} vehicleType={vehicleType || VEHICLE_TYPE.CAR} />
      </section>

      <section className={styles.block}>
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
    </div>
  );
}
