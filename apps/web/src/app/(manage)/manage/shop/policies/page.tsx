'use client';

import { CheckCircleOutlined, CarOutlined, DashboardOutlined } from '@ant-design/icons';
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
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { ShopPolicyForm } from '@/features/rental-policies/components/ShopPolicyForm';
import { useSaveShopPolicy, useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import { getErrorMessage } from '@/services/api-client';

import styles from './page.module.css';

/** Chính sách mặc định tách riêng theo loại xe; đơn đã chốt luôn giữ snapshot ở backend. */
export default function ShopPoliciesPage() {
  const { has } = usePermissions();
  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);

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
    <div className={styles.page}>
      <ManagePageHeader
        title="Chính sách thuê mặc định"
        subtitle="Thiết lập các quy định và chi phí áp dụng mặc định cho mọi đơn thuê."
      />
      <PolicyWorkspace canEdit={canEdit} />
    </div>
  );
}

/** Một workspace theo loại xe: query, mutation và form không bị lẫn dữ liệu giữa hai tab. */
function PolicyWorkspace({ canEdit }: { canEdit: boolean }) {
  const { message } = App.useApp();
  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);
  const { data, isLoading, isError, refetch } = useShopPolicy(vehicleType);
  const save = useSaveShopPolicy(vehicleType);
  const vehicleLabel = VEHICLE_TYPE_LABEL[vehicleType].toLowerCase();

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          {data ? (
            <span className={styles.appliedPill}>
              <CheckCircleOutlined aria-hidden="true" />
              <span>
                Đã áp dụng cho {data.inheritingVehicles} {vehicleLabel}
              </span>
              {data.overriddenVehicles > 0 ? (
                <PolicyInfoTip
                  label="Giải thích phạm vi áp dụng chính sách"
                  placement="bottomRight"
                >
                  {data.overriddenVehicles} xe đang dùng chính sách riêng nên không kế thừa bộ chính
                  sách mặc định này.
                </PolicyInfoTip>
              ) : null}
            </span>
          ) : null}
        </div>

        <Tabs
          className={styles.vehicleTabs}
          activeKey={vehicleType}
          onChange={(key) => setVehicleType(key as VehicleType)}
          items={VEHICLE_TYPE_VALUES.map((value) => ({
            key: value,
            label: (
              <span className={styles.tabLabel}>
                {value === VEHICLE_TYPE.CAR ? (
                  <CarOutlined aria-hidden="true" />
                ) : (
                  <DashboardOutlined aria-hidden="true" />
                )}
                {VEHICLE_TYPE_LABEL[value]}
              </span>
            ),
          }))}
        />
      </div>

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được chính sách thuê"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : null}

      {isLoading || (!data && !isError) ? (
        <div className={styles.loadingCard}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      ) : null}

      {data ? (
        <ShopPolicyForm
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
      ) : null}
    </>
  );
}
