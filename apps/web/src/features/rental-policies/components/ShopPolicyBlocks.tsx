'use client';

import {
  CheckOutlined,
  DeleteOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  UnlockOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Checkbox, Radio, Switch } from 'antd';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  useController,
  useFieldArray,
  useFormState,
  useWatch,
  type Control,
  type UseFormSetValue,
} from 'react-hook-form';
import {
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_COMBINATION,
  COLLATERAL_COMBINATION_VALUES,
  COLLATERAL_MODE,
  COLLATERAL_MODE_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
  MILEAGE_LIMIT,
  type CollateralCombination,
  type CollateralMode,
  type RentalTermsGroup,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';

import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SettingRow } from '@/components/form/SettingRow';
import { TextField } from '@/components/form/TextField';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';

import { deliverySummaryText } from '../form';
import type { PolicyFormValues } from '../schema';
import { PolicyInfoTip } from './PolicyInfoTip';
import { TurnaroundBufferField } from './TurnaroundBufferField';
import styles from './ShopPolicies.module.css';

/** Điều khoản thuê của MỘT nhóm dịch vụ trên form trang Chính sách thuê (ADR 0112 điều 3). */
export interface RentalTermsFormGroup {
  termsText: string;
  requireTermsAcceptance: boolean;
}

/**
 * Form của trang: chính sách theo loại xe + thời gian chết mặc định + điều khoản thuê của gian hàng
 * (ba API, một nút Lưu).
 */
export type ShopPolicyFormValues = PolicyFormValues & {
  turnaroundBufferMinutes: number;
  terms: Record<RentalTermsGroup, RentalTermsFormGroup>;
};

type Ctl = Control<ShopPolicyFormValues>;
type SetValue = UseFormSetValue<ShopPolicyFormValues>;
type BooleanField =
  | 'deliveryEnabled'
  | 'mileageLimitEnabled'
  | 'overtimeEnabled'
  | 'collateralCashEnabled'
  | 'collateralAssetEnabled';

/**
 * Các khối dưới đây dùng CHUNG cho trang Chính sách thuê của gian hàng và màn sửa xe (mục "Bảo hiểm
 * & Giao nhận xe", "Dịch vụ xe") - ADR 0112. Form của nơi gọi là một BỘ BAO HÀM `PolicyFormValues`;
 * RHF không suy được tên trường trên kiểu generic, nên quy chiếu MỘT lần ở đây.
 */
function asPolicyControl<T extends PolicyFormValues>(control: Control<T>): Control<PolicyFormValues> {
  return control as unknown as Control<PolicyFormValues>;
}

/** Công tắc nối RHF — hàng tiêu đề đã có nhãn nhìn thấy, công tắc mang tên khả truy cập riêng. */
function FormSwitch({
  control,
  name,
  label,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  name: BooleanField;
  label: string;
  disabled: boolean;
}) {
  const { field } = useController({ control, name });
  return (
    <Switch
      checked={field.value === true}
      onChange={(checked) => field.onChange(checked)}
      disabled={disabled}
      aria-label={label}
    />
  );
}

/** Ẩn hẳn nút thêm/xoá khi phiên hỗ trợ chỉ đọc (ADR 0050 §12) — không vẽ nút mờ. */
function useHideRowControls(disabled: boolean): boolean {
  return useSupportHides(SUPPORT_HIDDEN_AREA.DENIED_ACTIONS) && disabled;
}

// ── Thẻ một mục chính sách ──────────────────────────────────────────────────

/** Công tắc "Áp dụng chính sách của gian hàng" của MỘT mục (ADR 0112 điều 1) - chỉ màn sửa xe. */
export interface PolicyInheritControl {
  /** Mục đang theo gian hàng. */
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Link "chính sách chung" - `null` khi người này không tới được trang đó. */
  policiesHref?: string | null;
}

