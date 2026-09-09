'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Switch } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  COLLATERAL_MODE,
  LONG_TERM_PACKAGE_MONTHS,
  POLICY_SOURCE,
  SERVICE_TYPE,
  type ServiceType,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { ROUTES } from '@/constants/routes';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { formToSaveInput, policyToForm } from '../form';
import { vehiclePricingFormSchema, type VehiclePricingFormValues } from '../schema';
import type { RentalPolicyValues, SaveVehiclePricingInput, VehiclePricing } from '../types';
import { LongTermPriceHint } from './LongTermPriceHint';
import { PolicyInfoTip } from './PolicyInfoTip';
import { PolicySections } from './PolicySections';

import styles from './VehiclePricingWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DomainLabel } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';

interface VehiclePricingWorkspaceProps {
  vehicleName: string;
  vehiclePlate: string | null;
  pricing: VehiclePricing;
  canEdit: boolean;
  submitting: boolean;
  onSave: (body: SaveVehiclePricingInput) => void;
  /**
   * Chỉ hiện nhóm giá của các dịch vụ này (08/09/2026 — không gian quản lý xe tách "Giá tự lái"
   * và "Giá có tài xế" thành hai mục). Bỏ trống = mọi dịch vụ xe đăng. Nhóm bị ẩn VẪN giữ giá
   * trị ban đầu trong form và vẫn được gửi — một màn nhỏ không làm mất giá của màn khác.
   */
  visibleServices?: readonly ServiceType[];
  /**
   * `full` (mặc định) — khối chính sách (nguồn kế thừa/ghi đè, cọc, giao nhận…) hiện đầy đủ.
   * `hidden` — chỉ giá; chính sách của xe do màn khác lo. Nguồn chính sách giữ nguyên như đang có.
   */
  policyMode?: 'full' | 'hidden';
  /** Link "Tuỳ chỉnh giá theo lịch" — giá riêng theo ngày sống trên lịch xe, không có bảng mùa vụ. */
  calendarHref?: string;
}

const toNumber = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

function PricingTitle({
  children,
  infoLabel,
  info,
}: {
  children: ReactNode;
  infoLabel: string;
  info: ReactNode;
}) {
  return (
    <div className={styles.cardTitleRow}>
      <h2 className={styles.cardTitle}>{children}</h2>
      <PolicyInfoTip label={infoLabel}>{info}</PolicyInfoTip>
    </div>
  );
}

/**
 * Tab "Giá & chính sách" của một xe (Figma `236:3495`, states `237:1911`, mobile `247:1645/1706`).
 *
 * Hai chế độ theo đúng thiết kế:
 *  - **Kế thừa** (State A): mọi thông số read-only từ chính sách gian hàng; đổi ở trang
 *    Cấu hình gian hàng sẽ tự áp cho xe này.
 *  - **Ghi đè** (State B): sửa giá + toàn bộ chính sách riêng cho xe. "Đặt lại theo gian hàng"
 *    XOÁ bản ghi đè (có xác nhận — tùy chỉnh sẽ mất).
 *
 * Giá của xe đang công khai đổi là ÁP DỤNG NGAY ngoài chợ (09/09/2026 — ghi đè luật "sửa giá
 * thì duyệt lại" của ADR 0008). Chỉ căn cước của xe (biển số, loại xe, hộp số, nhiên liệu, năm
 * sản xuất) mới bị khoá, và khoá đó nằm ở màn Thông tin xe chứ không phải ở đây.
 *
 * Không gian quản lý xe (08/09/2026) dùng lại nguyên component này với `visibleServices` +
 * `policyMode="hidden"` — cùng form, cùng mapper, cùng hộp xác nhận; không có màn giá thứ hai.
 */
