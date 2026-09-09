'use client';

import {
  CheckCircleOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type FieldErrors,
} from 'react-hook-form';
import {
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_MODE,
  COLLATERAL_MODE_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
  type CollateralMode,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { deliverySummaryText } from '../form';
import type { PolicyFormValues } from '../schema';
import { PolicyInfoTip } from './PolicyInfoTip';

import styles from './PolicySections.module.css';

type LegacyTierView = { minDays: number; percent: number };

interface PolicySectionsProps {
  control: Control<PolicyFormValues>;
  legacyDiscountTiers?: readonly LegacyTierView[];
  depositHint?: ReactNode;
  numbered?: boolean;
  disabled?: boolean;
}

/**
 * Bốn khối dùng chung cho policy gian hàng và policy ghi đè theo xe.
 *
 * Từng khối cũng được export riêng (`CollateralPolicySection`, `DeliveryPolicySection`) để không
 * gian quản lý xe (08/09/2026) dựng màn "Giao xe tận nơi" và "Thủ tục cho thuê" từ ĐÚNG các ô
 * này — không có bản sao thứ hai của bảng bậc phí hay ba chế độ bảo đảm.
 */
export function PolicySections({
  control,
  depositHint,
  legacyDiscountTiers,
  numbered = true,
  disabled = false,
}: PolicySectionsProps) {
  const t = useTranslations('Vehicles.pricing');
  const n = (index: number, title: string) => (numbered ? `${index}. ${title}` : title);

  return (
    <div className={styles.stack}>
      <CollateralPolicySection
        control={control}
        title={n(1, t('deposit.title'))}
        hint={depositHint}
        disabled={disabled}
      />
      <DeliveryPolicySection
        control={control}
        title={n(2, t('delivery.title'))}
        disabled={disabled}
      />
      <OvertimeSection control={control} title={n(3, t('overtime.title'))} disabled={disabled} />
      <DiscountSection
        control={control}
        title={n(4, t('longTermDiscount.title'))}
        legacyTiers={legacyDiscountTiers}
        disabled={disabled}
      />
    </div>
  );
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
  return (
    <div className={styles.titleRow}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <PolicyInfoTip label={infoLabel}>{children}</PolicyInfoTip>
    </div>
  );
}

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

/** Mã chế độ bảo đảm → khoá câu mô tả. Mã là dữ liệu, chỉ NHÃN mới dịch (ADR 0012). */
const MODE_HINT_KEY: Readonly<Record<CollateralMode, 'modeCash' | 'modeAsset' | 'modeNone'>> = {
  [COLLATERAL_MODE.CASH]: 'modeCash',
  [COLLATERAL_MODE.ASSET]: 'modeAsset',
  [COLLATERAL_MODE.NONE]: 'modeNone',
};

/**
 * Khối BẢO ĐẢM — ba chế độ loại trừ nhau (gap C-04). Chỉ phần thuộc chế độ đang chọn hiện ra:
 * ô tiền cọc ở `cash`, danh mục tài sản ở `asset`, `none` không có gì để nhập.
 *
 * Giấu phần không liên quan thay vì disable nó: một ô tiền cọc mờ đi bên cạnh "Miễn thế chấp"
 * vẫn khiến người dùng tưởng số cũ còn hiệu lực, trong khi `formToSaveInput` đã ép nó về 0.
 */
export function CollateralPolicySection<T extends PolicyFormValues>({
  control: outerControl,
  title,
  hint,
  disabled = false,
  /** Mô tả từng chế độ do nơi gọi truyền để nói đúng ngữ cảnh (gian hàng vs một xe). */
  optionDescriptions,
}: {
  control: Control<T>;
  title: string;
  hint?: ReactNode;
  disabled?: boolean;
  optionDescriptions?: Partial<Record<string, string>>;
}) {
  /*
   * Form của nơi gọi có thể là một BỘ BAO HÀM `PolicyFormValues` (màn "Thủ tục cho thuê" gộp
   * chính sách bảo đảm với thiết lập dịch vụ). RHF không suy được `'collateralMode' extends
   * Path<T>`, nên quy chiếu MỘT lần ở đây thay vì ép kiểu ở từng ô bên dưới — vẫn an toàn vì
   * ràng buộc `T extends PolicyFormValues` bảo đảm các trường này có thật.
   */
  const control = outerControl as unknown as Control<PolicyFormValues>;
  const t = useTranslations('Vehicles.pricing.deposit');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' });

  /*
   * Nhãn chế độ và loại tài sản lấy từ namespace `Domain`, KHÔNG từ `*_META`/`*_LABEL` của
   * `@xeprime/types`: bản đồ trong types là tiếng Việt cứng, dùng cho email/thông báo của
   * apps/api. Mỗi lựa chọn còn kèm MỘT CÂU nói nó là gì — ba cái tên trần không cho biết tiền
   * có hoàn lại không, gian hàng có giữ tiền không, hay xe sẽ mang nhãn gì trên sàn.
   */
  const modeOptions = COLLATERAL_MODE_VALUES.map((value) => ({
    value,
    label: domainLabel('collateralMode', value),
    description: optionDescriptions?.[value] ?? t(MODE_HINT_KEY[value]),
  }));
  const assetOptions = COLLATERAL_ASSET_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('collateralAssetType', value),
  }));

  return (
    <section className={styles.card} aria-label={title}>
      <SectionTitle title={title} infoLabel={t('tipLabel')}>
        {t('hint')}
      </SectionTitle>

      <RadioGroupField
        control={control}
        name="collateralMode"
        label={t('mode')}
        options={modeOptions}
        disabled={disabled}
        required
      />

      {mode === COLLATERAL_MODE.CASH ? (
        <div className={styles.depositRow}>
          <div className={styles.depositField}>
            <NumberField
              control={control}
              name="depositAmount"
              label={t('amount')}
              labelAccessory={
                <PolicyInfoTip label={t('amountTipLabel')}>{t('amountHint')}</PolicyInfoTip>
              }
              money
              required
              min={0}
              disabled={disabled}
            />
          </div>
          {hint ? <div className={styles.depositHint}>{hint}</div> : null}
        </div>
      ) : null}

      {mode === COLLATERAL_MODE.ASSET ? (
        <CheckboxGroupField
          control={control}
          name="collateralAssetTypes"
          label={t('assetTypes')}
          options={assetOptions}
          disabled={disabled}
          required
          help={t('assetTypesHint')}
        />
      ) : null}

      {mode === COLLATERAL_MODE.NONE ? (
        <Alert type="info" showIcon message={t('noneTitle')} description={t('noneBody')} />
      ) : null}
    </section>
  );
}

