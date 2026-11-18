'use client';

import { SyncOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { INSURANCE_VALUE_TIER_LIMITS, type InsurancePremiumTier } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePremiumCheck } from '../hooks';
import { premiumPlan, type PremiumPlanConfig } from '../premium-plan';
import type { InsurancePremiumCheckResult } from '../types';
import { PremiumPlanTable } from './PremiumPlanTable';
import styles from './PremiumCalculatorCard.module.css';

/** Giá trị mẫu khi mở màn — một chiếc xe phổ thông, admin gõ đè. */
const SAMPLE = { insuredValue: 500_000_000, manufactureYear: 2020, seatCount: 5 };
const YEAR_MIN = 1980;
const SEATS = { min: 2, max: 60 };

/**
 * TÍNH THỬ phí bảo hiểm vật chất xe (ADR 0097): gõ giá trị xe ⇒ thấy ngay từng bậc thời lượng khách
 * trả bao nhiêu, chuyển MIC bao nhiêu, XePrime giữ lại bao nhiêu — theo cấu hình ĐANG LƯU (hoặc cấu
 * hình đang sửa, khi nằm trong form sản phẩm).
 *
 * "Đối chiếu với MIC" hỏi hãng phí của từng bậc (`phi_vcx`) cho đúng xe mẫu này và đặt cạnh bảng — lệch
 * là dấu hiệu MIC đã đổi biểu phí, cần sửa bảng bậc. Kết quả đối chiếu chỉ hiện khi khớp đúng bộ số
 * đang gõ; gõ số khác là lượt đối chiếu cũ hết hiệu lực.
 */
export function PremiumCalculatorCard({
  config,
  allowPartnerCheck = true,
}: {
  config: PremiumPlanConfig;
  /** Trong form sản phẩm đang sửa thì không hỏi hãng — bảng bậc chưa lưu. */
  allowPartnerCheck?: boolean;
}) {
  const t = useTranslations('AdminInsurance.calculator');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const check = usePremiumCheck();
  const [checked, setChecked] = useState<{
    key: string;
    result: InsurancePremiumCheckResult;
  } | null>(null);
  const currentYear = new Date().getFullYear();

  const schema = useMemo(
    () =>
      yup.object({
        insuredValue: yup
          .number()
          .typeError(t('validation.insuredValue'))
          .required(t('validation.insuredValue'))
          .min(INSURANCE_VALUE_TIER_LIMITS.insuredValueMin, t('validation.insuredValue'))
          .max(INSURANCE_VALUE_TIER_LIMITS.insuredValueMax, t('validation.insuredValue')),
        manufactureYear: yup
          .number()
          .typeError(t('validation.year'))
          .required(t('validation.year'))
          .integer(t('validation.year'))
          .min(YEAR_MIN, t('validation.year'))
          .max(currentYear + 1, t('validation.year')),
        seatCount: yup
          .number()
          .typeError(t('validation.seats'))
          .required(t('validation.seats'))
          .integer(t('validation.seats'))
          .min(SEATS.min, t('validation.seats'))
          .max(SEATS.max, t('validation.seats')),
      }),
    [t, currentYear],
  );
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: SAMPLE,
  });
  const [insuredValue, manufactureYear, seatCount] = useWatch({
    control,
    name: ['insuredValue', 'manufactureYear', 'seatCount'],
  });
  const value =
    typeof insuredValue === 'number' && Number.isFinite(insuredValue)
      ? String(Math.trunc(insuredValue))
      : '';
  const rows = premiumPlan(value, config);
  const inputKey = `${value}|${manufactureYear}|${seatCount}`;
  const shownCheck = checked && checked.key === inputKey ? checked.result : null;

  const onCheck = handleSubmit((values) => {
    if (check.isPending) return;
    const key = `${Math.trunc(values.insuredValue)}|${values.manufactureYear}|${values.seatCount}`;
    check.mutate(
      {
        insuredValue: String(Math.trunc(values.insuredValue)),
        manufactureYear: values.manufactureYear,
        seatCount: values.seatCount,
      },
      {
        onSuccess: (result) => setChecked({ key, result }),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <section className={styles.card} aria-label={t('title')}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>{t('title')}</h3>
          <p className={styles.muted}>{t('intro')}</p>
        </div>
        {allowPartnerCheck ? (
          <Button
            icon={<SyncOutlined aria-hidden />}
            loading={check.isPending}
            onClick={() => void onCheck()}
          >
            {t('check')}
          </Button>
        ) : null}
      </div>
      <DialogForm onSubmit={onCheck} labelPosition="top" className={styles.fields}>
        <NumberField
          control={control}
          name="insuredValue"
          label={t('fields.insuredValue')}
          money
          min={0}
          required
        />
        {allowPartnerCheck ? (
          <>
            <NumberField
              control={control}
              name="manufactureYear"
              label={t('fields.manufactureYear')}
              min={YEAR_MIN}
              max={currentYear + 1}
              required
            />
            <NumberField
              control={control}
              name="seatCount"
              label={t('fields.seatCount')}
              min={SEATS.min}
              max={SEATS.max}
              required
            />
          </>
        ) : null}
      </DialogForm>
      {shownCheck ? (
        <Alert
          type={
            shownCheck.rows.some((r) => r.difference && r.difference !== '0')
              ? 'warning'
              : 'success'
          }
          showIcon
          title={t('checkedBy', { partner: shownCheck.partnerName })}
        />
      ) : null}
      {rows ? (
        <PremiumPlanTable
          tiers={config.tiers as readonly InsurancePremiumTier[]}
          rows={rows}
          check={shownCheck}
          label={t('tableLabel')}
        />
      ) : (
        <p className={styles.muted}>{t('enterValue')}</p>
      )}
    </section>
  );
}