export function VehiclePricingWorkspace({
  vehicleName,
  vehiclePlate,
  pricing,
  canEdit,
  submitting,
  onSave,
  visibleServices,
  policyMode = 'full',
  calendarHref,
}: VehiclePricingWorkspaceProps) {
  const t = useTranslations('RentalPolicies.workspace');
  const tManage = useTranslations('VehicleManage.pricing');
  const { modal } = App.useApp();
  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  // Bật form ghi đè trước khi lưu lần đầu — state cục bộ, chỉ commit khi bấm Lưu.
  const [editingOverride, setEditingOverride] = useState(false);
  const editMode = overriding || editingOverride;
  const showPolicy = policyMode === 'full';

  // Nhóm giá hiện theo NĂNG LỰC dịch vụ của xe — không trộn mọi ô giá thành một danh sách.
  const services = pricing.serviceTypes ?? [];
  const isVisible = (service: ServiceType) =>
    services.includes(service) && (!visibleServices || visibleServices.includes(service));
  const hasSelfDrive = services.includes(SERVICE_TYPE.SELF_DRIVE);
  const hasLongTerm = services.includes(SERVICE_TYPE.LONG_TERM);
  const hasWithDriver = services.includes(SERVICE_TYPE.WITH_DRIVER);
  const showSelfDrive = isVisible(SERVICE_TYPE.SELF_DRIVE);
  const showLongTerm = isVisible(SERVICE_TYPE.LONG_TERM);
  const showWithDriver = isVisible(SERVICE_TYPE.WITH_DRIVER);
  const vehicleLabel = `${vehicleName}${vehiclePlate ? ` (${vehiclePlate})` : ''}`;

  const { control, handleSubmit, reset, setValue, formState } = useForm<VehiclePricingFormValues>({
    resolver: yupResolver(vehiclePricingFormSchema),
    /*
     * Giá ngày thường chỉ bắt buộc khi xe đăng tự lái (schema đọc `$serviceTypes` từ context).
     *
     * `policyEditable` tắt mọi ràng buộc của khối CHÍNH SÁCH khi xe đang kế thừa: các ô đó không
     * hiện ra để sửa, nên chúng không được phép chặn nút Lưu. Không có cờ này thì một gian hàng
     * CHƯA cấu hình chính sách sẽ không bao giờ đặt nổi giá cho xe — form đòi "Nhập số tiền cọc
     * mặc định" trên một ô vô hình.
     */
    context: { serviceTypes: services, policyEditable: editMode && showPolicy },
    values: {
      ...policyToForm(pricing.policy ?? pricing.shopPolicy),
      weekdayPrice: toNumber(pricing.weekdayPrice),
      weekendPrice: toNumber(pricing.weekendPrice),
      hourlyPrice: toNumber(pricing.hourlyPrice),
      discountPercent: pricing.discountPercent ?? null,
      monthlyPrice: toNumber(pricing.monthlyPrice),
      withDriverDailyPrice: toNumber(pricing.withDriverDailyPrice),
      withDriverInterCityPrice: toNumber(pricing.withDriverInterCityPrice),
      withDriverOneWayPrice: toNumber(pricing.withDriverOneWayPrice),
    },
  });

  function confirmReset() {
    modal.confirm({
      title: t('resetTitle'),
      content: t('resetBody'),
      okText: t('resetOk'),
      okButtonProps: { danger: true },
      cancelText: t('resetCancel'),
      onOk: () => {
        setEditingOverride(false);
        onSave({ source: POLICY_SOURCE.SHOP });
      },
    });
  }

  const submit = handleSubmit((values) => {
    // null tường minh = XOÁ giá đó (server nhận null-clear); chỉ gửi nhóm giá của dịch vụ
    // xe đang đăng — giá dịch vụ khác server từ chối đặt (validation chéo).
    const money = (v: number | null | undefined): string | null =>
      v != null ? String(Math.round(v)) : null;
    /*
     * `source` chỉ nói về CHÍNH SÁCH (20/08). Đặt giá riêng không còn kéo theo ghi đè chính
     * sách — gửi `vehicle` khi không sửa chính sách sẽ đóng băng một bản sao mà người dùng
     * không hề yêu cầu, và xe im lặng ngừng nhận cập nhật của gian hàng. Ở chế độ chỉ-giá
     * (`policyMode="hidden"`) nguồn hiện có được giữ nguyên: đang ghi đè thì gửi lại đúng bộ
     * chính sách đang có (form đã nạp nó), đang kế thừa thì không đụng.
     */
    const sendPolicy = overriding || (showPolicy && editMode);
    const body: SaveVehiclePricingInput = {
      source: sendPolicy ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
      ...(hasSelfDrive || values.weekdayPrice != null
        ? { weekdayPrice: money(values.weekdayPrice) ?? '0' }
        : {}),
      weekendPrice: money(values.weekendPrice),
      hourlyPrice: money(values.hourlyPrice),
      ...(hasSelfDrive
        ? {
            discountPercent:
              values.discountPercent != null && values.discountPercent > 0
                ? Math.round(values.discountPercent)
                : null,
          }
        : {}),
      ...(hasLongTerm ? { monthlyPrice: money(values.monthlyPrice) } : {}),
      ...(hasWithDriver
        ? {
            withDriverDailyPrice: money(values.withDriverDailyPrice),
            withDriverInterCityPrice: money(values.withDriverInterCityPrice),
            withDriverOneWayPrice: money(values.withDriverOneWayPrice),
          }
        : {}),
      ...(sendPolicy ? { policy: formToSaveInput(values) } : {}),
    };

    /*
     * 09/09/2026: đổi giá của xe ĐANG công khai có hiệu lực NGAY ngoài chợ — không còn hạ xe về
     * chờ duyệt lại, nên cũng không còn hộp cảnh báo về việc đó. Hộp xác nhận chung bên dưới
     * vẫn giữ: nó nói đúng thứ sắp được ghi.
     */
    // Nói đúng thứ sắp được lưu: ở chế độ kế thừa KHÔNG có chính sách riêng nào được ghi, nên
    // hộp thoại không được hứa điều đó (giá và chính sách đã là hai trục tách rời từ 20/08).
    modal.confirm({
      title: sendPolicy && showPolicy ? t('confirmSaveOverrideTitle') : t('confirmSavePriceTitle'),
      content:
        sendPolicy && showPolicy
          ? t('confirmSaveOverrideBody', { vehicle: vehicleName })
          : t('confirmSavePriceBody', { vehicle: vehicleName }),
      okText: t('confirmSaveOk'),
      cancelText: t('cancel'),
      onOk: () => onSave(body),
    });
  });

  return (
    <div className={styles.stack}>
      {showPolicy ? (
        /* Nguồn chính sách — Figma `policy-toggle-card`. */
        <section className={styles.card} aria-label={t('sourceTitle')}>
          <PricingTitle infoLabel={t('sourceInfoLabel')} info={t('sourceInfo')}>
            {t('sourceTitle')}
          </PricingTitle>
          <label className={styles.sourceRow}>
            <Switch
              // Trang này có nhiều switch (khuyến mãi, giao nhận, ưu đãi) từ khi khối giá luôn
              // hiện — cái này cần tên riêng để đọc màn hình và test gọi đúng tên nó.
              aria-label={t('useShopPolicy')}
              checked={!editMode}
              disabled={!canEdit || submitting}
              onChange={(useShop) => {
                if (!useShop) {
                  setEditingOverride(true);
                  return;
                }
                if (overriding) {
                  confirmReset();
                } else {
                  setEditingOverride(false);
                  reset();
                }
              }}
            />
            <span className={styles.sourceLabel}>{t('useShopPolicy')}</span>
            {editMode ? <span className={styles.sourceCustom}>{t('customBadge')}</span> : null}
          </label>
          {editMode ? (
            <Alert type="warning" showIcon title={t('customizingTitle', { vehicle: vehicleLabel })} />
          ) : (
            <div className={styles.inheritBanner}>
              <span>{t('inheritBanner')}</span>
              <Link href={ROUTES.MANAGE.SHOP_POLICIES} className={styles.inheritLink}>
                {t('viewShopPolicy')}
              </Link>
            </div>
          )}
        </section>
      ) : null}

      {/*
        Form BAO GIỜ cũng hiện: giá là thuộc tính của xe, không phụ thuộc nguồn chính sách. Chỉ
        khối chính sách bên dưới mới đổi theo `editMode` — trước 20/08 cả hai bị khoá chung, nên
        muốn sửa mỗi giá là phải ghi đè toàn bộ chính sách gian hàng.
      */}
      <form onSubmit={submit} noValidate>
        <div className={styles.stack}>
          {showPolicy && overriding && canEdit ? (
            <div className={styles.resetRow}>
              <Button danger type="link" onClick={confirmReset} disabled={submitting}>
                {t('resetLink')}
              </Button>
            </div>
          ) : null}

          {formState.isDirty ? (
            <Alert
              type="warning"
              showIcon
              title={t('unsavedTitle')}
              action={
                <Button size="small" onClick={() => reset()} disabled={submitting}>
                  {t('cancel')}
                </Button>
              }
            />
          ) : null}

          {/* Nhóm giá theo TỪNG DỊCH VỤ xe đăng (17/08) — không trộn thành một danh sách. */}
          {showSelfDrive ? (
            <section className={styles.card} aria-label={t('selfDriveTitle')}>
              <PricingTitle infoLabel={t('selfDriveInfoLabel')} info={t('selfDriveInfo')}>
                {t('selfDriveTitle')}
              </PricingTitle>
              <div className={styles.priceRow}>
                <NumberField
                  control={control}
                  name="weekdayPrice"
                  label={t('weekday')}
                  labelAccessory={<PolicyInfoTip label={t('weekdayInfoLabel')}>{t('weekdayInfo')}</PolicyInfoTip>}
                  money
                  addonAfter={t('perDay')}
                  required
                />
                <NumberField
                  control={control}
                  name="weekendPrice"
                  label={t('weekend')}
                  labelAccessory={<PolicyInfoTip label={t('weekendInfoLabel')}>{t('weekendInfo')}</PolicyInfoTip>}
                  money
                  addonAfter={t('perDay')}
                />
                <NumberField
                  control={control}
                  name="hourlyPrice"
                  label={t('hourly')}
                  labelAccessory={<PolicyInfoTip label={t('hourlyInfoLabel')}>{t('hourlyInfo')}</PolicyInfoTip>}
                  money
                  addonAfter={t('perHour')}
                />
              </div>
              <DirectDiscountEditor control={control} setValue={setValue} />
              {calendarHref ? <CalendarPriceLink href={calendarHref} hint={tManage('calendarHint')} label={tManage('calendarLink')} /> : null}
            </section>
          ) : null}

          {showLongTerm ? (
            <section className={styles.card} aria-label={t('longTermTitle')}>
              <PricingTitle infoLabel={t('longTermInfoLabel')} info={t('longTermInfo')}>
                {t('longTermTitle')}
              </PricingTitle>
              <div className={styles.priceRow}>
                <NumberField
                  control={control}
                  name="monthlyPrice"
                  label={t('monthly')}
                  labelAccessory={
                    <PolicyInfoTip label={t('monthlyInfoLabel')}>
                      {t('monthlyInfo', { packages: LONG_TERM_PACKAGE_MONTHS.join(', ') })}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('perMonth')}
                />
              </div>
              {/* Gợi ý sống theo GIÁ ĐANG NHẬP — chủ xe thấy ngay giá từng gói khách sẽ trả. */}
              <LongTermPriceHintLive control={control} />
            </section>
          ) : null}

          {showWithDriver ? (
            <section className={styles.card} aria-label={t('withDriverTitle')}>
              <PricingTitle infoLabel={t('withDriverInfoLabel')} info={t('withDriverInfo')}>
                {t('withDriverTitle')}
              </PricingTitle>
              <div className={styles.priceRow}>
                <NumberField
                  control={control}
                  name="withDriverDailyPrice"
                  label={t('inCity')}
                  labelAccessory={<PolicyInfoTip label={t('inCityInfoLabel')}>{t('inCityInfo')}</PolicyInfoTip>}
                  money
                  addonAfter={t('perDay')}
                />
                <NumberField
                  control={control}
                  name="withDriverInterCityPrice"
                  label={t('interCity')}
                  labelAccessory={<PolicyInfoTip label={t('interCityInfoLabel')}>{t('interCityInfo')}</PolicyInfoTip>}
                  money
                  addonAfter={t('perDay')}
                />
                <NumberField
                  control={control}
                  name="withDriverOneWayPrice"
                  label={t('oneWay')}
                  labelAccessory={<PolicyInfoTip label={t('oneWayInfoLabel')}>{t('oneWayInfo')}</PolicyInfoTip>}
                  money
                  addonAfter={t('perDay')}
                />
              </div>
              {calendarHref ? <CalendarPriceLink href={calendarHref} hint={tManage('calendarHint')} label={tManage('calendarLink')} /> : null}
            </section>
          ) : null}

          {showPolicy ? (
            editMode ? (
              /* Form giá xe là SUPERSET của PolicyFormValues — cấu trúc tương thích, TS không
                 thu hẹp generic của RHF nên cần một cast tường minh tại biên. */
              <PolicySections
                control={control as unknown as Parameters<typeof PolicySections>[0]['control']}
                numbered={false}
                legacyDiscountTiers={(pricing.policy ?? pricing.shopPolicy)?.legacyDiscountTiers}
              />
            ) : (
              <InheritedPolicyCard
                policy={pricing.shopPolicy ?? null}
                canEdit={canEdit}
                onEdit={() => setEditingOverride(true)}
              />
            )
          ) : null}

          <StickyFormActions
            submitLabel={t('confirmSaveOk')}
            cancelLabel={t('cancel')}
            onCancel={formState.isDirty ? () => reset() : undefined}
            submitting={submitting}
            disabled={!canEdit}
          />
        </div>
      </form>
    </div>
  );
}