export function DeliveryPolicySection<T extends PolicyFormValues>({
  control: outerControl,
  title,
  disabled = false,
}: {
  control: Control<T>;
  title: string;
  disabled?: boolean;
}) {
  /*
   * Form của nơi gọi có thể là một BỘ BAO HÀM `PolicyFormValues` (màn "Thủ tục cho thuê" gộp
   * chính sách bảo đảm với thiết lập dịch vụ). RHF không suy được `'collateralMode' extends
   * Path<T>`, nên quy chiếu MỘT lần ở đây thay vì ép kiểu ở từng ô bên dưới — vẫn an toàn vì
   * ràng buộc `T extends PolicyFormValues` bảo đảm các trường này có thật.
   */
  const control = outerControl as unknown as Control<PolicyFormValues>;
  const t = useTranslations('Vehicles.pricing.delivery');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();

  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const radius = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const { errors } = useFormState({ control, name: ['deliveryTiers', 'deliveryMaxRadiusKm'] });
  const { fields, append, remove } = useFieldArray({ control, name: 'deliveryTiers' });

  const tierErrors = errors.deliveryTiers as
    | (FieldErrors<PolicyFormValues>['deliveryTiers'] & {
        root?: { message?: string };
        message?: string;
      })
    | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;
  const tiersComplete =
    tiers.length > 0 && tiers.every((tier) => tier?.toKm != null) && radius != null;

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <SectionTitle title={title} infoLabel={t('tipLabel')}>
          {t('hint')}
        </SectionTitle>
        <SwitchField
          control={control}
          name="deliveryEnabled"
          label={enabled ? tLabels('enabled') : tLabels('disabled')}
          disabled={disabled}
        />
      </div>
      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label={t('tiers')}>
            <div className={styles.tierHead}>
              <HeadLabel infoLabel={t('fromKmTipLabel')} info={t('fromKmTip')}>
                {t('fromKmLabel')}
              </HeadLabel>
              <HeadLabel infoLabel={t('toKmTipLabel')} info={t('toKmTip')}>
                {t('toKmLabel')}
              </HeadLabel>
              <HeadLabel infoLabel={t('feeTipLabel')} info={t('feeTip')}>
                {t('feeLabel')}
              </HeadLabel>
              <span className={styles.tierActionHead}>{tLabels('actions')}</span>
            </div>
            <div className={styles.tierMobileHead} aria-hidden="true">
              <span>{t('headDistance')}</span>
              <span>{t('headFee')}</span>
              <span>{tLabels('actions')}</span>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className={styles.tierRow}>
                <div className={styles.distanceCell}>
                  <span className={styles.tierFrom}>
                    {index === 0 ? '0' : `> ${tiers[index - 1]?.toKm ?? '—'}`}
                  </span>
                  <span className={styles.distanceSeparator} aria-hidden="true">
                    –
                  </span>
                  <div className={styles.tierTo}>
                    <NumberField
                      control={control}
                      name={`deliveryTiers.${index}.toKm`}
                      label={t('tierToLabel', { index: index + 1 })}
                      addonAfter={t('unitKm')}
                      min={0}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <NumberField
                  control={control}
                  name={`deliveryTiers.${index}.fee`}
                  label={t('tierFeeLabel', { index: index + 1 })}
                  money
                  help={
                    tiers[index]?.fee === 0 || tiers[index]?.fee == null ? t('free') : undefined
                  }
                  disabled={disabled}
                />
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
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => append({ toKm: null, fee: null })}
              disabled={disabled}
            >
              {t('addTier')}
            </Button>
            {crossError ? (
              <span className={styles.tierError} role="alert">
                ⚠ {crossError}
              </span>
            ) : tiersComplete ? (
              <span className={styles.tierOk}>
                <CheckCircleOutlined aria-hidden="true" /> {t('tierOk')}
              </span>
            ) : null}
          </div>

          <div className={styles.radiusField}>
            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              label={t('maxRadiusLabel')}
              labelAccessory={
                <PolicyInfoTip label={t('maxRadiusTipLabel')}>{t('maxRadiusHint')}</PolicyInfoTip>
              }
              addonAfter={t('unitKm')}
              min={0}
              required
              disabled={disabled}
            />
          </div>

          {tiersComplete ? (
            <div className={styles.previewCard}>
              <InfoCircleOutlined className={styles.previewIcon} aria-hidden="true" />
              <span>
                <strong>{t('previewTitle')}</strong>{' '}
                {deliverySummaryText(
                  { deliveryTiers: tiers, deliveryMaxRadiusKm: radius },
                  { money: fmt.money, free: t('free'), quote: t('summaryQuote') },
                )}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.disabledNote}>{t('disabledNote')}</p>
      )}
    </section>
  );
}

