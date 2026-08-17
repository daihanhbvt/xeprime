'use client';

import { App, Button, Result, Skeleton, Tabs } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import {
  PERMISSION,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ShopPolicyForm } from '@/features/rental-policies/components/ShopPolicyForm';
import { useSaveShopPolicy, useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import { getErrorMessage } from '@/services/api-client';

import styles from './page.module.css';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (Wave 2 — Figma `237:1557`; tách theo LOẠI XE 17/08):
 * hai tab Ô tô/Xe máy, mỗi tab một bộ cọc thế chấp · bậc phí giao nhận · phí quá giờ · ưu đãi
 * riêng — xe máy không còn phải chịu mức cọc của ô tô. Xe chưa ghi đè riêng kế thừa policy
 * của ĐÚNG loại mình; đơn đã chốt giữ nguyên snapshot (backend đảm bảo).
 */
export default function ShopPoliciesPage() {
  const { has } = usePermissions();
  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);
  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền truy cập"
        description="Bạn cần quyền dưới đây để xem chính sách thuê của gian hàng."
        missingPermissions={[PERMISSION.TENANT_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">Về trang chủ</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <ManagePageHeader
        title="Chính sách thuê mặc định"
        subtitle="Mỗi loại xe một bộ chính sách riêng — áp cho mọi xe cùng loại chưa thiết lập riêng biệt."
      />
      <Tabs
        activeKey={vehicleType}
        onChange={(key) => setVehicleType(key as VehicleType)}
        items={VEHICLE_TYPE_VALUES.map((value) => ({
          key: value,
          label: VEHICLE_TYPE_LABEL[value],
          children: <PolicyTab vehicleType={value} canEdit={canEdit} />,
        }))}
      />
    </div>
  );
}

/** Một tab = một bộ policy theo loại xe — query/mutation/cache tách riêng theo loại. */
function PolicyTab({ vehicleType, canEdit }: { vehicleType: VehicleType; canEdit: boolean }) {
  const { message } = App.useApp();
  const { data, isLoading, isError, refetch } = useShopPolicy(vehicleType);
  const save = useSaveShopPolicy(vehicleType);

  if (isError && !data) {
    return (
      <Result
        status="error"
        title="Không tải được chính sách thuê"
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  if (isLoading || !data) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
  }

  return (
    <div>
      {/* Hai chip phạm vi áp dụng — số thật từ API, đếm theo ĐÚNG loại xe của tab. */}
      <div className={styles.statsRow} aria-label="Phạm vi áp dụng chính sách">
        <span className={styles.statInherit}>
          {data.inheritingVehicles} {VEHICLE_TYPE_LABEL[vehicleType].toLowerCase()} đang kế thừa
        </span>
        <span className={styles.statOverride}>{data.overriddenVehicles} xe đã ghi đè</span>
      </div>

      <ShopPolicyForm
        // Remount khi đổi tab — form không mang giá trị của loại xe trước sang loại sau.
        key={vehicleType}
        initial={data}
        canEdit={canEdit}
        submitting={save.isPending}
        onSubmit={(body) =>
          save.mutate(body, {
            onSuccess: () =>
              message.success(`Đã lưu chính sách thuê cho ${VEHICLE_TYPE_LABEL[vehicleType]}`),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }
      />
    </div>
  );
}
