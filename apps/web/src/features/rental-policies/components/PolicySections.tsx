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
  longTermPackageLabel,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { deliverySummaryText } from '../form';
import type { PolicyFormValues } from '../schema';
import { PolicyInfoTip } from './PolicyInfoTip';

import styles from './PolicySections.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

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
  const t = useTranslations('RentalPolicies.sections');
  const n = (index: number, title: string) => (numbered ? t('numbered', { index, title }) : title);

  return (
    <div className={styles.stack}>
      <CollateralPolicySection
        control={control}
        title={n(1, t('depositTitle'))}
        hint={depositHint}
        disabled={disabled}
      />
      <DeliveryPolicySection control={control} title={n(2, t('deliveryTitle'))} disabled={disabled} />
      <OvertimeSection control={control} title={n(3, t('overtimeTitle'))} disabled={disabled} />
      <DiscountSection
        control={control}
        title={n(4, t('discountTitle'))}
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
  const t = useTranslations('RentalPolicies.sections');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' });

  const defaultDescriptions: Record<string, string> = {
    [COLLATERAL_MODE.CASH]: t('collateralCashDesc'),
    [COLLATERAL_MODE.ASSET]: t('collateralAssetDesc'),
    [COLLATERAL_MODE.NONE]: t('collateralNoneDesc'),
  };
  const modeOptions = COLLATERAL_MODE_VALUES.map((value) => ({
    value,
    label: domainLabel('collateralMode', value),
    description: optionDescriptions?.[value] ?? defaultDescriptions[value],
  }));
  const assetOptions = COLLATERAL_ASSET_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('collateralAssetType', value),
  }));

  return (
    <section className={styles.card} aria-label={title}>
      <SectionTitle title={title} infoLabel={t('depositInfoLabel')}>
        {t('depositInfo')}
      </SectionTitle>

      <RadioGroupField
        control={control}
        name="collateralMode"
        label={t('collateralMode')}
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
              label={t('depositAmount')}
              labelAccessory={
                <PolicyInfoTip label={t('depositAmountInfoLabel')}>{t('depositAmountInfo')}</PolicyInfoTip>
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
          help={t('assetTypesHelp')}
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
  const t = useTranslations('RentalPolicies.sections');
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
        <SectionTitle title={title} infoLabel={t('deliveryInfoLabel')}>
          {t('deliveryInfo')}
        </SectionTitle>
        <SwitchField
          control={control}
          name="deliveryEnabled"
          label={enabled ? t('on') : t('off')}
          disabled={disabled}
        />
      </div>
      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label={t('tierTable')}>
            <div className={styles.tierHead}>
              <HeadLabel infoLabel={t('fromKmInfoLabel')} info={t('fromKmInfo')}>
                {t('fromKm')}
              </HeadLabel>
              <HeadLabel infoLabel={t('toKmInfoLabel')} info={t('toKmInfo')}>
                {t('toKm')}
              </HeadLabel>
              <HeadLabel infoLabel={t('feeInfoLabel')} info={t('feeInfo')}>
                {t('fee')}
              </HeadLabel>
              <span className={styles.tierActionHead}>{t('actions')}</span>
            </div>
            <div className={styles.tierMobileHead} aria-hidden="true">
              <span>{t('distance')}</span>
              <span>{t('feeShort')}</span>
              <span>{t('actions')}</span>
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
                      addonAfter="km"
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
                  help={tiers[index]?.fee === 0 || tiers[index]?.fee == null ? t('free') : undefined}
                  disabled={disabled}
                />
                <Button
                  className={styles.deleteButton}
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label={t('removeTier', { index: index + 1 })}
                  onClick={() => remove(index)}
                  disabled={disabled}
                >
                  <span className={styles.deleteText}>{t('remove')}</span>
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
                <CheckCircleOutlined aria-hidden="true" /> {t('tiersOk')}
              </span>
            ) : null}
          </div>

          <div className={styles.radiusField}>
            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              label={t('radius')}
              labelAccessory={<PolicyInfoTip label={t('radiusInfoLabel')}>{t('radiusInfo')}</PolicyInfoTip>}
              addonAfter="km"
              min={0}
              required
              disabled={disabled}
            />
          </div>

          {tiersComplete ? (
            <div className={styles.previewCard}>
              <InfoCircleOutlined className={styles.previewIcon} aria-hidden="true" />
              <span>
                <strong>{t('deliveryPreview')}</strong>{' '}
                {deliverySummaryText(
                  { deliveryTiers: tiers, deliveryMaxRadiusKm: radius },
                  { free: t('free'), manualBeyond: t('manualBeyond') },
                )}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.disabledNote}>{t('deliveryOff')}</p>
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
  const t = useTranslations('RentalPolicies.sections');
  const tWorkspace = useTranslations('RentalPolicies.workspace');
  const fmt = useAppFormat();

  const fee = useWatch({ control, name: 'overtimeFeePerHour' });

  return (
    <section className={styles.card} aria-label={title}>
      <SectionTitle title={title} infoLabel={t('overtimeInfoLabel')}>
        {t('overtimeInfo')}
      </SectionTitle>
      <div className={styles.fieldRow}>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeFeePerHour"
            label={t('overtimeFee')}
            labelAccessory={<PolicyInfoTip label={t('overtimeFeeInfoLabel')}>{t('overtimeFeeInfo')}</PolicyInfoTip>}
            money
            addonAfter={tWorkspace('perHour')}
            placeholder={t('needsConfig')}
            disabled={disabled}
          />
        </div>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeGraceMinutes"
            label={t('overtimeGrace')}
            labelAccessory={
              <PolicyInfoTip label={t('overtimeGraceInfoLabel')}>{t('overtimeGraceInfo')}</PolicyInfoTip>
            }
            addonAfter={t('minutes')}
            min={0}
            placeholder={t('needsConfig')}
            disabled={disabled}
          />
        </div>
        <div className={styles.overtimeField}>
          <NumberField
            control={control}
            name="overtimeRoundingMinutes"
            label={t('overtimeRounding')}
            labelAccessory={
              <PolicyInfoTip label={t('overtimeRoundingInfoLabel')}>{t('overtimeRoundingInfo')}</PolicyInfoTip>
            }
            addonAfter={t('minutes')}
            min={1}
            placeholder={t('needsConfig')}
            disabled={disabled}
          />
        </div>
      </div>
      <div className={styles.formulaCard}>
        <span className={styles.previewTitle}>{t('overtimeFormulaTitle')}</span>
        <span className={styles.previewText}>
          {fee != null
            ? t('overtimeFormula', { fee: fmt.money(String(fee)) })
            : t('overtimeFormulaMissing')}
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
  const t = useTranslations('RentalPolicies.sections');
  const enabled = useWatch({ control, name: 'discountEnabled' });
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { errors } = useFormState({ control, name: 'discountTiers' });
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });

  const optionsFor = (index: number) =>
    LONG_TERM_PACKAGE_MONTHS.filter(
      (month) =>
        month === tiers[index]?.minMonths || !tiers.some((tier) => tier?.minMonths === month),
    ).map((month) => ({ value: String(month), label: longTermPackageLabel(month) }));
  const nextUnusedMonths =
    LONG_TERM_PACKAGE_MONTHS.find((month) => !tiers.some((tier) => tier?.minMonths === month)) ??
    null;

  const tierErrors = errors.discountTiers as
    { root?: { message?: string }; message?: string } | undefined;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.cardHeader}>
        <SectionTitle title={title} infoLabel={t('discountInfoLabel')}>
          {t('discountInfo')}
        </SectionTitle>
        <SwitchField
          control={control}
          name="discountEnabled"
          label={enabled ? t('on') : t('off')}
          disabled={disabled}
        />
      </div>

      {enabled ? (
        <>
          <div className={styles.tierTable} role="group" aria-label={t('discountTable')}>
            <div className={styles.discountHead}>
              <HeadLabel infoLabel={t('packageFromInfoLabel')} info={t('packageFromInfo')}>
                {t('packageFrom')}
              </HeadLabel>
              <HeadLabel infoLabel={t('percentInfoLabel')} info={t('percentInfo')}>
                {t('percent')}
              </HeadLabel>
              <HeadLabel infoLabel={t('noteInfoLabel')} info={t('noteInfo')}>
                {t('note')}
              </HeadLabel>
              <span className={styles.tierActionHead}>{t('actions')}</span>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className={styles.discountRow}>
                <SelectField
                  control={control}
                  name={`discountTiers.${index}.minMonths`}
                  label={t('tierPackageLabel', { index: index + 1 })}
                  options={optionsFor(index)}
                  placeholder={t('choosePackage')}
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
                  aria-label={t('removeDiscountTier', { index: index + 1 })}
                  onClick={() => remove(index)}
                  disabled={disabled}
                >
                  <span className={styles.deleteText}>{t('remove')}</span>
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
              {t('addDiscountTier')}
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
            <span className={styles.previewTitle}>{t('discountFormulaTitle')}</span>
            <span className={styles.previewText}>{t('discountFormula')}</span>
          </div>
        </>
      ) : (
        <p className={styles.disabledNote}>{t('discountOff')}</p>
      )}
    </section>
  );
}
