'use client';

import { Alert, Card, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { ROUTES } from '@/constants/routes';
import { useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import type { RentalPolicyValues } from '@/features/rental-policies/types';
import { PricingSection } from './VehicleFormSections';
import styles from './CreateVehiclePricingStep.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface CreateVehiclePricingStepProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  pricePreview: React.ReactNode;
}

export function CreateVehiclePricingStep({
  control,
  isCar,
  pricePreview,
}: CreateVehiclePricingStepProps) {
  const t = useTranslations('Vehicles.form.pricingStep');
  // Chính sách kế thừa theo ĐÚNG loại xe đang tạo (17/08) — ô tô/xe máy hai bộ riêng.
  const policy = useShopPolicy(isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE);
  const values = policy.data?.policy ?? null;

  return (
    <div className={styles.stack}>
      <Card title={t('shopPolicyTitle')} className={styles.card}>
        <p className={styles.description}>{t('shopPolicyBody')}</p>
        {policy.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : values ? (
          <PolicyPreview values={values} />
        ) : (
          <Alert
            type="warning"
            showIcon
            message={t('noPolicyTitle')}
            description={
              <Link href={ROUTES.MANAGE.SHOP_POLICIES}>{t('noPolicyAction')}</Link>
            }
          />
        )}
      </Card>

      <Card title={t('vehiclePriceTitle')} className={styles.card}>
        <p className={styles.description}>{t('vehiclePriceBody')}</p>
        <PricingSection control={control} isCar={isCar} pricePreview={pricePreview} />
      </Card>
    </div>
  );
}

/**
 * Panel "Xem trước bảng giá áp dụng" — đúng bố cục thiết kế: nhãn hoa nhỏ, giá trị đậm,
 * giao nhận đang bật tô màu thành công, ưu đãi theo thời gian hiện thành dải mốc.
 * Chỉ hiển thị — mọi giá trị hiệu lực do backend quyết khi dựng báo giá (ADR 0008).
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
        <strong>{t('previewTitle')}</strong>
        <span className={styles.previewSource}>
          {t('previewSource')}{' '}
          <Link href={ROUTES.MANAGE.SHOP_POLICIES}>{t('previewSourceLink')}</Link>
        </span>
      </div>
      <dl className={styles.previewGrid}>
        <div className={styles.previewItem}>
          <dt>{t('deposit')}</dt>
          <dd>{fmt.money(values.depositAmount)}</dd>
        </div>
        <div className={styles.previewItem}>
          <dt>{t('delivery')}</dt>
          <dd className={values.deliveryEnabled ? styles.previewOn : undefined}>{deliveryValue}</dd>
        </div>
        <div className={styles.previewItem}>
          <dt>{t('overtime')}</dt>
          <dd>
            {values.overtimeFeePerHour
              ? tUnits('perHour', { value: fmt.money(values.overtimeFeePerHour) })
              : t('notConfigured')}
          </dd>
        </div>
      </dl>
      {values.discountEnabled && values.discountTiers.length > 0 ? (
        <div className={styles.previewDiscounts}>
          <span className={styles.previewDiscountsLabel}>{t('discountsLabel')}</span>
          <span className={styles.previewChips}>
            {values.discountTiers.map((tier) => (
              <span key={tier.minMonths} className={styles.previewChip}>
                {/* Nhãn "N tháng" đi qua `packageLabel` (ADR 0011) — không tự ghép chữ "tháng". */}
                {t('packageChip', { label: fmt.packageLabel(tier.minMonths) ?? '' })}{' '}
                <DiscountTag percent={tier.percent} size="sm" />
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
