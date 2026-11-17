'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useFieldArray, useFormState, type Control } from 'react-hook-form';
import { INSURANCE_VALUE_TIER_LIMITS } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { TextField } from '@/components/form/TextField';
import type { InsuranceProductFormValues } from '../form';
import styles from './InsuranceProductFormDialog.module.css';

/**
 * Biểu phí BẬC của bảo hiểm vật chất xe (ADR 0088): mỗi hàng "chuyến tối đa N ngày ⇒ phí = X% giá
 * trị xe". Số lấy từ biểu phí MIC (loại xe M1.11), đã gồm VAT. Luật kiểm là CHÍNH hàm server dùng.
 */
export function PremiumTiersField({ control }: { control: Control<InsuranceProductFormValues> }) {
  const t = useTranslations('AdminInsurance.form');
  const { fields, append, remove } = useFieldArray({ control, name: 'premiumTiers' });
  const { errors } = useFormState({ control, name: 'premiumTiers' });
  const rootError = errors.premiumTiers?.root?.message ?? errors.premiumTiers?.message;
  const last = fields[fields.length - 1];

  return (
    <Form.Item
      label={t('fields.premiumTiers')}
      help={rootError ?? t('help.premiumTiers')}
      validateStatus={rootError ? 'error' : undefined}
    >
      <div className={styles.tiers}>
        {fields.map((field, index) => (
          <div key={field.id} className={styles.tierRow}>
            <NumberField
              control={control}
              name={`premiumTiers.${index}.maxDays`}
              label={t('fields.tierMaxDays')}
              min={1}
              max={INSURANCE_VALUE_TIER_LIMITS.maxDays}
              addonAfter={t('fields.tierDaysSuffix')}
            />
            <TextField
              control={control}
              name={`premiumTiers.${index}.percent`}
              label={t('fields.tierPercent')}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined aria-hidden />}
              aria-label={t('actions.removeTier')}
              onClick={() => remove(index)}
              disabled={fields.length <= 1}
            />
          </div>
        ))}
        {fields.length < INSURANCE_VALUE_TIER_LIMITS.maxTiers ? (
          <Button
            icon={<PlusOutlined aria-hidden />}
            onClick={() =>
              append({
                maxDays: Math.min(INSURANCE_VALUE_TIER_LIMITS.maxDays, (last?.maxDays ?? 0) + 1),
                percent: '',
              })
            }
          >
            {t('actions.addTier')}
          </Button>
        ) : null}
      </div>
    </Form.Item>
  );
}
