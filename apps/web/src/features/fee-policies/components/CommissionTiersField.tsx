'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useFieldArray, useFormState, useWatch, type Control } from 'react-hook-form';
import { OWNER_COMMISSION_PERCENT_MAX } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { NumberField } from '@/components/form/NumberField';
import { useAppFormat } from '@/i18n/use-app-format';
import {
  OWNER_COMMISSION_FROM_DAY_MAX,
  OWNER_COMMISSION_TIERS_MAX,
  commissionPreview,
  commissionTierRanges,
  type FeePolicyFormValues,
} from '../form';
import { useTierRangeLabel } from '../hooks/use-tier-range-label';
import styles from './CommissionTiersField.module.css';

/**
 * Bảng nấc hoa hồng lũy tiến `H` — mỗi nấc chỉ khai mốc BẮT ĐẦU (`OwnerCommissionTier`), ngày cuối
 * suy từ nấc kế tiếp, nấc cuối kéo dài vô hạn. Nấc đầu luôn bắt đầu từ ngày 1 nên ô đó không sửa
 * được và không xoá được — luật của `feePolicyActivationBlockers`, hiện ra bằng dáng của bảng.
 *
 * Ví dụ bên dưới tính bằng `computeTieredOwnerCommission` — đúng phép tính server dùng lúc chốt giá.
 */
export function CommissionTiersField({ control }: { control: Control<FeePolicyFormValues> }) {
  const t = useTranslations('FeePolicies.form');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const rangeLabel = useTierRangeLabel();

  const { fields, append, remove } = useFieldArray({ control, name: 'ownerCommissionTiers' });
  const tiers = useWatch({ control, name: 'ownerCommissionTiers' }) ?? [];
  const { errors } = useFormState({ control, name: 'ownerCommissionTiers' });

  const tierErrors = errors.ownerCommissionTiers as
    | { root?: { message?: string }; message?: string }
    | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;
  const ranges = commissionTierRanges(tiers);
  const preview = commissionPreview(tiers);

  return (
    <div className={styles.wrap}>
      <div className={styles.table} role="group" aria-label={t('sectionCommission')}>
        <div className={styles.head} aria-hidden="true">
          <span>{t('tierHeadFrom')}</span>
          <span>{t('tierHeadTo')}</span>
          <span>{t('tierHeadPercent')}</span>
          <span className={styles.actionHead}>{tLabels('actions')}</span>
        </div>

        {fields.map((field, index) => {
          const range = ranges[index];
          const isLast = index === fields.length - 1;
          return (
            <div key={field.id} className={styles.row}>
              {index === 0 ? (
                <span className={styles.fixedDay}>1</span>
              ) : (
                <NumberField
                  control={control}
                  name={`ownerCommissionTiers.${index}.fromDay`}
                  label={t('tierFromLabel', { index: index + 1 })}
                  min={1}
                  max={OWNER_COMMISSION_FROM_DAY_MAX}
                  precision={0}
                />
              )}
              <span className={styles.toDay}>
                {isLast
                  ? t('tierOpenEnded')
                  : range?.toDay != null
                    ? String(range.toDay)
                    : tLabels('emptyValue')}
              </span>
              <NumberField
                control={control}
                name={`ownerCommissionTiers.${index}.percent`}
                label={t('tierPercentLabel', { index: index + 1 })}
                percent
                min={0}
                max={OWNER_COMMISSION_PERCENT_MAX}
                precision={1}
              />
              {index === 0 ? (
                <span />
              ) : (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label={t('removeTierAt', { index: index + 1 })}
                  onClick={() => remove(index)}
                >
                  <span className={styles.deleteText}>{tActions('delete')}</span>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <Button
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={() => append({ fromDay: null, percent: null })}
          disabled={fields.length >= OWNER_COMMISSION_TIERS_MAX}
        >
          {t('addTier')}
        </Button>
        {crossError ? (
          <span className={styles.error} role="alert">
            {crossError}
          </span>
        ) : null}
      </div>

      <div className={styles.preview} aria-live="polite">
        {preview ? (
          <>
            <span className={styles.previewTitle}>
              {t('previewTitle', { days: preview.days, daily: fmt.money(preview.dailyAmount) })}
            </span>
            <span className={styles.previewResult}>
              {t('previewResult', {
                amount: fmt.money(preview.commissionAmount),
                percent: preview.effectivePercent,
              })}
            </span>
            <span className={styles.previewSegments}>
              {preview.segments
                .map((segment) =>
                  t('previewSegment', { range: rangeLabel(segment), percent: segment.percent }),
                )
                .join(LIST_SEPARATOR)}
            </span>
          </>
        ) : (
          <span className={styles.previewMuted}>{t('previewInvalid')}</span>
        )}
      </div>
    </div>
  );
}
