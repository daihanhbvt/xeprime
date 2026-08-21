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
import { useErrorMessage } from '@/i18n/use-error-message';
import { ShopProfileWorkspace } from '@/features/shop/components/ShopProfileWorkspace';
import {
  useMyShop,
  useSubmitShopReview,
  useUpdateShopProfile,
} from '@/features/shop/hooks/use-shop';
import type { UpdateProfileInput } from '@/features/shop/types';

import styles from './page.module.css';

/**
 * Route chỉ lo bốn việc: quyền, dữ liệu, mutation, và các trạng thái chưa-có-dữ-liệu.
 *
 * Tiêu đề, dải trạng thái, checklist và cả hai nút (Lưu · Gửi duyệt) nằm trong
 * `ShopProfileWorkspace` chứ không ở đây: cả bốn thứ chỉ có nghĩa khi biết form CÓ THAY ĐỔI HAY
 * CHƯA và CÒN THIẾU GÌ — hai câu hỏi mà chỉ form trả lời được.
 */
export default function ShopPage() {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);
  const canSubmit = has(PERMISSION.TENANT_SUBMIT_REVIEW);

  const { data: shop, isLoading, isError, refetch } = useMyShop(canView && Boolean(tenant));
  const updateProfile = useUpdateShopProfile();
  const submitReview = useSubmitShopReview();

  /**
   * Gửi duyệt = (lưu nốt nếu còn dở) → gửi.
   *
   * Backend snapshot hồ sơ TỪ DATABASE, nên gửi thẳng khi form còn thay đổi chưa lưu sẽ đưa cho
   * người duyệt đúng bản cũ mà chủ shop vừa sửa xong và tưởng đã gửi đi. Nối hai bước ở đây
   * thay vì bắt người dùng nhớ bấm Lưu trước — họ vừa bấm "Gửi duyệt" trên chính thứ đang nhìn.
   */
  function submitForReview(pendingChanges: UpdateProfileInput | null) {
    const send = () =>
      submitReview.mutate(undefined, {
        onSuccess: () => message.success(t('status.submitted')),
        onError: (error) => message.error(errorMessage(error)),
      });

    if (!pendingChanges) return send();
    updateProfile.mutate(pendingChanges, {
      onSuccess: send,
      onError: (error) => message.error(errorMessage(error)),
    });
  }

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
        canSubmit={canSubmit}
        saving={updateProfile.isPending}
        // Bước lưu-trước cũng là một phần của "đang gửi duyệt": nút phải quay suốt cả hai chặng,
        // nếu không nó sáng lại giữa chừng và mời bấm lần thứ hai.
        submitting={submitReview.isPending || updateProfile.isPending}
        errorMessage={updateProfile.isError ? errorMessage(updateProfile.error) : null}
        onSave={(body) =>
          updateProfile.mutate(body, {
            onSuccess: () => message.success(t('form.saved')),
            onError: (error) => message.error(errorMessage(error)),
          })
        }
        onSubmitReview={submitForReview}
      />
    </div>
  );
}
