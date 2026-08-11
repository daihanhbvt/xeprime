'use client';

import { Alert, Card, Descriptions, Skeleton } from 'antd';
import Link from 'next/link';
import type { Control } from 'react-hook-form';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES } from '@/constants/routes';
import { formatMoneyVnd } from '@/lib/money';
import { useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
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
  const policy = useShopPolicy();
  const values = policy.data?.policy ?? null;

  return (
    <div className={styles.stack}>
      <Card title="Chính sách chung của gian hàng" className={styles.card}>
        <p className={styles.description}>
          Xe mới tự động kế thừa tiền cọc, giao nhận, phí quá giờ và ưu đãi của gian hàng.
        </p>
        {policy.isLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : values ? (
          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Tiền đặt cọc">
              {formatMoneyVnd(values.depositAmount)}
            </Descriptions.Item>
            <Descriptions.Item label="Giao nhận">
              {values.deliveryEnabled
                ? `Bật · ${values.deliveryTiers.length} mức khoảng cách`
                : 'Tắt'}
            </Descriptions.Item>
            <Descriptions.Item label="Phí quá giờ">
              {values.overtimeFeePerHour
                ? `${formatMoneyVnd(values.overtimeFeePerHour)}/giờ`
                : 'Chưa cấu hình'}
            </Descriptions.Item>
            <Descriptions.Item label="Ưu đãi theo thời gian">
              {values.discountEnabled ? `${values.discountTiers.length} mức giảm` : 'Tắt'}
            </Descriptions.Item>
          </Descriptions>
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
        <Link href={ROUTES.MANAGE.SHOP_POLICIES} className={styles.policyLink}>
          Xem chi tiết chính sách gian hàng →
        </Link>
      </Card>

      <Card title="Giá thuê tham chiếu của xe" className={styles.card}>
        <p className={styles.description}>
          Giá thuê là thuộc tính riêng của từng xe. Sau khi tạo, bạn có thể cấu hình chính sách ghi
          đè tại tab Giá & chính sách.
        </p>
        <PricingSection control={control} isCar={isCar} pricePreview={pricePreview} />
      </Card>
    </div>
  );
}
