'use client';

import { App, Button, Result, Skeleton } from 'antd';
import { TENANT_STATUS } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { ShopProfileForm } from '@/features/shop/components/ShopProfileForm';
import { ShopStatusCard } from '@/features/shop/components/ShopStatusCard';
import {
  useMyShop,
  useSubmitShopReview,
  useUpdateShopProfile,
} from '@/features/shop/hooks/use-shop';
import { getErrorMessage } from '@/services/api-client';

export default function ShopPage() {
  const { message } = App.useApp();
  const { tenant } = useTenantScope();
  const { data: shop, isLoading, isError, refetch } = useMyShop(Boolean(tenant));
  const updateProfile = useUpdateShopProfile();
  const submitReview = useSubmitShopReview();

  if (isLoading || !shop) {
    if (isError) {
      return (
        <Result
          status="error"
          title="Không tải được hồ sơ gian hàng"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      );
    }
    return (
      <div>
        <ManagePageHeader title="Gian hàng" />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div>
      <ManagePageHeader title={shop.name} />

      <ShopStatusCard
        shop={shop}
        submitting={submitReview.isPending}
        onSubmit={() =>
          submitReview.mutate(undefined, {
            onSuccess: () => message.success('Đã gửi hồ sơ cho nền tảng duyệt'),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }
      />

      <ShopProfileForm
        shop={shop}
        disabled={shop.status === TENANT_STATUS.PENDING_REVIEW}
        submitting={updateProfile.isPending}
        errorMessage={updateProfile.isError ? getErrorMessage(updateProfile.error) : null}
        onSubmit={(body) =>
          updateProfile.mutate(body, {
            onSuccess: () => message.success('Đã lưu hồ sơ'),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }
      />
    </div>
  );
}
