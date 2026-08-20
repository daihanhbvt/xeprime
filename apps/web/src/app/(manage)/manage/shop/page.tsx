'use client';

import { App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { ShopProfileWorkspace } from '@/features/shop/components/ShopProfileWorkspace';
import { ShopStatusBanner } from '@/features/shop/components/ShopStatusBanner';
import {
  useMyShop,
  useSubmitShopReview,
  useUpdateShopProfile,
} from '@/features/shop/hooks/use-shop';
import { getErrorMessage } from '@/services/api-client';

import styles from './page.module.css';

/**
 * Route chỉ lo bốn việc: quyền, dữ liệu, mutation, và các trạng thái chưa-có-dữ-liệu.
 *
 * Tiêu đề + nút Lưu/Huỷ nằm trong `ShopProfileWorkspace` chứ không ở đây, vì cả hai nút chỉ có
 * nghĩa khi biết form CÓ THAY ĐỔI HAY CHƯA — trạng thái đó thuộc về form.
 */
export default function ShopPage() {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);
  const canSubmit = has(PERMISSION.TENANT_SUBMIT_REVIEW);

  const { data: shop, isLoading, isError, refetch } = useMyShop(canView && Boolean(tenant));
  const updateProfile = useUpdateShopProfile();
  const submitReview = useSubmitShopReview();

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('page.forbidden.title')}
        description={t('page.forbidden.description')}
        missingPermissions={[PERMISSION.TENANT_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{t('page.forbidden.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  if (isError && !shop) {
    return (
      <Result
        status="error"
        title={t('page.loadError')}
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  if (isLoading || !shop) {
    return (
      <div className={styles.page}>
        <ManagePageHeader title={tenant?.name ?? ''} subtitle={t('page.subtitle')} />
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ShopProfileWorkspace
        shop={shop}
        canEdit={canEdit}
        saving={updateProfile.isPending}
        errorMessage={updateProfile.isError ? getErrorMessage(updateProfile.error) : null}
        onSubmit={(body) =>
          updateProfile.mutate(body, {
            onSuccess: () => message.success(t('form.saved')),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }
        banner={
          <ShopStatusBanner
            shop={shop}
            canSubmit={canSubmit}
            submitting={submitReview.isPending}
            onSubmit={() =>
              submitReview.mutate(undefined, {
                onSuccess: () => message.success(t('status.submitted')),
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          />
        }
      />
    </div>
  );
}
