'use client';

import { Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { PLATFORM_FEE_BASIS, type VehicleType } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { FEE_POLICY_AMOUNT_MAX, FEE_POLICY_VEHICLE_TYPES, type FeePolicyFormValues } from '../form';
import styles from './FeePolicyFormModal.module.css';

/** Số ngày của ví dụ dưới mỗi loại xe — đủ để thấy khác biệt giữa hai cách tính. */
const EXAMPLE_DAYS = 3;

/**
 * Phí sàn `S` theo loại xe (ADR 0098): số tiền + cách tính — MỘT LẦN mỗi chuyến, hay × số ngày thuê
 * (mọi loại thuê, kể cả dài hạn). Mỗi loại xe chọn riêng. Dòng ví dụ bên dưới nói ngay khách một
 * chuyến 3 ngày trả bao nhiêu, để hai lựa chọn không bị hiểu nhầm.
 */
export function PlatformFeeField({ control }: { control: Control<FeePolicyFormValues> }) {
  const t = useTranslations('FeePolicies.form');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [amounts, basis] = useWatch({
    control,
    name: ['customerPlatformFee', 'customerPlatformFeeBasis'],
  });

  return (
    <div className={styles.grid2}>
      {FEE_POLICY_VEHICLE_TYPES.map((type: VehicleType) => {
        const vehicle = domainLabel('vehicleType', type);
        const amount = amounts?.[type];
        const perDay = basis?.[type] === PLATFORM_FEE_BASIS.PER_DAY;
        const example =
          typeof amount === 'number' && amount > 0
            ? t('platformFeeExample', {
                days: EXAMPLE_DAYS,
                amount: fmt.money(String(perDay ? amount * EXAMPLE_DAYS : amount)),
              })
            : null;
        return (
          <div key={type} className={styles.platformFee}>
            <NumberField
              control={control}
              name={`customerPlatformFee.${type}`}
              label={t('platformFeeFor', { type: vehicle })}
              money
              min={0}
              max={FEE_POLICY_AMOUNT_MAX}
              required
            />
            <Controller
              control={control}
              name={`customerPlatformFeeBasis.${type}`}
              render={({ field }) => (
                <Radio.Group
                  aria-label={t('platformFeeBasisLabel', { type: vehicle })}
                  optionType="button"
                  buttonStyle="solid"
                  className={styles.basis}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  options={[
                    { value: PLATFORM_FEE_BASIS.PER_TRIP, label: t('platformFeePerTrip') },
                    { value: PLATFORM_FEE_BASIS.PER_DAY, label: t('platformFeePerDay') },
                  ]}
                />
              )}
            />
            {example ? <p className={styles.example}>{example}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