/**
 * Thẻ trắng của một mục chính sách (design `23874:75957` gian hàng · `24705:27808` sửa xe): tiêu đề,
 * mô tả, nhãn góc phải, và - ở màn sửa xe - hàng công tắc "Áp dụng chính sách của gian hàng" ngay dưới
 * tiêu đề. Cùng một thẻ cho hai màn để chủ xe thấy đúng một khuôn cho một mục.
 */
export function PolicySectionCard({
  id,
  title,
  titleExtra,
  subtitle,
  badge,
  inherit,
  children,
}: {
  id?: string;
  title: ReactNode;
  titleExtra?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  inherit?: PolicyInheritControl;
  children: ReactNode;
}) {
  const t = useTranslations('Shop.policies.workspace.inherit');
  const titleId = useId();
  return (
    <section id={id} className={cx(styles.card, styles.sectionCard)} aria-labelledby={titleId}>
      <header className={styles.sectionHead}>
        <div className={styles.cardHead}>
          <h2 id={titleId} className={styles.cardTitle}>
            {title}
            {titleExtra ? <span className={styles.cardTitleExtra}>{titleExtra}</span> : null}
          </h2>
          {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
        </div>
        {badge ? <span className={styles.sectionBadge}>{badge}</span> : null}
      </header>
      {inherit ? (
        <SettingRow
          title={t('title')}
          description={t.rich('hint', {
            policies: (chunks) =>
              inherit.policiesHref ? (
                <Link href={inherit.policiesHref} className={styles.inheritLink}>
                  {chunks}
                </Link>
              ) : (
                chunks
              ),
          })}
          control={
            <Switch
              aria-label={t('title')}
              checked={inherit.checked}
              disabled={inherit.disabled}
              onChange={inherit.onChange}
            />
          }
        />
      ) : null}
      {children}
    </section>
  );
}

// ── Hình thức cọc xe (Thế chấp) ─────────────────────────────────────────────

/** Mốc gợi ý số tiền cọc (Figma) - bấm chỉ ĐIỀN số, không phải một mức nền tảng áp đặt. */
const DEPOSIT_PRESETS = [3_000_000, 5_000_000, 10_000_000, 15_000_000] as const;

/** "Đang bật 2 hình thức cọc" - nhãn góc phải của thẻ cọc. */
export function CollateralBadge<T extends PolicyFormValues>({ control }: { control: Control<T> }) {
  const t = useTranslations('Shop.policies.workspace.collateral');
  const ctl = asPolicyControl(control);
  const [mode, cash, asset] = useWatch({
    control: ctl,
    name: ['collateralMode', 'collateralCashEnabled', 'collateralAssetEnabled'],
  });
  if (mode !== COLLATERAL_MODE.REQUIRED || !cash || !asset) return null;
  return <>{t('bothOn')}</>;
}

/**
 * Cọc kết hợp (ADR 0112 điều 2 · design `24705:27808`): "Có yêu cầu thế chấp" bật cọc tiền, cọc tài
 * sản hoặc cả hai, kèm "Khách chọn 1 trong 2" / "Bắt buộc cả 2"; "Miễn thế chấp" không hỏi gì. Tắt một
 * hình thức thì ô của nó ẩn đi - `formToSaveInput` gửi 0 / rỗng cho hình thức đang tắt.
 */
export function CollateralBlock<T extends PolicyFormValues>({
  control: outerControl,
  disabled,
  usage,
}: {
  control: Control<T>;
  disabled: boolean;
  /** Dòng "N xe đang theo mặc định này" của trang gian hàng - đứng dưới ô tiền cọc. */
  usage?: ReactNode;
}) {
  const control = asPolicyControl(outerControl);
  const t = useTranslations('Shop.policies.workspace.collateral');
  const tDeposit = useTranslations('Vehicles.pricing.deposit');
  const tUnits = useTranslations('Common.units');
  const domainLabel = useDomainLabel();
  const { field: modeField } = useController({ control, name: 'collateralMode' });
  const { field: cashField, fieldState: cashState } = useController({
    control,
    name: 'collateralCashEnabled',
  });
  const { field: assetField } = useController({ control, name: 'collateralAssetEnabled' });
  const { field: comboField } = useController({ control, name: 'collateralCombination' });
  const { field: amountField } = useController({ control, name: 'depositAmount' });
  const mode = modeField.value as CollateralMode;
  const cash = cashField.value === true;
  const asset = assetField.value === true;
  const both = cash && asset;

  const selectMode = (next: CollateralMode) => {
    modeField.onChange(next);
    // Chuyển sang "Có yêu cầu" mà chưa bật hình thức nào ⇒ bật cọc tiền (thứ phổ biến nhất).
    if (next === COLLATERAL_MODE.REQUIRED && !cash && !asset) cashField.onChange(true);
  };
  const toggle = (which: 'cash' | 'asset', next: boolean) => {
    (which === 'cash' ? cashField : assetField).onChange(next);
    // "Bắt buộc cả 2" chỉ có nghĩa khi cả hai bật.
    if (!next) comboField.onChange(COLLATERAL_COMBINATION.ANY_ONE);
  };

  const modeIcon = (value: CollateralMode) =>
    value === COLLATERAL_MODE.REQUIRED ? (
      <SafetyCertificateOutlined aria-hidden="true" />
    ) : (
      <UnlockOutlined aria-hidden="true" />
    );

  return (
    <div className={styles.blockStack}>
      <Radio.Group
        value={mode}
        disabled={disabled}
        onChange={(event) => selectMode(event.target.value as CollateralMode)}
        className={styles.modeCards}
        aria-label={t('modeLabel')}
      >
        {COLLATERAL_MODE_VALUES.map((value) => (
          <Radio
            key={value}
            value={value}
            className={cx(styles.modeCard, value === mode && styles.modeCardChecked)}
          >
            <span className={styles.modeLabel}>
              <span className={styles.modeIcon}>{modeIcon(value)}</span>
              {domainLabel('collateralMode', value)}
            </span>
            <span className={styles.modeDescription}>
              {value === COLLATERAL_MODE.REQUIRED ? t('modeRequired') : t('modeNone')}
            </span>
          </Radio>
        ))}
      </Radio.Group>

      {mode === COLLATERAL_MODE.REQUIRED ? (
        <>
          <div className={styles.methodHead}>
            <span className={styles.methodTitle}>{t('methodTitle')}</span>
            {/* Chip viên thuốc (Figma `24729:80545`) - chỉ chọn được khi bật cả hai hình thức. */}
            <div className={styles.comboSwitch} role="radiogroup" aria-label={t('methodTitle')}>
              {COLLATERAL_COMBINATION_VALUES.map((value) => {
                const active =
                  (both ? (comboField.value as CollateralCombination) : COLLATERAL_COMBINATION.ANY_ONE) ===
                  value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled || !both}
                    className={cx(styles.comboChip, active && styles.comboChipActive)}
                    onClick={() => comboField.onChange(value)}
                  >
                    {domainLabel('collateralCombination', value)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.methodCards}>
            <div className={cx(styles.methodCard, cash && styles.methodCardOn)}>
              <div className={styles.methodCardHead}>
                <div className={styles.methodText}>
                  <span className={styles.methodName}>{t('cashTitle')}</span>
                  <span className={styles.methodHint}>{t('cashHint')}</span>
                </div>
                <Checkbox
                  checked={cash}
                  disabled={disabled}
                  onChange={(event) => toggle('cash', event.target.checked)}
                  aria-label={t('cashTitle')}
                />
              </div>
              {cash ? (
                <>
                  <div className={styles.depositField}>
                    <NumberField
                      control={control}
                      name="depositAmount"
                      label={t('amountLabel')}
                      labelAccessory={
                        <PolicyInfoTip label={tDeposit('amountTipLabel')}>
                          {tDeposit('amountHint')}
                        </PolicyInfoTip>
                      }
                      money
                      required
                      min={0}
                      disabled={disabled}
                    />
                  </div>
                  <div className={styles.presets} role="group" aria-label={t('presetsLabel')}>
                    {DEPOSIT_PRESETS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className={cx(
                          styles.preset,
                          Number(amountField.value) === amount && styles.presetActive,
                        )}
                        disabled={disabled}
                        onClick={() => amountField.onChange(amount)}
                      >
                        {tUnits('millionShort', { count: amount / 1_000_000 })}
                      </button>
                    ))}
                  </div>
                  {usage ? <span className={styles.usage}>{usage}</span> : null}
                </>
              ) : null}
            </div>

            <div className={cx(styles.methodCard, asset && styles.methodCardOn)}>
              <div className={styles.methodCardHead}>
                <div className={styles.methodText}>
                  <span className={styles.methodName}>{t('assetTitle')}</span>
                  <span className={styles.methodHint}>{t('assetHint')}</span>
                </div>
                <Checkbox
                  checked={asset}
                  disabled={disabled}
                  onChange={(event) => toggle('asset', event.target.checked)}
                  aria-label={t('assetTitle')}
                />
              </div>
              {asset ? (
                <CheckboxGroupField
                  control={control}
                  name="collateralAssetTypes"
                  label={tDeposit('assetTypes')}
                  options={COLLATERAL_ASSET_TYPE_VALUES.map((value) => ({
                    value,
                    label: domainLabel('collateralAssetType', value),
                  }))}
                  disabled={disabled}
                  required
                />
              ) : null}
            </div>
          </div>
          {cashState.error?.message ? (
            <span className={styles.tableError} role="alert">
              <WarningOutlined aria-hidden="true" /> {cashState.error.message}
            </span>
          ) : null}
        </>
      ) : (
        <Alert
          type="success"
          showIcon
          title={t('noneBadgeTitle')}
          description={t('noneBadgeBody')}
        />
      )}
    </div>
  );
}

// ── Hạn mức quãng đường · quá giờ ───────────────────────────────────────────

/**
 * Hai thẻ nửa bề ngang (design `23979:96595`). Cả hai là công tắc của FORM: API chỉ biết "null = không
 * áp", nên tắt ⇒ `formToSaveInput` gửi null cả cặp. Ô làm tròn quá giờ đã gỡ — quyết toán làm tròn lên
 * theo giờ, công thức nằm trong ⓘ.
 */
export function LimitBlocks<T extends PolicyFormValues>({
  control: outerControl,
  disabled,
}: {
  control: Control<T>;
  disabled: boolean;
}) {
  const control = asPolicyControl(outerControl);
  const t = useTranslations('Shop.policies.workspace');
  const tMileage = useTranslations('Vehicles.pricing.mileage');
  const tOvertime = useTranslations('Vehicles.pricing.overtime');
  const fmt = useAppFormat();
  const mileageOn = useWatch({ control, name: 'mileageLimitEnabled' });
  const overtimeOn = useWatch({ control, name: 'overtimeEnabled' });
  const includedKm = useWatch({ control, name: 'includedDistanceKmPerDay' });
  const feePerKm = useWatch({ control, name: 'excessDistanceFeePerKm' });
  const feePerHour = useWatch({ control, name: 'overtimeFeePerHour' });

  const mileagePreview =
    includedKm != null && feePerKm != null
      ? tMileage('preview', { km: fmt.km(includedKm), fee: fmt.money(String(feePerKm)) })
      : tMileage('previewIncomplete');
  const formula =
    feePerHour != null
      ? tOvertime('formulaRounded', { fee: fmt.money(String(feePerHour)) })
      : tOvertime('formulaNone');

  return (
    <div className={styles.halfGrid}>
      <SettingRow
        boxed
        title={tMileage('title')}
        titleExtra={
          <PolicyInfoTip label={tMileage('tipLabel')}>
            {tMileage('hint')} <strong>{tMileage('previewTitle')}</strong> {mileagePreview}
          </PolicyInfoTip>
        }
        description={t('mileage.hint')}
        control={
          <FormSwitch
            control={control}
            name="mileageLimitEnabled"
            label={tMileage('title')}
            disabled={disabled}
          />
        }
      >
        {mileageOn ? (
          <div className={styles.pairFields}>
            <NumberField
              control={control}
              name="includedDistanceKmPerDay"
              label={tMileage('includedLabel')}
              labelAccessory={
                <PolicyInfoTip label={tMileage('includedTipLabel')}>
                  {tMileage('includedHint')}
                </PolicyInfoTip>
              }
              addonAfter={tMileage('unitPerDay')}
              min={MILEAGE_LIMIT.minKmPerDay}
              max={MILEAGE_LIMIT.maxKmPerDay}
              required
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="excessDistanceFeePerKm"
              label={tMileage('excessLabel')}
              labelAccessory={
                <PolicyInfoTip label={tMileage('excessTipLabel')}>
                  {tMileage('excessHint')}
                </PolicyInfoTip>
              }
              money
              addonAfter={tMileage('unitPerKm')}
              min={0}
              max={MILEAGE_LIMIT.maxFeePerKm}
              required
              disabled={disabled}
            />
          </div>
        ) : null}
      </SettingRow>

      <SettingRow
        boxed
        title={t('overtime.title')}
        titleExtra={
          <PolicyInfoTip label={tOvertime('tipLabel')}>
            {tOvertime('hintRounded')} <strong>{tOvertime('formulaTitle')}</strong> {formula}
          </PolicyInfoTip>
        }
        description={t('overtime.hint')}
        control={
          <FormSwitch
            control={control}
            name="overtimeEnabled"
            label={t('overtime.title')}
            disabled={disabled}
          />
        }
      >
        {overtimeOn ? (
          <div className={styles.pairFields}>
            <NumberField
              control={control}
              name="overtimeFeePerHour"
              label={tOvertime('feePerHour')}
              labelAccessory={
                <PolicyInfoTip label={tOvertime('feePerHourTipLabel')}>
                  {tOvertime('feePerHourHint')}
                </PolicyInfoTip>
              }
              money
              addonAfter={tOvertime('unitPerHour')}
              min={0}
              required
              disabled={disabled}
            />
            <NumberField
              control={control}
              name="overtimeGraceMinutes"
              label={t('overtime.grace')}
              labelAccessory={
                <PolicyInfoTip label={tOvertime('graceMinutesTipLabel')}>
                  {tOvertime('graceMinutesHint')}
                </PolicyInfoTip>
              }
              addonAfter={tOvertime('unitMinutes')}
              min={0}
              placeholder={tOvertime('placeholder')}
              disabled={disabled}
            />
          </div>
        ) : null}
      </SettingRow>
    </div>
  );
}

// ── Giao nhận xe ────────────────────────────────────────────────────────────

type TierErrors = { root?: { message?: string }; message?: string } | undefined;

/**
 * "Dịch vụ giao nhận xe tận nơi" (design `24047:77366`): bảng Từ · Đến · Phí áp dụng · Thao tác. Ô sửa
 * thẳng trong bảng (không chế độ bút chì/✓✗ từng dòng — chốt 06/11); mỗi bậc MỘT phí trọn gói (ADR
 * 0078). Bán kính tự giao tối đa — design không vẽ — đứng dưới bảng.
 */
export function DeliveryBlock<T extends PolicyFormValues>({
  control: outerControl,
  disabled,
}: {
  control: Control<T>;
  disabled: boolean;
}) {
  const control = asPolicyControl(outerControl);
  const t = useTranslations('Shop.policies.workspace.delivery');
  const tDelivery = useTranslations('Vehicles.pricing.delivery');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const radius = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const { errors } = useFormState({ control, name: ['deliveryTiers', 'deliveryMaxRadiusKm'] });
  const { fields, append, remove } = useFieldArray({ control, name: 'deliveryTiers' });
  const hideControls = useHideRowControls(disabled);

  const tierErrors = errors.deliveryTiers as TierErrors;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;
  const complete = tiers.length > 0 && tiers.every((tier) => tier?.toKm != null) && radius != null;
  const summary = complete
    ? deliverySummaryText(
        { deliveryTiers: tiers, deliveryMaxRadiusKm: radius },
        { money: fmt.money, free: tDelivery('free'), quote: tDelivery('summaryQuote') },
      )
    : null;

  return (
    <SettingRow
      size="lg"
      title={t('serviceTitle')}
      titleExtra={
        <PolicyInfoTip label={tDelivery('tipLabel')}>
          {tDelivery('hint')}
          {summary ? (
            <>
              {' '}
              <strong>{tDelivery('previewTitle')}</strong> {summary}
            </>
          ) : null}
        </PolicyInfoTip>
      }
      description={t('serviceHint')}
      control={
        <FormSwitch
          control={control}
          name="deliveryEnabled"
          label={t('serviceTitle')}
          disabled={disabled}
        />
      }
    >
      {enabled ? (
        <>
          <div className={styles.table} role="group" aria-label={tDelivery('tiers')}>
            <div className={cx(styles.tableHead, styles.deliveryGrid)} aria-hidden="true">
              <span>{t('from')}</span>
              <span>{t('to')}</span>
              <span>{t('fee')}</span>
              <span className={styles.actionHead}>{tLabels('actions')}</span>
            </div>
            {fields.length === 0 ? <p className={styles.tableEmpty}>{t('empty')}</p> : null}
            {fields.map((field, index) => (
              <div key={field.id} className={cx(styles.tableRow, styles.deliveryGrid)}>
                <span className={styles.fromCell}>
                  {index === 0 ? '0' : `>${tiers[index - 1]?.toKm ?? '-'}`}
                </span>
                <NumberField
                  control={control}
                  name={`deliveryTiers.${index}.toKm`}
                  label={tDelivery('tierToLabel', { index: index + 1 })}
                  addonAfter={tDelivery('unitKm')}
                  min={0}
                  disabled={disabled}
                />
                <NumberField
                  control={control}
                  name={`deliveryTiers.${index}.fee`}
                  label={tDelivery('tierFeeLabel', { index: index + 1 })}
                  money
                  disabled={disabled}
                />
                <span className={styles.actionCell}>
                  {hideControls ? null : (
                    <Button
                      type="text"
                      icon={<DeleteOutlined aria-hidden="true" />}
                      aria-label={tDelivery('removeTierAt', { index: index + 1 })}
                      onClick={() => remove(index)}
                      disabled={disabled}
                    />
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.tableFooter}>
            {hideControls ? (
              <span />
            ) : (
              <Button
                type="link"
                className={styles.addButton}
                icon={<PlusOutlined aria-hidden="true" />}
                onClick={() => append({ toKm: null, fee: null })}
                disabled={disabled}
              >
                {tDelivery('addTier')}
              </Button>
            )}
            {crossError ? (
              <span className={styles.tableError} role="alert">
                <WarningOutlined aria-hidden="true" /> {crossError}
              </span>
            ) : complete ? (
              <span className={styles.tableOk}>
                <CheckOutlined aria-hidden="true" /> {t('ok')}
              </span>
            ) : null}
          </div>

          <div className={styles.radiusField}>
            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              label={tDelivery('maxRadiusLabel')}
              labelAccessory={
                <PolicyInfoTip label={tDelivery('maxRadiusTipLabel')}>
                  {tDelivery('maxRadiusHint')}
                </PolicyInfoTip>
              }
              addonAfter={tDelivery('unitKm')}
              min={0}
              required
              disabled={disabled}
            />
          </div>
        </>
      ) : null}
    </SettingRow>
  );
}

/** "Thời gian chết giữa hai chuyến" — mặc định gian hàng theo loại xe (06/11/2026). */
export function TurnaroundBlock({
  control,
  disabled,
  inheritingVehicles,
}: {
  control: Ctl;
  disabled: boolean;
  inheritingVehicles: number;
}) {
  const t = useTranslations('Shop.policies.workspace.turnaround');
  const tHandover = useTranslations('VehicleManage.handover');
  return (
    <div className={styles.turnaround}>
      <div className={styles.turnaroundHead}>
        <h3 className={styles.blockTitle}>
          {t('title')}
          {/* Số xe đang theo mặc định: đọc khi cần. Phạm vi áp dụng đứng thành dải ngay dưới ô. */}
          {inheritingVehicles > 0 ? (
            <PolicyInfoTip label={t('tipLabel')}>
              {t('applies', { count: inheritingVehicles })}
            </PolicyInfoTip>
          ) : null}
        </h3>
        <p className={styles.blockHint}>{t('hint')}</p>
      </div>
      <TurnaroundBufferField
        control={control}
        name="turnaroundBufferMinutes"
        label={t('title')}
        disabled={disabled}
        notice={false}
      />
      <Alert type="info" title={tHandover('scopeNote')} />
    </div>
  );
}

// ── Ưu đãi thuê dài hạn ─────────────────────────────────────────────────────

/**
 * Mốc ưu đãi cam kết thời hạn (design `24047:77588`) — chỉ theo % (ADR 0011, như E12 màn sửa xe).
 * Không có công tắc: có mốc = đang bật, xoá hết = tắt (`discountEnabled` đi theo số mốc). Gợi ý giá
 * tháng cụ thể cần giá ngày của MỘT xe nên ở tab Dài hạn của từng xe; công thức ở hộp dưới bảng.
 */
export function DiscountBlock({
  control,
  setValue,
  disabled,
  legacyTiers,
}: {
  control: Ctl;
  setValue: SetValue;
  disabled: boolean;
  legacyTiers?: readonly { minDays: number; percent: number }[];
}) {
  const t = useTranslations('Shop.policies.workspace.longTerm');
  const tDiscount = useTranslations('Vehicles.pricing.longTermDiscount');
  const tLabels = useTranslations('Common.labels');
  const tUnits = useTranslations('Common.units');
  const enabled = useWatch({ control, name: 'discountEnabled' });
  const tiers = useWatch({ control, name: 'discountTiers' }) ?? [];
  const { errors } = useFormState({ control, name: 'discountTiers' });
  const { fields, append, remove } = useFieldArray({ control, name: 'discountTiers' });
  const hideControls = useHideRowControls(disabled);

  const optionsFor = (index: number) =>
    LONG_TERM_PACKAGE_MONTHS.filter(
      (month) =>
        month === tiers[index]?.minMonths || !tiers.some((tier) => tier?.minMonths === month),
    ).map((month) => ({ value: String(month), label: tUnits('month', { count: month }) }));
  const nextUnused =
    LONG_TERM_PACKAGE_MONTHS.find((month) => !tiers.some((tier) => tier?.minMonths === month)) ??
    null;
  const tierErrors = errors.discountTiers as TierErrors;
  const crossError = tierErrors?.root?.message ?? tierErrors?.message;

  // Có mốc ⇔ đang bật — một nguồn sự thật cho cờ mà màn này không còn vẽ công tắc.
  const syncEnabled = (count: number) =>
    setValue('discountEnabled', count > 0, { shouldDirty: true, shouldValidate: false });

  return (
    <div className={styles.discountLayout}>
      <div className={styles.discountSettings}>
        {!enabled && tiers.length > 0 ? (
          <Alert type="warning" showIcon title={t('inactive')} />
        ) : null}

        <div className={styles.table} role="group" aria-label={tDiscount('tiers')}>
          <div className={cx(styles.tableHead, styles.discountGrid)}>
            <span className={styles.headWithTip}>
              {tDiscount('packageLabel')}
              <PolicyInfoTip label={tDiscount('packageTipLabel')}>
                {tDiscount('packageTip')}
              </PolicyInfoTip>
            </span>
            <span className={styles.headWithTip}>
              {tDiscount('percentLabel')}
              <PolicyInfoTip label={tDiscount('percentTipLabel')}>
                {tDiscount('percentTip')}
              </PolicyInfoTip>
            </span>
            <span className={styles.headWithTip}>
              {tDiscount('tierNote')}
              <PolicyInfoTip label={tDiscount('noteTipLabel')}>
                {tDiscount('noteTip')}
              </PolicyInfoTip>
            </span>
            <span className={styles.actionHead}>{tLabels('actions')}</span>
          </div>
          {fields.length === 0 ? <p className={styles.tableEmpty}>{t('empty')}</p> : null}
          {fields.map((field, index) => (
            <div key={field.id} className={cx(styles.tableRow, styles.discountGrid)}>
              <SelectField
                control={control}
                name={`discountTiers.${index}.minMonths`}
                label={tDiscount('tierMonthsLabel', { index: index + 1 })}
                options={optionsFor(index)}
                placeholder={tDiscount('selectPackage')}
                disabled={disabled}
              />
              <NumberField
                control={control}
                name={`discountTiers.${index}.percent`}
                label={tDiscount('tierPercentLabel', { index: index + 1 })}
                percent
                disabled={disabled}
              />
              <TextField
                control={control}
                name={`discountTiers.${index}.note`}
                label={tDiscount('tierNoteLabel', { index: index + 1 })}
                placeholder={tDiscount('notePlaceholder')}
                disabled={disabled}
              />
              <span className={styles.actionCell}>
                {hideControls ? null : (
                  <Button
                    type="text"
                    icon={<DeleteOutlined aria-hidden="true" />}
                    aria-label={tDiscount('removeTierAt', { index: index + 1 })}
                    onClick={() => {
                      remove(index);
                      syncEnabled(fields.length - 1);
                    }}
                    disabled={disabled}
                  />
                )}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.tableFooter}>
          {hideControls ? (
            <span />
          ) : (
            <Button
              type="link"
              className={styles.addButton}
              icon={<PlusOutlined aria-hidden="true" />}
              disabled={disabled || nextUnused == null}
              onClick={() => {
                append({ minMonths: nextUnused, percent: null, note: '' });
                syncEnabled(fields.length + 1);
              }}
            >
              {tDiscount('addTier')}
            </Button>
          )}
          {crossError ? (
            <span className={styles.tableError} role="alert">
              <WarningOutlined aria-hidden="true" /> {crossError}
            </span>
          ) : null}
        </div>

        {legacyTiers?.length ? (
          <Alert
            type="warning"
            showIcon
            title={tDiscount('legacyTitle', { count: legacyTiers.length })}
            description={
              <>
                <span>
                  {legacyTiers
                    .map((tier) =>
                      tDiscount('legacyTier', { days: tier.minDays, percent: tier.percent }),
                    )
                    .join(LIST_SEPARATOR)}
                </span>
                <br />
                <span>{tDiscount('legacyBody')}</span>
              </>
            }
          />
        ) : null}
      </div>
      {/* Figma `23874:75957`: không có khung xem trước - chỉ hộp công thức dưới bảng mốc. */}
      <div className={styles.formulaCard}>
        <span className={styles.formulaTitle}>{tDiscount('formulaTitle')}</span>
        <span className={styles.formulaText}>{tDiscount('formula')}</span>
      </div>
    </div>
  );
}

