'use client';

import { App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { DepositToggleCard } from '@/features/shop/components/DepositToggleCard';
import { usePaymentSettings, useUpdatePaymentSettings } from '@/features/shop/hooks/use-shop';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useErrorMessage } from '@/i18n/use-error-message';

import styles from './page.module.css';

/**
 * Công tắc thu cọc qua XePrime — Phase 6.
 *
 * Route KHÔNG gác theo `PLAN_FEATURE.ESCROW_HOLD` (ADR 0027 điều 4): gian hàng thiếu cờ vào đây
 * để ĐỌC trạng thái và hiểu tính năng thuộc gói nào; chặn thật nằm ở server cho đường GHI.
 */
export default function ShopPaymentSettingsPage() {
  const t = useTranslations('Shop.paymentSettings');
  const tCommon = useTranslations('Common');
  const tShop = useTranslations('Shop');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canEdit = has(PERMISSION.SELLER_PROFILE_MANAGE);

  const { data, isLoading, isError, refetch } = usePaymentSettings(canView && Boolean(tenant));
  const update = useUpdatePaymentSettings();

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbidden.title')}
        description={t('forbidden.description')}
        missingPermissions={[PERMISSION.SELLER_PROFILE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{tShop('page.forbidden.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />

      {isError && !data ? (
        <Result
          status="error"
          title={t('loadError')}
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {isLoading || (!data && !isError) ? <Skeleton active paragraph={{ rows: 6 }} /> : null}

      {data ? (
        <DepositToggleCard
          settings={data}
          canEdit={canEdit}
          saving={update.isPending}
          onChange={(enabled) =>
            update.mutate(
              { depositCollectionEnabled: enabled },
              {
                onSuccess: () => message.success(t('toggle.saved')),
                onError: (error) => message.error(errorMessage(error)),
              },
            )
          }
        />
      ) : null}
    </div>
  );
}
