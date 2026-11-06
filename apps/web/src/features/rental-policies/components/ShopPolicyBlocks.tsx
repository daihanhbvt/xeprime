'use client';

import { CheckOutlined, DeleteOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Radio, Switch } from 'antd';
import { useState } from 'react';
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
  COLLATERAL_MODE,
  COLLATERAL_MODE_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
  MILEAGE_LIMIT,
  VEHICLE_TYPE,
  type CollateralMode,
  type VehicleType,
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
import { LongTermPackagePreview } from './LongTermPackagePreview';
import { PolicyInfoTip } from './PolicyInfoTip';
import { TurnaroundBufferField } from './TurnaroundBufferField';
import styles from './ShopPolicies.module.css';

/** Form của trang: chính sách theo loại xe + thời gian chết mặc định (hai API, một nút Lưu). */
export type ShopPolicyFormValues = PolicyFormValues & { turnaroundBufferMinutes: number };

type Ctl = Control<ShopPolicyFormValues>;
type SetValue = UseFormSetValue<ShopPolicyFormValues>;
type BooleanField = 'deliveryEnabled' | 'mileageLimitEnabled' | 'overtimeEnabled';

/** Công tắc nối RHF — hàng tiêu đề đã có nhãn nhìn thấy, công tắc mang tên khả truy cập riêng. */
function FormSwitch({
  control,
  name,
  label,
  disabled,
}: {
  control: Ctl;
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

// ── Tài sản thế chấp ─────────────────────────────────────────────────────────

const MODE_DESCRIPTION: Readonly<Record<CollateralMode, 'cash' | 'asset' | 'none'>> = {
  [COLLATERAL_MODE.CASH]: 'cash',
  [COLLATERAL_MODE.ASSET]: 'asset',
  [COLLATERAL_MODE.NONE]: 'none',
};

/**
 * Ba thẻ chế độ bảo đảm (design `23979:96568`) — loại trừ nhau. Chỉ phần của chế độ đang chọn hiện ra:
 * ô tiền cọc (`cash`), danh mục tài sản (`asset`), `none` không có gì để nhập — `formToSaveInput` ép
 * phần còn lại về 0/rỗng, nên một ô mờ còn số cũ sẽ là lời nói dối.
 */
export function CollateralBlock({
  control,
  disabled,
  inheritingVehicles,
  overriddenVehicles,
}: {
  control: Ctl;
  disabled: boolean;
  inheritingVehicles: number;
  overriddenVehicles: number;
}) {
  const t = useTranslations('Shop.policies.workspace.collateral');
  const tPolicy = useTranslations('Shop.policies');
  const tDeposit = useTranslations('Vehicles.pricing.deposit');
  const domainLabel = useDomainLabel();
  const { field } = useController({ control, name: 'collateralMode' });
  const mode = field.value as CollateralMode;

  const description = (value: CollateralMode) => {
    const kind = MODE_DESCRIPTION[value];
    return kind === 'cash'
      ? t('modeCash')
      : kind === 'none'
        ? t('modeNone')
        : tDeposit('modeAsset');
  };

  return (
    <div className={styles.subCard}>
      <h3 className={styles.subTitle}>
        {t('title')}
        <PolicyInfoTip label={tDeposit('tipLabel')}>{tDeposit('hint')}</PolicyInfoTip>
      </h3>

      <Radio.Group
        value={mode}
        disabled={disabled}
        onChange={(event) => field.onChange(event.target.value as CollateralMode)}
        className={styles.modeCards}
        aria-label={t('title')}
      >
        {COLLATERAL_MODE_VALUES.map((value) => (
          <Radio
            key={value}
            value={value}
            className={cx(styles.modeCard, value === mode && styles.modeCardChecked)}
          >
            <span className={styles.modeLabel}>{domainLabel('collateralMode', value)}</span>
            <span className={styles.modeDescription}>{description(value)}</span>
          </Radio>
        ))}
      </Radio.Group>

      {mode === COLLATERAL_MODE.CASH ? (
        <div className={styles.depositRow}>
          <div className={styles.depositField}>
            <NumberField
              control={control}
              name="depositAmount"
              label={tDeposit('amount')}
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
          {inheritingVehicles > 0 || overriddenVehicles > 0 ? (
            <span className={styles.usage}>
              {inheritingVehicles > 0
                ? tPolicy('depositHint', { count: inheritingVehicles })
                : null}
              {overriddenVehicles > 0 ? (
                <PolicyInfoTip label={t('overriddenTipLabel')} placement="bottomRight">
                  {tPolicy('overridden', { count: overriddenVehicles })}
                </PolicyInfoTip>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {mode === COLLATERAL_MODE.ASSET ? (
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
          help={tDeposit('assetTypesHint')}
        />
      ) : null}
    </div>
  );
}

// ── Hạn mức quãng đường · quá giờ ───────────────────────────────────────────

/**
 * Hai thẻ nửa bề ngang (design `23979:96595`). Cả hai là công tắc của FORM: API chỉ biết "null = không
 * áp", nên tắt ⇒ `formToSaveInput` gửi null cả cặp. Ô làm tròn quá giờ đã gỡ — quyết toán làm tròn lên
 * theo giờ, công thức nằm trong ⓘ.
 */
export function LimitBlocks({ control, disabled }: { control: Ctl; disabled: boolean }) {
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
 * 0078). Bán kính tự giao tối đa — design không vẽ — đứng dưới bảng như màn sửa xe (E17).
 */
export function DeliveryBlock({ control, disabled }: { control: Ctl; disabled: boolean }) {
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
                  {index === 0 ? '0' : `>${tiers[index - 1]?.toKm ?? '—'}`}
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
          {/* Phạm vi áp dụng + số xe đang theo: đọc khi cần, không đứng thành hai dải dưới nút. */}
          <PolicyInfoTip label={t('tipLabel')}>
            {tHandover('scopeNote')}
            {inheritingVehicles > 0 ? <> {t('applies', { count: inheritingVehicles })}</> : null}
          </PolicyInfoTip>
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
    </div>
  );
}

// ── Ưu đãi thuê dài hạn ─────────────────────────────────────────────────────

/**
 * Mốc ưu đãi cam kết thời hạn (design `24047:77588`) — chỉ theo % (ADR 0011, như E12 màn sửa xe).
 * Không có công tắc: có mốc = đang bật, xoá hết = tắt (`discountEnabled` đi theo số mốc). Gợi ý giá
 * tháng cụ thể cần giá ngày của MỘT xe nên ở tab Dài hạn của từng xe; công thức nằm trong ⓘ.
 */
export function DiscountBlock({
  control,
  setValue,
  disabled,
  legacyTiers,
  vehicleType,
}: {
  control: Ctl;
  setValue: SetValue;
  disabled: boolean;
  legacyTiers?: readonly { minDays: number; percent: number }[];
  vehicleType: VehicleType;
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
      <ExamplePreview control={control} vehicleType={vehicleType} />
    </div>
  );
}

/**
 * Giá tháng VÍ DỤ của khung xem trước — gian hàng không có một giá chung, nên preview cần một con số
 * để hình dung. Chỉ là trạng thái hiển thị (không lưu, không gửi); chủ xe sửa được ngay trong khung.
 */
const EXAMPLE_MONTHLY_PRICE: Readonly<Record<VehicleType, number>> = {
  [VEHICLE_TYPE.CAR]: 15_000_000,
  [VEHICLE_TYPE.MOTORBIKE]: 3_000_000,
};

function ExamplePreview({ control, vehicleType }: { control: Ctl; vehicleType: VehicleType }) {
  const [monthly, setMonthly] = useState<number | null>(EXAMPLE_MONTHLY_PRICE[vehicleType]);
  const tiers = useWatch({ control, name: 'discountTiers' });
  return <LongTermPackagePreview monthly={monthly} onMonthlyChange={setMonthly} tiers={tiers} />;
}
