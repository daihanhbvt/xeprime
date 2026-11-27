'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { createContext, useContext, type ReactNode } from 'react';
import { useFieldArray, useFormState, useWatch, type Control } from 'react-hook-form';
import { LONG_TERM_PACKAGE_MONTHS } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { cx } from '@/lib/cx';
import type { PolicyFormValues } from '../schema';
import { PolicyInfoTip } from './PolicyInfoTip';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

import styles from './PolicySections.module.css';

type LegacyTierView = { minDays: number; percent: number };

/**
 * Bố cục PHẲNG (màn sửa xe, design `23731:37932`): các khối là phần của MỘT thẻ do nơi gọi dựng,
 * cách nhau bằng vạch kẻ — không viền thẻ lồng trong thẻ. Dòng nhắc trùng với công tắc/lựa chọn
 * ngay cạnh nó bị bỏ; công thức và bản xem trước đi vào icon ⓘ cạnh tiêu đề. Trang chính sách gian
 * hàng không bọc nên giữ bố cục thẻ như cũ.
 */
const FlatLayout = createContext(false);

export function PolicyFlatLayout({ children }: { children: ReactNode }) {
  return <FlatLayout.Provider value>{children}</FlatLayout.Provider>;
}

/**
 * Khối còn dùng ở màn sửa xe: mốc ưu đãi dài hạn (tab Dài hạn). Cọc · giao nhận · km · quá giờ nay
 * dùng CHUNG các khối của trang Chính sách thuê (`ShopPolicyBlocks` - ADR 0112), không còn bản thứ hai.
 */
export const POLICY_BLOCK = {
  DISCOUNT: 'discount',
} as const;
export type PolicyBlock = (typeof POLICY_BLOCK)[keyof typeof POLICY_BLOCK];

interface PolicySectionsProps {
  control: Control<PolicyFormValues>;
  legacyDiscountTiers?: readonly LegacyTierView[];
  numbered?: boolean;
  disabled?: boolean;
  blocks?: readonly PolicyBlock[];
}

export function PolicySections({
  control,
  legacyDiscountTiers,
  numbered = true,
  disabled = false,
  blocks = [POLICY_BLOCK.DISCOUNT],
}: PolicySectionsProps) {
  const t = useTranslations('Vehicles.pricing');
  const flat = useContext(FlatLayout);
  if (!blocks.includes(POLICY_BLOCK.DISCOUNT)) return null;
  const title = t('longTermDiscount.title');
  const body = (
    <DiscountSection
      control={control}
      title={numbered ? `1. ${title}` : title}
      legacyTiers={legacyDiscountTiers}
      disabled={disabled}
    />
  );
  return flat ? body : <div className={styles.stack}>{body}</div>;
}

function SectionTitle({
  title,
  infoLabel,
  children,
}: {
  title: string;
  infoLabel: string;
  children: ReactNode;
}) {
  const flat = useContext(FlatLayout);
  return (
    <div className={styles.titleRow}>
      <h2 className={cx(styles.cardTitle, flat && styles.flatTitle)}>{title}</h2>
      <PolicyInfoTip label={infoLabel}>{children}</PolicyInfoTip>
    </div>
  );
}

/** Công thức / bản xem trước trong icon ⓘ của tiêu đề khối (bố cục phẳng). */
function HeadLabel({
  children,
  infoLabel,
  info,
}: {
  children: ReactNode;
  infoLabel?: string;
  info?: ReactNode;
}) {
  return (
    <span className={styles.headLabel}>
      <span>{children}</span>
      {infoLabel && info ? <PolicyInfoTip label={infoLabel}>{info}</PolicyInfoTip> : null}
    </span>
  );
}

