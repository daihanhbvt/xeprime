'use client';

import { App, Button, Skeleton } from 'antd';
import { EmptyState } from '@/components/feedback/EmptyState';
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
} from '@/constants/routes';
import { useMyProfile } from '@/features/account/hooks/use-account';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { useCurrentUser } from '@/hooks/use-current-user';
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
 * Tiêu đề, các thẻ, hộp thoại sửa và checklist nằm trong `ShopWorkspace` chứ không ở đây: chúng
 * dùng chung MỘT form hồ sơ, và chỉ form biết nhóm nào đang sửa dở.
 *
 * Không còn nút "Gửi xác minh" (24/09/2026): nền tảng tạm ngừng xác minh gian hàng, và màn duyệt
 * của nền tảng chỉ nhận phiếu XE - một phiếu xác minh gửi lúc này không có ai xử lý.
 *
 * `?section=` đọc ở ĐÂY (ADR 0004: điều hướng trong trang sống ở URL), rồi truyền xuống như một giá
 * trị đã phân giải - workspace không bao giờ phải nghĩ về chuỗi rác trong query. Trang không còn
 * mục lục (design 06/11/2026), nên tham số chỉ còn là ĐÍCH CUỘN của link/redirect cũ.
 */
export function ShopPage() {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const { filters } = useUrlFilters((params) => ({
    section: shopSectionOf(params.get(SECTION_PARAM)),
    // Dẫn xuất, KHÔNG bao giờ ghi ngược lên URL - xem `ShopWorkspaceProps.sectionInUrl`.
    sectionInUrl: params.has(SECTION_PARAM),
    /*
     * `?welcome=1` - "gian hàng vừa thanh toán gói xong" (ADR 0040). Chỉ điều khiển một dải chào
     * NHỎ, không mở hay khoá bất cứ thứ gì: quyền đến từ `/auth/me` và cổng logo thật nằm ở
     * `submitForPublicReview`. Nên nó được phép sống trong URL - kịch bản xấu nhất là ai đó nhận
     * một link và thấy một dòng chào mừng không dành cho họ.
     */
    welcome: params.get(SHOP_WELCOME_PARAM) === '1',
    // `?section=payout` CŨ - "Tài khoản nhận tiền" đã về trang số dư (07/10/2026).
    legacyPayout: params.get(SECTION_PARAM) === SHOP_LEGACY_PAYOUT_SECTION,
  }));

  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);
  /*
   * Link cũ tới "Tài khoản nhận tiền" (thông báo, bookmark) đi tiếp tới trang số dư - chỉ với CHỦ,
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
   * Mặt tiền CÁ NHÂN — "Hồ sơ chủ xe" (ADR 0085 điều 2): tên, ảnh khách thấy là của TÀI KHOẢN chủ
   * (ADR 0054), nên trang nạp thêm hồ sơ tài khoản. Đọc từ NGƯỜI ĐĂNG NHẬP, không từ tenant đang
   * xem: bản này sửa tài khoản của chính người xem, nên chỉ CHỦ xe tuyến hoa hồng mới có nó. Phiên
   * hỗ trợ (người xem là nhân sự nền tảng) và thành viên luôn ở bản gian hàng.
   */
  const { data: user } = useCurrentUser();
  const personal = isCommissionOwner(user);
  const ownerProfile = useMyProfile({ enabled: personal && canView && !redirectToPayout });
  /*
   * "Đã có xe nào chưa" - CHỈ hỏi khi dải chào mừng đang mở.
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

  if ((isError && !shop) || (personal && ownerProfile.isError && !ownerProfile.data)) {
    return (
      <EmptyState
        variant="error"
        title={t('page.loadError')}
        action={
          <Button
            type="primary"
            onClick={() => {
              if (isError) void refetch();
              if (ownerProfile.isError) void ownerProfile.refetch();
            }}
          >
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  if (isLoading || !shop || (personal && !ownerProfile.data)) {
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
        ownerProfile={personal ? ownerProfile.data : undefined}
        canEdit={canEdit}
        saving={updateProfile.isPending}
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
         * Trong lúc lượt đếm bay đi, `data` rỗng - và mặc định "chưa có" sẽ nháy dải "Sẵn sàng
         * rồi · Đăng xe đầu tiên" cho một gian hàng đang có mười xe. Dải này im lặng khi không
         * còn gì để nói (xem `ShopWelcomeBanner`), nên im lặng cũng là mặc định đúng khi CHƯA
         * BIẾT.
         */
        hasVehicle={vehicles.isLoading || (vehicles.data?.items.length ?? 0) > 0}
        onSave={(body) =>
          updateProfile.mutateAsync(body).then(
            () => {
              message.success(t('form.saved'));
            },
            (error: unknown) => {
              message.error(errorMessage(error));
              throw error;
            },
          )
        }
      />
    </div>
  );
}
