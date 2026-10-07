'use client';

import { App, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION, TENANT_ROLE, isEstablishedPackageShop } from '@xeprime/types';

import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import {
  ROUTES,
  SECTION_PARAM,
  SHOP_LEGACY_PAYOUT_SECTION,
  SHOP_WELCOME_PARAM,
  balancePayoutPath,
  shopSectionOf,
  type ShopSection,
} from '@/constants/routes';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ShopWorkspace } from '@/features/shop/components/ShopWorkspace';
import { useMyShop, useUpdateShopProfile } from '@/features/shop/hooks/use-shop';

import styles from './ShopPage.module.css';

/**
 * Route lo năm việc: quyền, dữ liệu, mutation, các trạng thái chưa-có-dữ-liệu, và `?section=`.
 *
 * Tiêu đề, mục lục, dải trạng thái, checklist và nút Lưu nằm trong `ShopWorkspace` chứ không ở
 * đây: tất cả chỉ có nghĩa khi biết form CÓ THAY ĐỔI HAY CHƯA và CÒN THIẾU GÌ — hai câu hỏi mà chỉ
 * form trả lời được.
 *
 * Không còn nút "Gửi xác minh" (24/09/2026): nền tảng tạm ngừng xác minh gian hàng, và màn duyệt
 * của nền tảng chỉ nhận phiếu XE — một phiếu xác minh gửi lúc này không có ai xử lý.
 *
 * `?section=` đọc và ghi ở ĐÂY (ADR 0004: filter/điều hướng trong trang sống ở URL), rồi truyền
 * xuống như một giá trị đã phân giải — workspace không bao giờ phải nghĩ về chuỗi rác trong query.
 * `resetPage: false` vì đổi section KHÔNG đổi tập dữ liệu nào; nó chỉ cuộn. Để mặc định thì mỗi
 * lần bấm mục lục sẽ xoá `?page=` của bảng lịch sử hoá đơn đang mở ngay bên dưới.
 */
export function ShopPage() {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const { filters, setFilters } = useUrlFilters((params) => ({
    section: shopSectionOf(params.get(SECTION_PARAM)),
    // Dẫn xuất, KHÔNG bao giờ ghi ngược lên URL — xem `ShopWorkspaceProps.sectionInUrl`.
    sectionInUrl: params.has(SECTION_PARAM),
    /*
     * `?welcome=1` — "gian hàng vừa thanh toán gói xong" (ADR 0040). Chỉ điều khiển một dải chào
     * NHỎ, không mở hay khoá bất cứ thứ gì: quyền đến từ `/auth/me` và cổng logo thật nằm ở
     * `submitForPublicReview`. Nên nó được phép sống trong URL — kịch bản xấu nhất là ai đó nhận
     * một link và thấy một dòng chào mừng không dành cho họ.
     */
    welcome: params.get(SHOP_WELCOME_PARAM) === '1',
    // `?section=payout` CŨ — "Tài khoản nhận tiền" đã về trang số dư (07/10/2026).
    legacyPayout: params.get(SECTION_PARAM) === SHOP_LEGACY_PAYOUT_SECTION,
  }));

  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);
  /*
   * Link cũ tới "Tài khoản nhận tiền" (thông báo, bookmark) đi tiếp tới trang số dư — chỉ với CHỦ,
   * đúng người section cũ từng hiện cho. Người khác (quản lý, nhân sự trong phiên hỗ trợ) chưa bao
   * giờ thấy section đó, nên `shopSectionOf` đưa họ về đầu trang như mọi giá trị lạ.
   */
  const redirectToPayout = filters.legacyPayout && tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;

  const {
    data: shop,
    isLoading,
    isError,
    refetch,
  } = useMyShop(canView && Boolean(tenant) && !redirectToPayout);
  const updateProfile = useUpdateShopProfile();
  /*
   * "Đã có xe nào chưa" — CHỈ hỏi khi dải chào mừng đang mở.
   *
   * `limit: 1` vì câu hỏi là có/không, không phải một danh sách. Và có điều kiện vì đây là một
   * request THÊM trên một trang đã gọi nhiều endpoint: mọi lượt mở `/manage/shop` bình thường
   * không được trả giá cho một dải chỉ hiện đúng một lần trong đời gian hàng.
   */
  const vehicles = useVehicles({ page: 1, limit: 1 }, { enabled: filters.welcome && canView });

  if (redirectToPayout) return <ClientRedirect href={balancePayoutPath()} />;

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
        saving={updateProfile.isPending}
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
      />
    </div>
  );
}
