'use client';

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
import type { DomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { formToSaveInput, policyToForm } from '../form';
import { vehiclePricingFormSchema, type VehiclePricingFormValues } from '../schema';
import type { RentalPolicyValues, SaveVehiclePricingInput, VehiclePricing } from '../types';
import { LongTermPriceHint } from './LongTermPriceHint';
import { PolicyInfoTip } from './PolicyInfoTip';
import { PolicySections } from './PolicySections';

import styles from './VehiclePricingWorkspace.module.css';

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
  const t = useTranslations('Vehicles.pricing');
  const tActions = useTranslations('Common.actions');
  const { modal } = App.useApp();

  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  // Bật form ghi đè trước khi lưu lần đầu — state cục bộ, chỉ commit khi bấm Lưu.
  const [editingOverride, setEditingOverride] = useState(false);
  const editMode = overriding || editingOverride;
  const showPolicy = policyMode === 'full';

  /** Tên xe kèm biển số — tham số `{vehicle}` của mọi hộp xác nhận trên màn này. */
  const vehicleLabel = `${vehicleName}${vehiclePlate ? ` (${vehiclePlate})` : ''}`;

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

  const resolver = useValidationResolver<VehiclePricingFormValues>(
    vehiclePricingFormSchema,
    'Vehicles.pricing.validation',
  );
  const { control, handleSubmit, reset, setValue, formState } = useForm<VehiclePricingFormValues>({
    resolver,
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
      title: t('source.resetTitle'),
      content: t('source.resetBody'),
      okText: t('source.resetOk'),
      okButtonProps: { danger: true },
      cancelText: t('source.resetCancel'),
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
     *
     * Nói đúng thứ sắp được lưu: ở chế độ kế thừa KHÔNG có chính sách riêng nào được ghi, nên
     * hộp thoại không được hứa điều đó (giá và chính sách đã là hai trục tách rời từ 20/08).
     */
    modal.confirm({
      title: sendPolicy && showPolicy ? t('confirm.overrideTitle') : t('confirm.inheritTitle'),
      content:
        sendPolicy && showPolicy
          ? t('confirm.overrideBody', { vehicle: vehicleName })
          : t('confirm.inheritBody', { vehicle: vehicleName }),
      okText: t('confirm.ok'),
      cancelText: t('confirm.cancel'),
      onOk: () => onSave(body),
    });
  });

  return (
    <div className={styles.stack}>
      {showPolicy ? (
        /* Nguồn chính sách — Figma `policy-toggle-card`. */
        <section className={styles.card} aria-label={t('source.title')}>
          <PricingTitle infoLabel={t('source.tipLabel')} info={t('source.info')}>
            {t('source.title')}
          </PricingTitle>
          <label className={styles.sourceRow}>
            <Switch
              // Trang này có nhiều switch (khuyến mãi, giao nhận, ưu đãi) từ khi khối giá luôn
              // hiện — cái này cần tên riêng để đọc màn hình và test gọi đúng tên nó.
              aria-label={t('source.useShop')}
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
            <span className={styles.sourceLabel}>{t('source.useShop')}</span>
            {editMode ? <span className={styles.sourceCustom}>● {t('source.custom')}</span> : null}
          </label>
          {editMode ? (
            <Alert
              type="warning"
              showIcon
              title={t('source.customBanner', { vehicle: vehicleLabel })}
            />
          ) : (
            <div className={styles.inheritBanner}>
              <span>{t('source.inheritBanner')}</span>
              <Link href={ROUTES.MANAGE.SHOP_POLICIES} className={styles.inheritLink}>
                {t('source.viewShopPolicy')}
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
                {t('source.reset')}
              </Button>
            </div>
          ) : null}

          {formState.isDirty ? (
            <Alert
              type="warning"
              showIcon
              title={t('dirty')}
              action={
                <Button size="small" onClick={() => reset()} disabled={submitting}>
                  {t('discard')}
                </Button>
              }
            />
          ) : null}

          {/* Nhóm giá theo TỪNG DỊCH VỤ xe đăng (17/08) — không trộn thành một danh sách. */}
          {showSelfDrive ? (
            <section className={styles.card} aria-label={t('selfDrive.title')}>
              <PricingTitle infoLabel={t('selfDrive.tipLabel')} info={t('selfDrive.info')}>
                {t('selfDrive.title')}
              </PricingTitle>
              <div className={styles.priceRow}>
                <NumberField
                  control={control}
                  name="weekdayPrice"
                  label={t('selfDrive.weekday')}
                  labelAccessory={
                    <PolicyInfoTip label={t('selfDrive.weekdayTipLabel')}>
                      {t('selfDrive.weekdayHint')}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerDay')}
                  required
                />
                <NumberField
                  control={control}
                  name="weekendPrice"
                  label={t('selfDrive.weekend')}
                  labelAccessory={
                    <PolicyInfoTip label={t('selfDrive.weekendTipLabel')}>
                      {t('selfDrive.weekendHint')}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerDay')}
                />
                <NumberField
                  control={control}
                  name="hourlyPrice"
                  label={t('selfDrive.hourly')}
                  labelAccessory={
                    <PolicyInfoTip label={t('selfDrive.hourlyTipLabel')}>
                      {t('selfDrive.hourlyHint')}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerHour')}
                />
              </div>
              <DirectDiscountEditor control={control} setValue={setValue} />
              {calendarHref ? (
                <CalendarPriceLink
                  href={calendarHref}
                  hint={t('calendarHint')}
                  label={t('calendarLink')}
                />
              ) : null}
            </section>
          ) : null}

          {showLongTerm ? (
            <section className={styles.card} aria-label={t('longTerm.title')}>
              <PricingTitle infoLabel={t('longTerm.tipLabel')} info={t('longTerm.info')}>
                {t('longTerm.title')}
              </PricingTitle>
              <div className={styles.priceRow}>
                <NumberField
                  control={control}
                  name="monthlyPrice"
                  label={t('longTerm.monthly')}
                  labelAccessory={
                    <PolicyInfoTip label={t('longTerm.monthlyTipLabel')}>
                      {t('longTerm.monthlyHint', {
                        packages: LONG_TERM_PACKAGE_MONTHS.join(', '),
                      })}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerMonth')}
                />
              </div>
              {/* Gợi ý sống theo GIÁ ĐANG NHẬP — chủ xe thấy ngay giá từng gói khách sẽ trả. */}
              <LongTermPriceHintLive control={control} />
            </section>
          ) : null}

          {showWithDriver ? (
            <section className={styles.card} aria-label={t('withDriver.title')}>
              <PricingTitle infoLabel={t('withDriver.tipLabel')} info={t('withDriver.info')}>
                {t('withDriver.title')}
              </PricingTitle>
              <div className={styles.priceRow}>
                <NumberField
                  control={control}
                  name="withDriverDailyPrice"
                  label={t('withDriver.daily')}
                  labelAccessory={
                    <PolicyInfoTip label={t('withDriver.dailyTipLabel')}>
                      {t('withDriver.dailyHint')}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerDay')}
                />
                <NumberField
                  control={control}
                  name="withDriverInterCityPrice"
                  label={t('withDriver.interCity')}
                  labelAccessory={
                    <PolicyInfoTip label={t('withDriver.interCityTipLabel')}>
                      {t('withDriver.interCityHint')}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerDay')}
                />
                <NumberField
                  control={control}
                  name="withDriverOneWayPrice"
                  label={t('withDriver.oneWay')}
                  labelAccessory={
                    <PolicyInfoTip label={t('withDriver.oneWayTipLabel')}>
                      {t('withDriver.oneWayHint')}
                    </PolicyInfoTip>
                  }
                  money
                  addonAfter={t('unitPerDay')}
                />
              </div>
              {calendarHref ? (
                <CalendarPriceLink
                  href={calendarHref}
                  hint={t('calendarHint')}
                  label={t('calendarLink')}
                />
              ) : null}
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
            submitLabel={tActions('saveChanges')}
            cancelLabel={t('discard')}
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
  const t = useTranslations('Vehicles.pricing.discount');
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
              <h3 className={styles.promoTitle}>{t('title')}</h3>
              <PolicyInfoTip label={t('tipLabel')}>{t('info')}</PolicyInfoTip>
            </div>
          </div>
          <Switch
            aria-label={t('toggle')}
            checked={enabled}
            checkedChildren={t('on')}
            unCheckedChildren={t('off')}
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
              label={t('percent')}
              labelAccessory={
                <PolicyInfoTip label={t('percentTipLabel')}>{t('percentInfo')}</PolicyInfoTip>
              }
              percent
              min={1}
              max={100}
              required
            />
          </div>
        ) : (
          <p className={styles.promoOffHint}>{t('offHint')}</p>
        )}
      </div>

      <aside className={styles.pricePreview} aria-live="polite" aria-label={t('previewAria')}>
        <span className={styles.previewEyebrow}>{t('previewEyebrow')}</span>
        <span className={styles.previewLabel}>{t('previewLabel')}</span>
        {weekdayPrice != null ? (
          enabled && discountedWeekday ? (
            <>
              <div className={styles.previewPriceLine}>
                <span className={styles.previewOldPrice}>{fmt.money(String(weekdayPrice))}</span>
                <DiscountTag percent={discountPercent} />
              </div>
              <div className={styles.previewFinalPrice}>
                {fmt.money(discountedWeekday)} <small>{t('perDay')}</small>
              </div>
              {saving != null ? (
                <span className={styles.previewSaving}>
                  {t('saving', { amount: fmt.money(String(saving)) })}
                </span>
              ) : null}
            </>
          ) : (
            <div className={styles.previewFinalPrice}>
              {fmt.money(String(weekdayPrice))} <small>{t('perDay')}</small>
            </div>
          )
        ) : (
          <span className={styles.previewEmpty}>{t('previewEmpty')}</span>
        )}

        {enabled && discountedWeekend ? (
          <div className={styles.previewSecondary}>
            <span>{t('weekendAfter')}</span>
            <strong>
              {fmt.money(discountedWeekend)}
              {t('perDay')}
            </strong>
          </div>
        ) : null}
        {hourlyPrice != null ? (
          <div className={styles.previewSecondary}>
            <span>{t('hourlyNoDiscount')}</span>
            <strong>
              {fmt.money(String(hourlyPrice))}
              {t('perHour')}
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
  const t = useTranslations('Vehicles.pricing.inherited');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <section className={styles.card} aria-label={t('title')}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{t('heading')}</h2>
          <p className={styles.desc}>{policy ? t('subtitle') : t('subtitleEmpty')}</p>
        </div>
        <div className={styles.summaryActions}>
          <span className={policy ? styles.inheritBadge : styles.missingPolicyBadge}>
            {policy ? t('badge') : t('badgeEmpty')}
          </span>
          {canEdit ? <Button onClick={onEdit}>{t('edit')}</Button> : null}
        </div>
      </div>

      {policy ? (
        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>{t('collateral')}</dt>
            <dd>
              {collateralSummary(policy, {
                money: fmt.money,
                label: domainLabel,
                noAssetTypes: t('assetNone'),
              })}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('delivery')}</dt>
            <dd className={policy.deliveryEnabled ? styles.summaryOn : undefined}>
              {policy.deliveryEnabled
                ? t('deliveryOn', { count: policy.deliveryTiers.length })
                : t('deliveryOff')}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('overtime')}</dt>
            <dd>
              {policy.overtimeFeePerHour
                ? t('overtimeValue', { fee: fmt.money(policy.overtimeFeePerHour) })
                : t('overtimeMissing')}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('discount')}</dt>
            <dd>
              {policy.discountEnabled && policy.discountTiers.length > 0
                ? t('discountMax', {
                    percent: Math.max(...policy.discountTiers.map((tier) => tier.percent)),
                  })
                : t('discountOff')}
            </dd>
          </div>
        </dl>
      ) : (
        <Alert
          type="info"
          showIcon
          title={t('empty')}
          description={t.rich('emptyBody', {
            policies: (chunks) => <Link href={ROUTES.MANAGE.SHOP_POLICIES}>{chunks}</Link>,
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
 *
 * Hàm THUẦN: nhận bộ định dạng tiền, hàm tra nhãn nghiệp vụ và câu "chưa chọn loại" từ ngoài
 * vào thay vì tự gọi hook. Nhờ vậy nó vẫn dùng được ở chỗ chỉ có chuỗi (bảng, tooltip, test)
 * mà không kéo theo cả một React context.
 */
export function collateralSummary(
  policy: Pick<RentalPolicyValues, 'collateralMode' | 'collateralAssetTypes' | 'depositAmount'>,
  {
    money,
    label,
    noAssetTypes,
  }: { money: (value: string) => string; label: DomainLabel; noAssetTypes: string },
): string {
  const modeLabel = label('collateralMode', policy.collateralMode);
  if (policy.collateralMode === COLLATERAL_MODE.CASH) {
    return `${modeLabel} · ${money(policy.depositAmount)}`;
  }
  if (policy.collateralMode === COLLATERAL_MODE.ASSET) {
    const types = policy.collateralAssetTypes
      .map((type) => label('collateralAssetType', type))
      .join(', ');
    return `${modeLabel} · ${types || noAssetTypes}`;
  }
  return modeLabel;
}
