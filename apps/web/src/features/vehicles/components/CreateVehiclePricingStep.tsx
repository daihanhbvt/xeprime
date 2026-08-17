'use client';

import { Alert, Card, Skeleton } from 'antd';
import Link from 'next/link';
import type { Control } from 'react-hook-form';
import { VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES } from '@/constants/routes';
import { formatMoneyVnd } from '@/lib/money';
import { useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import type { RentalPolicyValues } from '@/features/rental-policies/types';
import { PricingSection } from './VehicleFormSections';
import styles from './CreateVehiclePricingStep.module.css';

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
  // Chính sách kế thừa theo ĐÚNG loại xe đang tạo (17/08) — ô tô/xe máy hai bộ riêng.
  const policy = useShopPolicy(isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE);
  const values = policy.data?.policy ?? null;

  return (
    <div className={styles.stack}>
      <Card title="Chính sách giá chung của gian hàng" className={styles.card}>
        <p className={styles.description}>
          Xe mới tự động kế thừa tiền cọc, giao nhận, phí quá giờ và ưu đãi của gian hàng.
        </p>
        {policy.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : values ? (
          <PolicyPreview values={values} />
        ) : (
          <Alert
            type="warning"
            showIcon
            message="Gian hàng chưa có chính sách thuê chung"
            description={
              <Link href={ROUTES.MANAGE.SHOP_POLICIES}>Thiết lập chính sách gian hàng</Link>
            }
          />
        )}
      </Card>

      <Card title="Giá thuê tham chiếu của xe" className={styles.card}>
        <p className={styles.description}>
          Giá thuê là thuộc tính riêng của từng xe. Sau khi tạo, bạn có thể thiết lập giá và chính
          sách riêng cho xe này tại tab Giá &amp; chính sách.
        </p>
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
  const deliveryValue = values.deliveryEnabled
    ? values.deliveryMaxRadiusKm
      ? `Bật (Bán kính ${values.deliveryMaxRadiusKm}km)`
      : 'Bật'
    : 'Tắt';

  return (
    <div className={styles.preview}>
      <div className={styles.previewHeader}>
        <strong>Xem trước bảng giá áp dụng</strong>
        <span className={styles.previewSource}>
          Theo chính sách gian hàng{' '}
          <Link href={ROUTES.MANAGE.SHOP_POLICIES}>Xem chi tiết</Link>
        </span>
      </div>
      <dl className={styles.previewGrid}>
        <div className={styles.previewItem}>
          <dt>Tiền thế chấp (cọc)</dt>
          <dd>{formatMoneyVnd(values.depositAmount)}</dd>
        </div>
        <div className={styles.previewItem}>
          <dt>Giao nhận tận nơi</dt>
          <dd className={values.deliveryEnabled ? styles.previewOn : undefined}>{deliveryValue}</dd>
        </div>
        <div className={styles.previewItem}>
          <dt>Phí quá giờ trả xe</dt>
          <dd>
            {values.overtimeFeePerHour
              ? `${formatMoneyVnd(values.overtimeFeePerHour)}/giờ`
              : 'Chưa cấu hình'}
          </dd>
        </div>
      </dl>
      {values.discountEnabled && values.discountTiers.length > 0 ? (
        <div className={styles.previewDiscounts}>
          <span className={styles.previewDiscountsLabel}>
            Chính sách khuyến mãi theo thời gian
          </span>
          <span className={styles.previewChips}>
            {values.discountTiers.map((tier) => (
              <span key={tier.minDays} className={styles.previewChip}>
                Từ {tier.minDays} ngày: -{tier.percent}%
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
