'use client';

import { Alert, Form, Skeleton, Switch, Tooltip } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE,
  isVehicleServiceTypeAllowed,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES } from '@/constants/routes';
import { useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import type { RentalPolicyValues } from '@/features/rental-policies/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import {
  LongTermPriceFields,
  PoliciesSection,
  SelfDrivePriceFields,
  ServicePriceRemovalWarning,
  WithDriverPriceFields,
} from './VehicleFormSections';
import { WizardSection } from './VehicleWizard';
import styles from './CreateVehiclePricingStep.module.css';

interface CreateVehiclePricingStepProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  pricePreview: ReactNode;
  /** Cho nút "dùng giá này" của gợi ý giá thuê theo mẫu xe (ADR 0090). */
  setValue?: UseFormSetValue<VehicleFormValues>;
  /**
   * "Tự động đồng ý nhận chuyến" - KHÔNG nằm trong form xe: nó là thiết lập của dịch vụ tự lái
   * (`vehicle_service_settings`), trang ghi bằng `patchVehicleServiceSetting` SAU khi tạo xe, cùng
   * đường với luồng đăng nhanh. `undefined` = không vẽ (phiên hỗ trợ).
   */
  autoAccept?: { value: boolean; onChange: (next: boolean) => void };
  /**
   * Hiện khối "chính sách gian hàng" + lối tới trang Chính sách thuê. `false` cho chủ xe tuyến hoa
   * hồng: họ không có trang đó, chính sách đặt trên từng xe ở màn sửa xe (ADR 0085 điều 3).
   */
  shopPolicy?: boolean;
}

/**
 * Bước 2 "Dịch vụ & giá" của wizard tạo xe - Figma `24352:80745`.
 *
 * Ba THẺ dịch vụ có công tắc thay cho ô chip "Loại dịch vụ" cũ: bật thẻ = thêm dịch vụ vào
 * `serviceTypes` và mở ô giá của nó. Luật cũ giữ nguyên: dịch vụ không hợp loại xe bị khoá kèm lý do,
 * phải còn ít nhất một dịch vụ (yup), tắt một dịch vụ đã nhập giá thì cảnh báo giá sẽ bị xoá.
 */
export function CreateVehiclePricingStep({
  control,
  isCar,
  pricePreview,
  setValue,
  autoAccept,
  shopPolicy = true,
}: CreateVehiclePricingStepProps) {
  const t = useTranslations('Vehicles.form.pricingStep');
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;

  return (
    <WizardSection title={t('title')} description={t('subtitle')} id="create-vehicle-pricing">
      <div className={styles.stack}>
        {shopPolicy ? <ShopPolicyBlock vehicleType={vehicleType} /> : null}

        <Controller
          control={control}
          name="serviceTypes"
          render={({ field, fieldState }) => {
            const current = field.value ?? [];
            const toggle = (service: ServiceType, enabled: boolean) =>
              field.onChange(
                enabled ? [...new Set([...current, service])] : current.filter((s) => s !== service),
              );
            const card = (service: ServiceType, icon: ReactNode, body: ReactNode) => (
              <ServiceCard
                key={service}
                service={service}
                vehicleType={vehicleType}
                icon={icon}
                checked={current.includes(service)}
                onToggle={(enabled) => toggle(service, enabled)}
              >
                {body}
              </ServiceCard>
            );
            return (
              <div className={styles.services}>
                {fieldState.error ? (
                  <Alert type="error" showIcon title={fieldState.error.message} />
                ) : null}
                {card(
                  SERVICE_TYPE.SELF_DRIVE,
                  <FigmaGlyph name="key" />,
                  <SelfDrivePriceFields
                    control={control}
                    setValue={setValue}
                    pricePreview={pricePreview}
                  />,
                )}
                {card(
                  SERVICE_TYPE.WITH_DRIVER,
                  <FigmaGlyph name="users" />,
                  <WithDriverPriceFields control={control} setValue={setValue} />,
                )}
                {card(
                  SERVICE_TYPE.LONG_TERM,
                  <FigmaGlyph name="calendar" />,
                  <>
                    <LongTermPriceFields control={control} setValue={setValue} />
                    {shopPolicy ? (
                      <div className={styles.inheritNote}>
                        <span>{t('longTermInherit')}</span>
                        <PolicyLink className={styles.inheritLink}>
                          {t('longTermInheritLink')}
                        </PolicyLink>
                      </div>
                    ) : null}
                  </>,
                )}
              </div>
            );
          }}
        />

        <ServicePriceRemovalWarning control={control} />

        <div className={styles.toggleRows}>
          {/* Giao xe tận nơi: Figma không vẽ ô này ở bước tạo, giữ lại theo quyết định 17/11. */}
          <PoliciesSection control={control} isCar={isCar} />
          {autoAccept ? <AutoAcceptRow control={control} {...autoAccept} /> : null}
        </div>
      </div>
    </WizardSection>
  );
}

