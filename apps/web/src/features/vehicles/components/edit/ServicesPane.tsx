'use client';

import { ArrowRightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Switch, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import {
  LONG_TERM_PACKAGE_MONTHS,
  MIN_RENTAL_MINUTES_RANGE,
  POLICY_SECTION,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SUPPORT_CAPABILITY,
  VEHICLE_SERVICE_SETTING_SERVICES,
  isRouteType,
  type ServiceType,
} from '@xeprime/types';

import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { LoadingState } from '@/components/feedback/LoadingState';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/constants/routes';
import { useBranchCrumb } from '@/features/branches/hooks/use-branch-return';
import { WithDriverWageNote } from '@/features/drivers/components/WithDriverWageNote';
import { policyCollateral, useDescribeCollateral } from '@/features/rental-policies/collateral-text';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { LimitBlocks } from '@/features/rental-policies/components/ShopPolicyBlocks';
import {
  POLICY_BLOCK,
  PolicyFlatLayout,
  PolicySections,
} from '@/features/rental-policies/components/PolicySections';
import {
  CalendarPriceLink,
  DirectDiscountEditor,
  LongTermPriceHintLive,
} from '@/features/rental-policies/components/PricingParts';
import type { VehiclePricingFormApi } from '@/features/rental-policies/hooks/use-vehicle-pricing-form';
import type { VehiclePricingFormValues } from '@/features/rental-policies/schema';
import type { VehiclePricing } from '@/features/rental-policies/types';
import {
  SUPPORT_HIDDEN_AREA,
  supportAllowsVehicleTab,
  useSupportCan,
  useSupportHides,
  useSupportSession,
} from '@/features/tenant-support/support-session';
import {
  usePatchVehicleServiceSetting,
  useVehicleServiceSettings,
} from '@/features/vehicle-manage/hooks';
import { useAutoAcceptToggle } from '@/features/vehicle-manage/hooks/use-auto-accept-toggle';
import { useServiceToggle } from '@/features/vehicle-manage/hooks/use-service-toggle';
import type { VehicleServiceSetting } from '@/features/vehicle-manage/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';

import { vehicleSchedulePath } from '../../calendar-link';
import type { VehicleDetail } from '../../types';
import { SERVICE_TABS, serviceOfTab } from '../vehicle-edit-nav';
import { CatalogRentHintFor } from '../CatalogSuggestions';
import { EditCard, EditToggleRow as ToggleRow } from './EditCard';
import { useEditForm } from './edit-actions';
import { PricingForm } from './PricingForm';
import { VehiclePolicySection } from './VehiclePolicySection';
import styles from './EditPanes.module.css';

const HOUR = 60;

/**
 * Ô của form giá thuộc tab nào — lưu trượt vì một ô lỗi ở tab khác thì mở tab đó ra. Ô không có ở
 * đây thuộc mục "Chính sách thuê" (cùng một lệnh lưu trọn gói) — lúc đó chỉ nhắc mở mục kia.
 */
const FIELD_TAB: Readonly<Record<string, VehicleEditTab>> = {
  weekdayPrice: VEHICLE_EDIT_TAB.SELF_DRIVE,
  weekendPrice: VEHICLE_EDIT_TAB.SELF_DRIVE,
  hourlyPrice: VEHICLE_EDIT_TAB.SELF_DRIVE,
  discountPercent: VEHICLE_EDIT_TAB.SELF_DRIVE,
  withDriverDailyPrice: VEHICLE_EDIT_TAB.WITH_DRIVER,
  withDriverInterCityPrice: VEHICLE_EDIT_TAB.WITH_DRIVER,
  withDriverOneWayPrice: VEHICLE_EDIT_TAB.WITH_DRIVER,
  monthlyPrice: VEHICLE_EDIT_TAB.LONG_TERM,
  mileageLimitEnabled: VEHICLE_EDIT_TAB.SELF_DRIVE,
  includedDistanceKmPerDay: VEHICLE_EDIT_TAB.SELF_DRIVE,
  excessDistanceFeePerKm: VEHICLE_EDIT_TAB.SELF_DRIVE,
  overtimeEnabled: VEHICLE_EDIT_TAB.SELF_DRIVE,
  overtimeFeePerHour: VEHICLE_EDIT_TAB.SELF_DRIVE,
  overtimeGraceMinutes: VEHICLE_EDIT_TAB.SELF_DRIVE,
  discountEnabled: VEHICLE_EDIT_TAB.LONG_TERM,
  discountTiers: VEHICLE_EDIT_TAB.LONG_TERM,
};

interface ServicesPaneProps {
  vehicle: VehicleDetail;
  tab: VehicleEditTab;
  canUpdate: boolean;
  onTab: (tab: VehicleEditTab) => void;
  /** Mở mục Chính sách thuê — `undefined` khi người này không tới được mục đó. */
  onOpenPolicy?: () => void;
}

/**
 * Mục "Dịch vụ & giá" (design `23713:21048` tự lái · `23716:27912` có tài xế · `23716:29056` dài
 * hạn).
 *
 * Mỗi tab: công tắc dịch vụ (lưu ngay, cùng hook với menu cũ) · "Tự động đồng ý nhận chuyến" (lưu
 * ngay) · giá + khuyến mãi của dịch vụ đó. Giá là MỘT form cho cả ba tab (đổi tab không mất gì đang
 * gõ) và lưu bằng nút ở cột phải, cùng lần với thiết lập riêng của có tài xế.
 *
 * Lệch design có chủ đích (sổ cái §3.6): khuyến mãi chỉ ở Tự lái và chỉ theo % (ADR 0011); không
 * có phụ phí tài xế (ADR 0075); cọc · km · quá giờ · giao xe áp cho CẢ XE nên ở mục "Chính sách
 * thuê" cùng công tắc chính sách gian hàng (03/11/2026); nhãn giá giữ "Giá ngày thường".
 *
 * Phiên hỗ trợ (ADR 0050 §13): không có công tắc dịch vụ, không có giá/chính sách (khu tiền) — chỉ
 * tự nhận chuyến và thiết lập vận hành của có tài xế, theo capability của phiên.
 */
export function ServicesPane(props: ServicesPaneProps) {
  const t = useTranslations('Vehicles.editor.services');
  const { message } = App.useApp();
  const support = useSupportSession();
  const pricingAllowed = supportAllowsVehicleTab(support, VEHICLE_EDIT_TAB.PRICING);

  if (!pricingAllowed) return <ServicesBody {...props} priced={null} pricingState={null} />;
  return (
    <PricingForm
      vehicle={props.vehicle}
      onInvalid={(fields) => {
        const target = fields.map((field) => FIELD_TAB[field]).find(Boolean);
        if (target) {
          if (target !== props.tab) props.onTab(target);
        } else if (fields.length > 0) {
          message.warning(t('policyInvalid'));
        }
      }}
    >
      {(priced, pricingState) => (
        <ServicesBody {...props} priced={priced} pricingState={pricingState} />
      )}
    </PricingForm>
  );
}

function ServicesBody({
  vehicle,
  tab,
  canUpdate,
  onTab,
  onOpenPolicy,
  priced,
  pricingState,
}: ServicesPaneProps & {
  priced: { api: VehiclePricingFormApi; pricing: VehiclePricing } | null;
  /** Khung tải / lỗi của giá — đứng đúng chỗ các thẻ giá khi giá chưa có. */
  pricingState: ReactNode;
}) {
  const t = useTranslations('Vehicles.editor.services');
  const tPricing = useTranslations('Vehicles.pricing');
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const tManage = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const support = useSupportSession();
  const canOperate = useSupportCan(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
  const { isManage, paths } = useWorkspace();
  const branchCrumb = useBranchCrumb();
  const settings = useVehicleServiceSettings(vehicle.id);

  const canToggle = canUpdate && !support;
  const toggle = useServiceToggle(vehicle, canToggle);
  const services = vehicle.serviceTypes ?? [];
  const service = serviceOfTab(tab) ?? SERVICE_TYPE.SELF_DRIVE;
  const serviceOn = services.includes(service);
  /*
   * Tab nào có mặt: ngoài phiên — cả ba (dịch vụ tắt vẫn bật lên được ngay tại đây). Trong phiên
   * hỗ trợ — chỉ dịch vụ có thiết lập vận hành mà phiên được sửa (dài hạn không có).
   */
  const visibleTabs = SERVICE_TABS.filter(
    (entry) =>
      !support ||
      (supportAllowsVehicleTab(support, entry.tab) &&
        (VEHICLE_SERVICE_SETTING_SERVICES as readonly string[]).includes(entry.service)),
  );
  const setting = settings.data?.find((item) => item.serviceType === service);
  const withDriverSetting = settings.data?.find(
    (item) => item.serviceType === SERVICE_TYPE.WITH_DRIVER,
  );
  const hasSetting = (VEHICLE_SERVICE_SETTING_SERVICES as readonly string[]).includes(service);
  const calendarHref = vehicleSchedulePath(vehicle, {
    basePath: paths.calendar,
    branchId: branchCrumb,
  });

  const api = priced?.api ?? null;
  const control = api?.form.control as Control<VehiclePricingFormValues> | undefined;
  const disabled = !canUpdate;

  return (
    <Form component={false} layout="vertical" colon={false} disabled={disabled}>
      <div className={styles.stack}>
        <div className={styles.serviceTabs} role="tablist" aria-label={t('tabsLabel')}>
          {visibleTabs.map((entry) => {
            const on = services.includes(entry.service);
            const active = entry.tab === tab;
            return (
              <button
                key={entry.tab}
                type="button"
                role="tab"
                aria-selected={active}
                className={cx(styles.serviceTab, active && styles.serviceTabActive)}
                onClick={() => onTab(entry.tab)}
              >
                {t(`tabs.${entry.service}`)}
                <span
                  className={cx(styles.serviceDot, on && styles.serviceDotOn)}
                  role="img"
                  aria-label={on ? t('on') : t('off')}
                />
              </button>
            );
          })}
        </div>

        <EditCard>
          <div className={styles.toggleRows}>
            <ToggleRow
              title={t(`toggle.${service}.title`)}
              hint={t.rich('toggle.hint', {
                service: t(`toggle.${service}.target`),
                conditions: (chunks) =>
                  onOpenPolicy ? (
                    <button type="button" className={styles.linkButton} onClick={onOpenPolicy}>
                      {chunks}
                    </button>
                  ) : (
                    chunks
                  ),
              })}
              control={
                canToggle ? (
                  <Tooltip title={toggle.blockedReason(service, !serviceOn) ?? undefined}>
                    <Switch
                      aria-label={t(`toggle.${service}.title`)}
                      checked={serviceOn}
                      loading={toggle.pending}
                      disabled={Boolean(toggle.blockedReason(service, !serviceOn))}
                      onChange={(next) => toggle.toggle(service, next)}
                    />
                  </Tooltip>
                ) : (
                  <span className={styles.toggleHint}>{serviceOn ? t('on') : t('off')}</span>
                )
              }
            />
            {/* Có tài xế không tự nhận (19/11/2026) - không có công tắc, chỉ tự lái mới có. */}
            {serviceOn && hasSetting && service === SERVICE_TYPE.SELF_DRIVE ? (
              settings.isLoading ? (
                <LoadingState variant="inline" />
              ) : settings.isError ? (
                <Alert
                  type="error"
                  showIcon
                  title={tManage('common.loadError')}
                  action={
                    <Button size="small" onClick={() => void settings.refetch()}>
                      {tActions('retry')}
                    </Button>
                  }
                />
              ) : setting ? (
                <AutoAcceptRow
                  vehicleId={vehicle.id}
                  setting={setting}
                  canEdit={canUpdate && canOperate}
                />
              ) : null
            ) : null}
          </div>
        </EditCard>

        {!serviceOn ? (
          <p className={styles.note}>{t('offNote')}</p>
        ) : (
          <>
            {pricingState}
            {control && service === SERVICE_TYPE.SELF_DRIVE ? (
              <>
                <EditCard title={t('price.titlePromo')}>
                  <div className={styles.priceRow}>
                    <PriceField control={control} name="weekdayPrice" label="weekday" required />
                    <PriceField control={control} name="weekendPrice" label="weekend" />
                    <PriceField control={control} name="hourlyPrice" label="hourly" perHour />
                  </div>
                  <CatalogRentHintFor
                    modelId={vehicle.vehicleCatalogModelId}
                    variantId={vehicle.vehicleCatalogVariantId}
                    year={vehicle.manufactureYear}
                    vehicleId={vehicle.id}
                    field="weekdayPrice"
                    onApply={(price) =>
                      api!.form.setValue('weekdayPrice', price, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                  <DirectDiscountEditor control={control} setValue={api!.form.setValue} />
                  <CalendarPriceLink
                    href={calendarHref}
                    hint={tPricing('calendarHint')}
                    label={tPricing('calendarLink')}
                  />
                </EditCard>
                {/*
                  Hạn mức km + phụ phí quá giờ (ADR 0112 điều 4): áp cho chuyến tự lái, công tắc kế
                  thừa gian hàng của RIÊNG mục này. Dưới cùng là hình thức cọc đang áp, dẫn sang mục
                  Bảo hiểm & Giao nhận - nơi đặt nó.
                */}
                <VehiclePolicySection
                  api={api!}
                  section={POLICY_SECTION.USAGE_LIMITS}
                  canUpdate={canUpdate}
                  title={tWorkspace('limits.title')}
                >
                  {(binding) => (
                    <>
                      <LimitBlocks control={binding.control} disabled={binding.disabled} />
                      <CollateralStrip api={api!} onOpenPolicy={onOpenPolicy} />
                    </>
                  )}
                </VehiclePolicySection>
              </>
            ) : null}

            {service === SERVICE_TYPE.WITH_DRIVER ? (
              <>
                {control ? (
                  <EditCard title={t('price.title')}>
                    <WithDriverPriceReminder control={control} />
                    <CatalogRentHintFor
                      modelId={vehicle.vehicleCatalogModelId}
                      variantId={vehicle.vehicleCatalogVariantId}
                      year={vehicle.manufactureYear}
                      vehicleId={vehicle.id}
                      field="withDriverDailyPrice"
                      onApply={(price) =>
                        api!.form.setValue('withDriverDailyPrice', price, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                    <div className={styles.priceRow}>
                      <PriceField control={control} name="withDriverDailyPrice" label="daily" />
                      <PriceField
                        control={control}
                        name="withDriverInterCityPrice"
                        label="interCity"
                      />
                      <PriceField control={control} name="withDriverOneWayPrice" label="oneWay" />
                    </div>
                    <WithDriverWageNote />
                    <CalendarPriceLink
                      href={calendarHref}
                      hint={tPricing('calendarHint')}
                      label={tPricing('calendarLink')}
                    />
                  </EditCard>
                ) : null}
              </>
            ) : null}

            {control && service === SERVICE_TYPE.LONG_TERM ? (
              <>
                <EditCard title={t('price.title')}>
                  {/*
                    Gian hàng: giá từng gói nằm ở khung xem trước cạnh mốc ưu đãi — dưới ô chỉ còn một
                    dòng "Giá đề xuất". Tuyến hoa hồng không có khung đó nên giữ hộp gợi ý kèm giá gói.
                  */}
                  <PriceField
                    control={control}
                    name="monthlyPrice"
                    label="monthly"
                    perMonth
                    help={
                      isManage ? <LongTermPriceHintLive control={control} compact /> : undefined
                    }
                  />
                  {isManage ? null : <LongTermPriceHintLive control={control} />}
                </EditCard>
                {isManage ? (
                  <VehiclePolicySection
                    api={api!}
                    section={POLICY_SECTION.LONG_TERM_DISCOUNT}
                    canUpdate={canUpdate}
                    title={t('policy.longTermTitle')}
                  >
                    {(binding) => (
                      // Bảng mốc trải hết chiều ngang, hộp công thức bên dưới (Figma `24705:27510`).
                      <PolicyFlatLayout>
                        <PolicySections
                          control={binding.control}
                          numbered={false}
                          blocks={[POLICY_BLOCK.DISCOUNT]}
                          legacyDiscountTiers={
                            (binding.inherited
                              ? priced!.pricing.shopPolicy
                              : (priced!.pricing.ownPolicy ?? priced!.pricing.policy))
                              ?.legacyDiscountTiers
                          }
                          disabled={binding.disabled}
                        />
                      </PolicyFlatLayout>
                    )}
                  </VehiclePolicySection>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {/*
          Thiết lập riêng của có tài xế giữ form sống qua các tab (gõ dở rồi đổi tab không mất), chỉ
          vẽ ô khi đang ở tab có tài xế.
        */}
        {withDriverSetting && services.includes(SERVICE_TYPE.WITH_DRIVER) ? (
          <WithDriverExtras
            vehicleId={vehicle.id}
            setting={withDriverSetting}
            canEdit={canUpdate && canOperate}
            visible={service === SERVICE_TYPE.WITH_DRIVER}
          />
        ) : null}
      </div>
      {toggle.dialog}
    </Form>
  );
}

/**
 * "Hình thức cọc xe hiện tại: … - Thiết lập tại Bảo hiểm & Giao nhận →" (design `24705:27729`). Đọc
 * cọc ĐANG ÁP: của gian hàng khi mục cọc kế thừa, của xe khi riêng - kể cả số đang gõ dở.
 */
function CollateralStrip({
  api,
  onOpenPolicy,
}: {
  api: VehiclePricingFormApi;
  onOpenPolicy?: () => void;
}) {
  const t = useTranslations('Vehicles.editor.services');
  const describe = useDescribeCollateral();
  const control = (
    api.isInherited(POLICY_SECTION.COLLATERAL) ? api.shopForm.control : api.form.control
  ) as Control<VehiclePricingFormValues>;
  const [mode, cash, asset, combination, assetTypes, depositAmount] = useWatch({
    control,
    name: [
      'collateralMode',
      'collateralCashEnabled',
      'collateralAssetEnabled',
      'collateralCombination',
      'collateralAssetTypes',
      'depositAmount',
    ],
  });
  const text = describe(
    policyCollateral({
      collateralMode: mode,
      collateralCashEnabled: cash,
      collateralAssetEnabled: asset,
      collateralCombination: combination,
      collateralAssetTypes: assetTypes,
      depositAmount,
    }),
  );
  if (!text) return null;
  return (
    <div className={styles.collateralStrip}>
      <span>{t('collateralNow', { collateral: text })}</span>
      {onOpenPolicy ? (
        <button type="button" className={styles.stripLink} onClick={onOpenPolicy}>
          {t('collateralSetup')} <ArrowRightOutlined aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Nhãn + lời giải thích của bảy ô giá — CÙNG câu chữ với màn giá trước đây (`Vehicles.pricing`). */
const PRICE_COPY = {
  weekday: {
    labelKey: 'selfDrive.weekday',
    tipKey: 'selfDrive.weekdayTipLabel',
    hintKey: 'selfDrive.weekdayHint',
  },
  weekend: {
    labelKey: 'selfDrive.weekend',
    tipKey: 'selfDrive.weekendTipLabel',
    hintKey: 'selfDrive.weekendHint',
  },
  hourly: {
    labelKey: 'selfDrive.hourly',
    tipKey: 'selfDrive.hourlyTipLabel',
    hintKey: 'selfDrive.hourlyHint',
  },
  daily: {
    labelKey: 'withDriver.daily',
    tipKey: 'withDriver.dailyTipLabel',
    hintKey: 'withDriver.dailyHint',
  },
  interCity: {
    labelKey: 'withDriver.interCity',
    tipKey: 'withDriver.interCityTipLabel',
    hintKey: 'withDriver.interCityHint',
  },
  oneWay: {
    labelKey: 'withDriver.oneWay',
    tipKey: 'withDriver.oneWayTipLabel',
    hintKey: 'withDriver.oneWayHint',
  },
  monthly: {
    labelKey: 'longTerm.monthly',
    tipKey: 'longTerm.monthlyTipLabel',
    hintKey: 'longTerm.monthlyHint',
  },
} as const;

/** Ô giá có đơn vị + icon giải thích — một khuôn cho bảy ô giá của ba dịch vụ. */
/**
 * Nhắc chủ xe khách đang thấy GIÁ NÀO ở dịch vụ có tài xế (20/11/2026 — giá có tài xế không bắt
 * buộc, chỉ khuyến khích nhập). Đọc giá trị ĐANG GÕ nên câu đổi ngay khi chủ xe nhập giá:
 *  - chưa có giá nội thành ⇒ khách thấy giá thuê xe (tự lái) kèm "chưa gồm tài xế";
 *  - có giá nội thành, thiếu lộ trình ⇒ lộ trình đó tính theo mức gần nhất;
 *  - đủ ba giá ⇒ khách thấy giá trọn gói đã gồm tài xế.
 */
function WithDriverPriceReminder({ control }: { control: Control<VehiclePricingFormValues> }) {
  const t = useTranslations('Vehicles.pricing.withDriver.reminder');
  const fmt = useAppFormat();
  const [daily, interCity, oneWay, weekday] = useWatch({
    control,
    name: [
      'withDriverDailyPrice',
      'withDriverInterCityPrice',
      'withDriverOneWayPrice',
      'weekdayPrice',
    ],
  });
  const has = (value: number | null | undefined) => value != null && value > 0;

  if (!has(daily)) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('missingTitle')}
        description={
          has(weekday)
            ? t('missingBody', { price: fmt.money(String(weekday)) })
            : t('missingNoPriceBody')
        }
      />
    );
  }
  if (!has(interCity) || !has(oneWay)) {
    return <Alert type="info" showIcon title={t('partial')} />;
  }
  return <Alert type="success" showIcon title={t('complete')} />;
}

function PriceField({
  control,
  name,
  label,
  required,
  perHour,
  perMonth,
  help,
}: {
  control: Control<VehiclePricingFormValues>;
  name: keyof VehiclePricingFormValues;
  label: keyof typeof PRICE_COPY;
  required?: boolean;
  perHour?: boolean;
  perMonth?: boolean;
  /** Dòng nhỏ ngay dưới ô (lỗi kiểm tra vẫn thắng nó). */
  help?: ReactNode;
}) {
  const t = useTranslations('Vehicles.pricing');
  const copy = PRICE_COPY[label];
  return (
    <NumberField
      control={control}
      name={name}
      label={t(copy.labelKey)}
      labelAccessory={
        <PolicyInfoTip label={t(copy.tipKey)}>
          {t(copy.hintKey, { packages: LONG_TERM_PACKAGE_MONTHS.join(', ') })}
        </PolicyInfoTip>
      }
      money
      addonAfter={perHour ? t('unitPerHour') : perMonth ? t('unitPerMonth') : t('unitPerDay')}
      required={required}
      help={help}
    />
  );
}

/**
 * "Tự động đồng ý nhận chuyến" — LƯU NGAY, cùng hook với thẻ "Tối ưu nhận chuyến" ở Hồ sơ xe. Điều
 * kiện để hệ thống tự nhận mở ra ngay dưới công tắc (design chỉ vẽ công tắc; bốn–sáu dòng này là
 * toàn bộ lời hứa của nó nên không được biến mất). Chỉ tab tự lái có — có tài xế luôn duyệt tay.
 */
function AutoAcceptRow({
  vehicleId,
  setting,
  canEdit,
}: {
  vehicleId: string;
  setting: VehicleServiceSetting;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.autoAccept');
  const tEditor = useTranslations('Vehicles.editor.services');
  const [rulesOpen, setRulesOpen] = useState(false);
  const autoAccept = useAutoAcceptToggle({ vehicleId, setting, canEdit });
  const hidden = useSupportHides(SUPPORT_HIDDEN_AREA.AUTO_ACCEPT);

  return (
    <ToggleRow
      title={
        <>
          {t('toggleTitle')}
          <button
            type="button"
            className={styles.infoButton}
            aria-expanded={rulesOpen}
            aria-label={t('rulesTitle')}
            onClick={() => setRulesOpen((open) => !open)}
          >
            <InfoCircleOutlined aria-hidden="true" />
          </button>
        </>
      }
      hint={t('toggleBody')}
      control={
        hidden ? (
          <span className={styles.toggleHint}>
            {autoAccept.enabled ? tEditor('on') : tEditor('off')}
          </span>
        ) : (
          <Switch
            aria-label={t('toggleLabel')}
            checked={autoAccept.enabled}
            loading={autoAccept.pending}
            disabled={autoAccept.disabled}
            onChange={(next) => void autoAccept.change(next)}
          />
        )
      }
    >
      {rulesOpen ? (
        <div className={styles.rules}>
          <ul className={styles.rulesList}>
            <li>{t('rules.schedule')}</li>
            <li>{t('rules.quote')}</li>
            <li>{t('rules.longTerm')}</li>
          </ul>
          <p className={styles.rulesPolicy}>
            <strong>{t('policyTitle')}</strong> {t('policyBody')}
          </p>
        </div>
      ) : null}
    </ToggleRow>
  );
}

interface WithDriverValues {
  minRentalMinutes: string | null;
  preferredRouteTypes: string[];
}

/**
 * Thẻ "Khác" của tab Có tài xế: thời gian thuê tối thiểu + phân khúc chuyến ưu tiên — hai ô RIÊNG
 * của có tài xế, ghi `PATCH /vehicles/:id/service-settings/with_driver` (server gộp từng trường, nên
 * công tắc tự nhận lưu ngay không bị ghi đè). Lưu cùng lần bấm Lưu ở cột phải.
 */
function WithDriverExtras({
  vehicleId,
  setting,
  canEdit,
  visible,
}: {
  vehicleId: string;
  setting: VehicleServiceSetting;
  canEdit: boolean;
  visible: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const tEditor = useTranslations('Vehicles.editor.services');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const patch = usePatchVehicleServiceSetting(vehicleId, SERVICE_TYPE.WITH_DRIVER as ServiceType);

  const values = useMemo<WithDriverValues>(
    () => ({
      minRentalMinutes: setting.minRentalMinutes == null ? null : String(setting.minRentalMinutes),
      preferredRouteTypes: setting.preferredRouteTypes,
    }),
    [setting],
  );
  /*
   * `keepDirtyValues`: bật/tắt công tắc tự nhận làm thiết lập tải lại; ô đang sửa dở không được bị
   * ghi đè bởi bản vừa tải về.
   */
  const { control, handleSubmit, reset, formState } = useForm<WithDriverValues>({
    values,
    resetOptions: { keepDirtyValues: true },
  });

  function submit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void handleSubmit(async (next) => {
        try {
          await patch.mutateAsync({
            minRentalMinutes: next.minRentalMinutes == null ? null : Number(next.minRentalMinutes),
            // Lọc qua `isRouteType` — form giữ string, dây chỉ nhận mã lộ trình thật.
            preferredRouteTypes: next.preferredRouteTypes.filter(isRouteType),
          });
          message.success(t('autoAccept.saved'));
          resolve(true);
        } catch (err) {
          message.error(errorMessage(err));
          resolve(false);
        }
      })();
    });
  }

  useEditForm('withDriverSettings', {
    dirty: formState.isDirty,
    submitting: patch.isPending,
    submit,
    reset: () => reset(values),
  });

  if (!visible) return null;

  const minRentalOptions = Array.from(
    { length: MIN_RENTAL_MINUTES_RANGE.max / HOUR },
    (_, i) => (i + 1) * HOUR,
  ).map((m) => ({ value: String(m), label: t('common.hours', { count: m / HOUR }) }));
  const routeOptions = ROUTE_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('routeType', value),
  }));

  return (
    <EditCard title={tEditor('extras')}>
      <CheckboxGroupField
        control={control}
        name="preferredRouteTypes"
        label={t('autoAccept.routesTitle')}
        options={routeOptions}
        help={t('autoAccept.routesHint')}
        disabled={!canEdit}
      />
      <SelectField
        control={control}
        name="minRentalMinutes"
        label={t('autoAccept.minRental')}
        options={minRentalOptions}
        allowClear
        help={t('autoAccept.minRentalHint')}
        disabled={!canEdit}
      />
    </EditCard>
  );
}
