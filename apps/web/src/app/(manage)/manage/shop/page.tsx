'use client';

import { App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION, isEstablishedPackageShop } from '@xeprime/types';

import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES, SHOP_WELCOME_PARAM, shopSectionOf, type ShopSection } from '@/constants/routes';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ShopWorkspace } from '@/features/shop/components/ShopWorkspace';
import {
  useMyShop,
  useSubmitShopReview,
  useUpdateShopProfile,
} from '@/features/shop/hooks/use-shop';
import type { UpdateProfileInput } from '@/features/shop/types';

import styles from './page.module.css';

/**
 * Route lo năm việc: quyền, dữ liệu, mutation, các trạng thái chưa-có-dữ-liệu, và `?section=`.
 *
 * Tiêu đề, mục lục, dải trạng thái, checklist và cả hai nút (Lưu · Gửi duyệt) nằm trong
 * `ShopWorkspace` chứ không ở đây: tất cả chỉ có nghĩa khi biết form CÓ THAY ĐỔI HAY CHƯA và CÒN
 * THIẾU GÌ — hai câu hỏi mà chỉ form trả lời được.
 *
 * `?section=` đọc và ghi ở ĐÂY (ADR 0004: filter/điều hướng trong trang sống ở URL), rồi truyền
 * xuống như một giá trị đã phân giải — workspace không bao giờ phải nghĩ về chuỗi rác trong query.
 * `resetPage: false` vì đổi section KHÔNG đổi tập dữ liệu nào; nó chỉ cuộn. Để mặc định thì mỗi
 * lần bấm mục lục sẽ xoá `?page=` của bảng lịch sử hoá đơn đang mở ngay bên dưới.
 */
export default function ShopPage() {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const { filters, setFilters } = useUrlFilters((params) => ({
    section: shopSectionOf(params.get('section')),
    // Dẫn xuất, KHÔNG bao giờ ghi ngược lên URL — xem `ShopWorkspaceProps.sectionInUrl`.
    sectionInUrl: params.has('section'),
    /*
     * `?welcome=1` — "gian hàng vừa thanh toán gói xong" (ADR 0040). Chỉ điều khiển một dải chào
     * NHỎ, không mở hay khoá bất cứ thứ gì: quyền đến từ `/auth/me` và cổng logo thật nằm ở
     * `submitForPublicReview`. Nên nó được phép sống trong URL — kịch bản xấu nhất là ai đó nhận
     * một link và thấy một dòng chào mừng không dành cho họ.
     */
    welcome: params.get(SHOP_WELCOME_PARAM) === '1',
  }));

  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);
  const canSubmit = has(PERMISSION.TENANT_SUBMIT_REVIEW);

  const { data: shop, isLoading, isError, refetch } = useMyShop(canView && Boolean(tenant));
  const updateProfile = useUpdateShopProfile();
  const submitReview = useSubmitShopReview();
  /*
   * "Đã có xe nào chưa" — CHỈ hỏi khi dải chào mừng đang mở.
   *
   * `limit: 1` vì câu hỏi là có/không, không phải một danh sách. Và có điều kiện vì đây là một
   * request THÊM trên một trang đã gọi nhiều endpoint: mọi lượt mở `/manage/shop` bình thường
   * không được trả giá cho một dải chỉ hiện đúng một lần trong đời gian hàng.
   */
  const vehicles = useVehicles({ page: 1, limit: 1 }, { enabled: filters.welcome && canView });

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
      <ShopWorkspace
        shop={shop}
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={updateProfile.isPending}
        // Bước lưu-trước cũng là một phần của "đang gửi duyệt": nút phải quay suốt cả hai chặng,
        // nếu không nó sáng lại giữa chừng và mời bấm lần thứ hai.
        submitting={submitReview.isPending || updateProfile.isPending}
        errorMessage={updateProfile.isError ? errorMessage(updateProfile.error) : null}
        section={filters.section}
        sectionInUrl={filters.sectionInUrl}
        /*
         * Dải chào mừng chỉ dựng khi CẢ HAI đúng: URL nói vừa thanh toán xong, và gian hàng này
         * thật sự đi qua cửa gói (`package_active`). Điều kiện thứ hai chặn một link `?welcome=1`
         * chia sẻ sang tài khoản khác hiện một dòng chào vô nghĩa cho một chủ xe tuyến hoa hồng.
         */
        welcome={filters.welcome && isEstablishedPackageShop(tenant)}
        /*
         * `isLoading` tính là ĐÃ CÓ XE, không phải "chưa có".
         *
         * Trong lúc lượt đếm bay đi, `data` rỗng — và mặc định "chưa có" sẽ nháy dải "Sẵn sàng
         * rồi · Đăng xe đầu tiên" cho một gian hàng đang có mười xe. Dải này im lặng khi không
         * còn gì để nói (xem `ShopWelcomeBanner`), nên im lặng cũng là mặc định đúng khi CHƯA
         * BIẾT.
         */
        hasVehicle={vehicles.isLoading || (vehicles.data?.items.length ?? 0) > 0}
        onSectionChange={(section: ShopSection) => setFilters({ section }, { resetPage: false })}
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