/** Thẻ một dịch vụ: biểu tượng · tên · mô tả · công tắc; bật thì mở ô giá bên dưới. */
function ServiceCard({
  service,
  vehicleType,
  icon,
  checked,
  onToggle,
  children,
}: {
  service: ServiceType;
  vehicleType: string;
  icon: ReactNode;
  checked: boolean;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations('Vehicles.form.pricingStep.services');
  const domainLabel = useDomainLabel();
  const allowed = isVehicleServiceTypeAllowed(vehicleType, service);
  // Cùng luật với ô chip cũ: chỉ KHOÁ việc BẬT một dịch vụ không hợp loại xe; tắt thì luôn được.
  const locked = !checked && !allowed;
  const title = domainLabel('serviceType', service);
  const toggle = (
    <Switch
      checked={checked}
      disabled={locked}
      onChange={onToggle}
      aria-label={t('toggleLabel', { service: title })}
    />
  );

  return (
    <section className={checked ? styles.serviceCardOn : styles.serviceCard}>
      <div className={styles.serviceHeader}>
        <span className={styles.serviceIcon} aria-hidden="true">
          {icon}
        </span>
        <div className={styles.serviceText}>
          <h3 className={styles.serviceTitle}>{title}</h3>
          <p className={styles.serviceDescription}>{t(`${service}Description`)}</p>
        </div>
        {locked ? <Tooltip title={t('notForVehicleType')}>{toggle}</Tooltip> : toggle}
      </div>
      {checked ? <div className={styles.serviceBody}>{children}</div> : null}
    </section>
  );
}

/** Chính sách thuê kế thừa theo ĐÚNG loại xe đang tạo (17/08) - ô tô/xe máy hai bộ riêng. */
function ShopPolicyBlock({ vehicleType }: { vehicleType: VehicleType }) {
  const t = useTranslations('Vehicles.form.pricingStep');
  const policy = useShopPolicy(vehicleType);
  const values = policy.data?.policy ?? null;
  if (policy.isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (values) return <PolicyPreview values={values} />;
  return (
    <Alert
      type="warning"
      showIcon
      title={t('noPolicyTitle')}
      description={<PolicyLink>{t('noPolicyAction')}</PolicyLink>}
    />
  );
}

/**
 * "Tự động đồng ý nhận chuyến" - chỉ có nghĩa khi xe nhận TỰ LÁI (thiết lập của dịch vụ đó); tắt
 * tự lái thì ô khoá lại và trang không ghi gì.
 */
function AutoAcceptRow({
  control,
  value,
  onChange,
}: {
  control: Control<VehicleFormValues>;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations('Vehicles.form.pricingStep.autoAccept');
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const selfDrive = serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);
  return (
    <Form.Item className={styles.toggleRow}>
      <div className={styles.toggleRowInner}>
        <div>
          <div className={styles.toggleTitle} id="create-auto-accept-label">
            {t('title')}
          </div>
          <div className={styles.toggleDescription}>
            {selfDrive ? t('description') : t('needsSelfDrive')}
          </div>
        </div>
        <Switch
          checked={selfDrive && value}
          disabled={!selfDrive}
          onChange={onChange}
          aria-labelledby="create-auto-accept-label"
        />
      </div>
    </Form.Item>
  );
}

/**
 * Khối "Xe mới tự động kế thừa..." (Figma) - cọc · phí quá giờ · giao xe tận nơi, rồi dải ưu đãi
 * thuê dài hạn. Chỉ hiển thị: mọi giá trị hiệu lực do backend quyết khi dựng báo giá (ADR 0008).
 */
function PolicyPreview({ values }: { values: RentalPolicyValues }) {
  const t = useTranslations('Vehicles.form.pricingStep');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();

  const deliveryValue = values.deliveryEnabled
    ? values.deliveryMaxRadiusKm
      ? t('deliveryOnRadius', { km: values.deliveryMaxRadiusKm })
      : t('deliveryOn')
    : t('deliveryOff');

  return (
    <div className={styles.preview}>
      <div className={styles.previewHeader}>
        <strong>{t('inheritTitle')}</strong>
        <PolicyLink className={styles.inheritLink}>{t('inheritDetail')}</PolicyLink>
      </div>
      <dl className={styles.previewGrid}>
        <div className={styles.previewItem}>
          <dt>{t('deposit')}</dt>
          <dd>{fmt.money(values.depositAmount)}</dd>
        </div>
        <div className={styles.previewItem}>
          <dt>{t('overtime')}</dt>
          <dd>
            {values.overtimeFeePerHour
              ? tUnits('perHour', { value: fmt.money(values.overtimeFeePerHour) })
              : t('notConfigured')}
          </dd>
        </div>
        <div className={styles.previewItem}>
          <dt>{t('delivery')}</dt>
          <dd className={values.deliveryEnabled ? styles.previewOn : undefined}>{deliveryValue}</dd>
        </div>
      </dl>
      {values.discountEnabled && values.discountTiers.length > 0 ? (
        <div className={styles.previewDiscounts}>
          <span className={styles.previewDiscountsLabel}>{t('discountsLabel')}</span>
          <span className={styles.previewChips}>
            {values.discountTiers.map((tier) => (
              <span key={tier.minMonths} className={styles.previewChip}>
                {/* Nhãn "N tháng" đi qua `packageLabel` (ADR 0011) - không tự ghép chữ "tháng". */}
                {t('packageChip', { label: fmt.packageLabel(tier.minMonths) ?? '' })}{' '}
                <span className={styles.previewBadge}>-{tier.percent}%</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Icon gốc của Figma (`24352:81597`…) - SVG làm mask, tô màu thương hiệu bằng CSS. */
function FigmaGlyph({ name }: { name: 'key' | 'users' | 'calendar' }) {
  return <span className={`${styles.glyph} ${styles[`glyph_${name}`]}`} />;
}

/**
 * Link sang Chính sách thuê của gian hàng - mở TAB MỚI (người dùng chốt 18/11/2026): đang nhập dở
 * wizard thêm xe thì không được rời trang.
 */
function PolicyLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      href={ROUTES.MANAGE.SHOP_POLICIES}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      {className ? <span className={styles.linkArrow} aria-hidden="true" /> : null}
    </Link>
  );
}