function DiscountSection({
  control,
  title,
  legacyTiers,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  legacyTiers?: readonly LegacyTierView[];
  disabled: boolean;
}) {
  const t = useTranslations('Vehicles.pricing.longTermDiscount');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const tUnits = useTranslations('Common.units');

  const enabled = useWatch({ control, name: 'discountEnabled' });
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { errors } = useFormState({ control, name: 'discountTiers' });
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });
  const hideControls = useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS) && disabled;
  const flat = useContext(FlatLayout);

  const optionsFor = (index: number) =>
    LONG_TERM_PACKAGE_MONTHS.filter(
      (month) =>
        month === tiers[index]?.minMonths || !tiers.some((tier) => tier?.minMonths === month),
    ).map((month) => ({ value: String(month), label: tUnits('month', { count: month }) }));
  const nextUnusedMonths =
    LONG_TERM_PACKAGE_MONTHS.find((month) => !tiers.some((tier) => tier?.minMonths === month)) ??
    null;

  const tierErrors = errors.discountTiers as
    { root?: { message?: string }; message?: string } | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;

  return (
    <section className={cx(styles.card, flat && styles.flat)} aria-label={title}>
      <div className={styles.cardHeader}>
        <SectionTitle title={title} infoLabel={t('tipLabel')}>
          {t('hint')}
        </SectionTitle>
        <SwitchField
          control={control}
          name="discountEnabled"
          label={enabled ? tLabels('enabled') : tLabels('disabled')}
          disabled={disabled}
        />
      </div>

      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label={t('tiers')}>
            <div className={styles.discountHead}>
              <HeadLabel infoLabel={t('packageTipLabel')} info={t('packageTip')}>
                {t('packageLabel')}
              </HeadLabel>
              <HeadLabel infoLabel={t('percentTipLabel')} info={t('percentTip')}>
                {t('percentLabel')}
              </HeadLabel>
              <HeadLabel infoLabel={t('noteTipLabel')} info={t('noteTip')}>
                {t('tierNote')}
              </HeadLabel>
              <span className={styles.tierActionHead}>{tLabels('actions')}</span>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className={styles.discountRow}>
                <SelectField
                  control={control}
                  name={`discountTiers.${index}.minMonths`}
                  label={t('tierMonthsLabel', { index: index + 1 })}
                  options={optionsFor(index)}
                  placeholder={t('selectPackage')}
                  disabled={disabled}
                />
                <NumberField
                  control={control}
                  name={`discountTiers.${index}.percent`}
                  label={t('tierPercentLabel', { index: index + 1 })}
                  percent
                  disabled={disabled}
                />
                <TextField
                  control={control}
                  name={`discountTiers.${index}.note`}
                  label={t('tierNoteLabel', { index: index + 1 })}
                  placeholder={t('notePlaceholder')}
                  disabled={disabled}
                />
                {hideControls ? null : (
                  <Button
                    className={styles.deleteButton}
                    type="text"
                    danger
                    icon={<DeleteOutlined aria-hidden="true" />}
                    aria-label={t('removeTierAt', { index: index + 1 })}
                    onClick={() => remove(index)}
                    disabled={disabled}
                  >
                    <span className={styles.deleteText}>{tActions('delete')}</span>
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            {hideControls ? null : (
              <Button
                icon={<PlusOutlined aria-hidden="true" />}
                disabled={disabled || nextUnusedMonths == null}
                onClick={() => append({ minMonths: nextUnusedMonths, percent: null, note: '' })}
              >
                {t('addTier')}
              </Button>
            )}
            {crossError ? (
              <span className={styles.tierError} role="alert">
                ⚠ {crossError}
              </span>
            ) : null}
          </div>

          {legacyTiers?.length ? (
            <Alert
              type="warning"
              showIcon
              title={t('legacyTitle', { count: legacyTiers.length })}
              description={
                <>
                  <span>
                    {legacyTiers
                      .map((tier) => t('legacyTier', { days: tier.minDays, percent: tier.percent }))
                      .join(LIST_SEPARATOR)}
                  </span>
                  <br />
                  <span>{t('legacyBody')}</span>
                </>
              }
            />
          ) : null}
          <div className={styles.formulaCard}>
            <span className={styles.previewTitle}>{t('formulaTitle')}</span>
            <span className={styles.previewText}>{t('formula')}</span>
          </div>
        </>
      ) : (
        <p className={styles.disabledNote}>{t('disabledNote')}</p>
      )}
    </section>
  );
}
