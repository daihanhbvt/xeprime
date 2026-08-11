'use client';

import { App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { PERMISSION } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ShopPolicyForm } from '@/features/rental-policies/components/ShopPolicyForm';
import { useSaveShopPolicy, useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import { getErrorMessage } from '@/services/api-client';

import styles from './page.module.css';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (Wave 2 — Figma `237:1557` / mobile `247:1554`):
 * cọc thế chấp · bậc phí giao nhận theo km · phí quá giờ · ưu đãi theo thời gian thuê.
 * Áp cho mọi xe chưa ghi đè riêng; đơn đã chốt giữ nguyên snapshot (backend đảm bảo).
 */
export default function ShopPoliciesPage() {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);

  const { data, isLoading, isError, refetch } = useShopPolicy(canView);
  const save = useSaveShopPolicy();

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

  const header = (
    <ManagePageHeader
      title="Chính sách thuê mặc định"
      subtitle="Các chính sách dưới đây được áp dụng cho tất cả xe trong gian hàng, trừ xe đã thiết lập riêng biệt."
    />
  );

  if (isLoading || !data) {
    return (
      <div>
        {header}
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  return (
    <div>
      {header}

      {/* Hai chip phạm vi áp dụng (Figma `237:1638`) — số thật từ API, không đếm ở FE. */}
      <div className={styles.statsRow} aria-label="Phạm vi áp dụng chính sách">
        <span className={styles.statInherit}>{data.inheritingVehicles} xe đang kế thừa</span>
        <span className={styles.statOverride}>{data.overriddenVehicles} xe đã ghi đè</span>
      </div>

      <ShopPolicyForm
        initial={data}
        canEdit={canEdit}
        submitting={save.isPending}
        onSubmit={(body) =>
          save.mutate(body, {
            onSuccess: () => message.success('Đã lưu chính sách thuê'),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }
      />
    </div>
  );
}