/** Lối sang lịch xe để đặt giá riêng theo ngày — một nguồn giá, không có bảng mùa vụ thứ hai. */
function CalendarPriceLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <div className={styles.calendarLink}>
      <Link href={href}>{label}</Link>
      <span className={styles.desc}>{hint}</span>
    </div>
  );
}

/**
 * Khuyến mãi trực tiếp là một thiết lập giá riêng của xe, không phải bậc ưu đãi
 * dài hạn. Preview dùng cùng công thức với card/chi tiết sàn để chủ xe không phải
 * tự nhẩm giá sau giảm.
 */
function DirectDiscountEditor({
  control,
  setValue,
}: {
  control: Control<VehiclePricingFormValues>;
  setValue: UseFormSetValue<VehiclePricingFormValues>;
}) {
  const t = useTranslations('RentalPolicies.workspace');
  const fmt = useAppFormat();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const weekendPrice = useWatch({ control, name: 'weekendPrice' });
  const hourlyPrice = useWatch({ control, name: 'hourlyPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const enabled = discountPercent != null && discountPercent > 0;
  const discountedWeekday = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  const discountedWeekend = discountedPriceVnd(
    weekendPrice == null ? null : String(weekendPrice),
    discountPercent,
  );
  const saving =
    weekdayPrice != null && discountedWeekday != null
      ? Math.max(0, Math.round(weekdayPrice) - Number(discountedWeekday))
      : null;

  return (
    <div className={styles.promoCard}>
      <div className={styles.promoSettings}>
        <div className={styles.promoHeadingRow}>
          <div>
            <div className={styles.promoTitleRow}>
              <h3 className={styles.promoTitle}>{t('promoTitle')}</h3>
              <PolicyInfoTip label={t('promoInfoLabel')}>{t('promoInfo')}</PolicyInfoTip>
            </div>
          </div>
          <Switch
            aria-label={t('promoToggle')}
            checked={enabled}
            checkedChildren={t('promoOn')}
            unCheckedChildren={t('promoOff')}
            onChange={(checked) =>
              setValue('discountPercent', checked ? 10 : null, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </div>

        {enabled ? (
          <div className={styles.promoInput}>
            <NumberField
              control={control}
              name="discountPercent"
              label={t('promoPercent')}
              labelAccessory={
                <PolicyInfoTip label={t('promoPercentInfoLabel')}>{t('promoPercentInfo')}</PolicyInfoTip>
              }
              percent
              min={1}
              max={100}
              required
            />
          </div>
        ) : (
          <p className={styles.promoOffHint}>{t('promoOffHint')}</p>
        )}
      </div>

      <aside className={styles.pricePreview} aria-live="polite" aria-label={t('previewLabel')}>
        <span className={styles.previewEyebrow}>{t('previewEyebrow')}</span>
        <span className={styles.previewLabel}>{t('previewPrice')}</span>
        {weekdayPrice != null ? (
          enabled && discountedWeekday ? (
            <>
              <div className={styles.previewPriceLine}>
                <span className={styles.previewOldPrice}>{fmt.money(String(weekdayPrice))}</span>
                <DiscountTag percent={discountPercent} />
              </div>
              <div className={styles.previewFinalPrice}>
                {fmt.money(discountedWeekday)} <small>{t('perDayShort')}</small>
              </div>
              {saving != null ? (
                <span className={styles.previewSaving}>
                  {t('previewSaving', { amount: fmt.money(String(saving)) })}
                </span>
              ) : null}
            </>
          ) : (
            <div className={styles.previewFinalPrice}>
              {fmt.money(String(weekdayPrice))} <small>{t('perDayShort')}</small>
            </div>
          )
        ) : (
          <span className={styles.previewEmpty}>{t('previewEmpty')}</span>
        )}

        {enabled && discountedWeekend ? (
          <div className={styles.previewSecondary}>
            <span>{t('previewWeekend')}</span>
            <strong>
              {fmt.money(discountedWeekend)}
              {t('perDayShort')}
            </strong>
          </div>
        ) : null}
        {hourlyPrice != null ? (
          <div className={styles.previewSecondary}>
            <span>{t('previewHourly')}</span>
            <strong>
              {fmt.money(String(hourlyPrice))}
              {t('perHourShort')}
            </strong>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/**
 * Cầu useWatch → LongTermPriceHint: gợi ý VÀ bảng giá gói đổi ngay khi chủ xe gõ giá hoặc sửa
 * mốc ưu đãi, không đợi lưu — thấy ngay khách sẽ trả bao nhiêu cho từng gói.
 */
function LongTermPriceHintLive({ control }: { control: Control<VehiclePricingFormValues> }) {
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  const discountTiers = useWatch({ control, name: 'discountTiers' });
  const discountEnabled = useWatch({ control, name: 'discountEnabled' });
  return (
    <LongTermPriceHint
      weekdayPrice={weekdayPrice}
      monthlyPrice={monthlyPrice}
      discountTiers={discountTiers}
      discountEnabled={discountEnabled}
    />
  );
}

/**
 * Chính sách ĐANG KẾ THỪA từ gian hàng — chỉ đọc (State A, Figma `247:1645`).
 *
 * Không còn liệt kê giá ở đây: từ 20/08 giá sửa trực tiếp trên chính form phía trên, kể cả khi
 * xe vẫn kế thừa chính sách. Lặp lại giá dưới dạng read-only ngay dưới ô nhập giá là hai nguồn
 * cho cùng một con số, và nguồn read-only luôn là nguồn cũ.
 */
function InheritedPolicyCard({
  policy,
  canEdit,
  onEdit,
}: {
  policy: RentalPolicyValues | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('RentalPolicies.workspace');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <section className={styles.card} aria-label={t('inheritedTitle')}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{t('inheritedTitle')}</h2>
          <p className={styles.desc}>{policy ? t('inheritedDescPolicy') : t('inheritedDescNone')}</p>
        </div>
        <div className={styles.summaryActions}>
          <span className={policy ? styles.inheritBadge : styles.missingPolicyBadge}>
            {policy ? t('inheritingBadge') : t('missingBadge')}
          </span>
          {canEdit ? <Button onClick={onEdit}>{t('customize')}</Button> : null}
        </div>
      </div>

      {policy ? (
        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>{t('sumCollateral')}</dt>
            <dd>{collateralSummary(policy, fmt.money, domainLabel, t('collateralNoType'))}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('sumDelivery')}</dt>
            <dd className={policy.deliveryEnabled ? styles.summaryOn : undefined}>
              {policy.deliveryEnabled
                ? t('sumDeliveryOn', { count: policy.deliveryTiers.length })
                : t('sumOff')}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('sumOvertime')}</dt>
            <dd>
              {policy.overtimeFeePerHour
                ? t('sumOvertimeValue', { amount: fmt.money(policy.overtimeFeePerHour) })
                : t('sumNeedsConfig')}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('sumDiscount')}</dt>
            <dd>
              {policy.discountEnabled && policy.discountTiers.length > 0
                ? t('sumDiscountMax', {
                    percent: Math.max(...policy.discountTiers.map((tier) => tier.percent)),
                  })
                : t('sumOff')}
            </dd>
          </div>
        </dl>
      ) : (
        <Alert
          type="info"
          showIcon
          title={t('noPolicyTitle')}
          description={t.rich('noPolicyBody', {
            link: () => <Link href={ROUTES.MANAGE.SHOP_POLICIES}>{t('noPolicyLink')}</Link>,
          })}
        />
      )}
    </section>
  );
}

/**
 * Một dòng tóm tắt yêu cầu bảo đảm cho các bảng chỉ-đọc.
 *
 * Ba chế độ đọc ra ba câu khác hẳn nhau, nên không thể chỉ in số tiền như trước: "0đ" ở chế độ
 * `asset` sẽ khiến người đọc tưởng xe không yêu cầu gì, trong khi gian hàng đang giữ cà vẹt.
 * Nhãn đi qua `Domain` (ADR 0012) — nơi gọi truyền `domainLabel` của request.
 */
export function collateralSummary(
  policy: Pick<RentalPolicyValues, 'collateralMode' | 'collateralAssetTypes' | 'depositAmount'>,
  money: (value: string) => string,
  domainLabel: DomainLabel,
  noTypeLabel: string,
): string {
  const modeLabel = domainLabel('collateralMode', policy.collateralMode);
  if (policy.collateralMode === COLLATERAL_MODE.CASH) {
    return `${modeLabel} · ${money(policy.depositAmount)}`;
  }
  if (policy.collateralMode === COLLATERAL_MODE.ASSET) {
    const types = policy.collateralAssetTypes
      .map((type) => domainLabel('collateralAssetType', type))
      .join(', ');
    return `${modeLabel} · ${types || noTypeLabel}`;
  }
  return modeLabel;
}