function OvertimeSection({
  control,
  title,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  title: string;
  disabled: boolean;
}) {
  const t = useTranslations('Vehicles.pricing.overtime');
  const fmt = useAppFormat();

  const fee = useWatch({ control, name: 'overtimeFeePerHour' });

  return (
    <section className={styles.card} aria-label={title}>
      <SectionTitle title={title} infoLabel={t('tipLabel')}>
        {t('hint')}
      </SectionTitle>
      <div className={styles.fieldRow}>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeFeePerHour"
            label={t('feePerHour')}
            labelAccessory={
              <PolicyInfoTip label={t('feePerHourTipLabel')}>{t('feePerHourHint')}</PolicyInfoTip>
            }
            money
            addonAfter={t('unitPerHour')}
            placeholder={t('placeholder')}
            disabled={disabled}
          />
        </div>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeGraceMinutes"
            label={t('graceMinutes')}
            labelAccessory={
              <PolicyInfoTip label={t('graceMinutesTipLabel')}>
                {t('graceMinutesHint')}
              </PolicyInfoTip>
            }
            addonAfter={t('unitMinutes')}
            min={0}
            placeholder={t('placeholder')}
            disabled={disabled}
          />
        </div>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeRoundingMinutes"
            label={t('roundingMinutes')}
            labelAccessory={
              <PolicyInfoTip label={t('roundingMinutesTipLabel')}>
                {t('roundingMinutesHint')}
              </PolicyInfoTip>
            }
            addonAfter={t('unitMinutes')}
            min={1}
            placeholder={t('placeholder')}
            disabled={disabled}
          />
        </div>
      </div>
      <div className={styles.formulaCard}>
        <span className={styles.previewTitle}>{t('formulaTitle')}</span>
        <span className={styles.previewText}>
          {fee != null ? t('formula', { fee: fmt.money(String(fee)) }) : t('formulaNone')}
        </span>
      </div>
    </section>
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
    <section className={styles.card} aria-label={title}>
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
              </div>
            ))}
          </div>

          <div className={styles.tierFooter}>
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              disabled={disabled || nextUnusedMonths == null}
              onClick={() => append({ minMonths: nextUnusedMonths, percent: null, note: '' })}
            >
              {t('addTier')}
            </Button>
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
