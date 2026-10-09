import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { PERMISSION, SELLER_PROFILE_STATUS_META } from '@xeprime/types';
import { metaColor } from '@/lib/status-meta';
import { AppHeader } from '@/components/layout/AppHeader';
import { ShellPageHeader, type PageShell } from '@/features/shell/ShellPageHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useSellerProfile } from '@/features/seller-profile/hooks/use-seller-profile';
import { SellerTaxForm } from '@/features/seller-profile/components/SellerTaxForm';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

/**
 * "Thông tin khai thuế" — bản COMPACT của hồ sơ người bán cho chủ xe. Bản native của
 * `SellerTaxCompactForm`.
 *
 * Cùng query, cùng mutation, cùng bốn trường và cùng quyền với bản web; chỉ hiện những gì model
 * THẬT có: loại chủ thể, tên pháp lý, và CCCD (cá nhân) hoặc mã số thuế (hộ kinh doanh/doanh
 * nghiệp).
 *
 * Ba điều cố ý, y như web:
 *  - Biểu mẫu (ghi TOÀN PHẦN `PUT /seller-profile`, khoá ô, nút Lưu) là `SellerTaxForm`, dùng
 *    chung với khối khai thuế của trang Cửa hàng (gian hàng tuyến gói, PR #159).
 *  - KHÔNG có ô "loại hình cư trú" và KHÔNG có tỷ lệ thuế nào: model chưa có trường cư trú, và
 *    phân loại/tỷ lệ production còn chờ tư vấn thuế (ADR 0028 điều 4).
 *  - Cổng chủ xe nằm ở route (`OwnerGate`), nên tới được đây đã là chủ gian hàng; phần kiểm ở
 *    đây là QUYỀN (`seller_profile.*`), thứ nhân sự cùng gian hàng cũng có thể thiếu.
 */
export function TaxScreen({
  shell = 'account',
}: {
  /**
   * `manage` = mục menu Owner Lite của app XePrime Partner (trong bộ tab, nút mở menu) — ADR 0053.
   * `account` = màn chen ngang có nút lui.
   */
  shell?: PageShell;
} = {}) {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const router = useRouter();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();

  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);

  const profileQuery = useSellerProfile({ enabled: canView });
  const profile = profileQuery.data;

  const statusBadge = profile ? (
    <StatusBadge
      label={domainLabel('sellerProfileStatus', profile.status)}
      color={metaColor(SELLER_PROFILE_STATUS_META, profile.status)}
      size="sm"
    />
  ) : null;
  const header =
    shell === 'manage' ? (
      <ShellPageHeader
        shell="manage"
        title={t('title')}
        subtitle={t('subtitle')}
        backTo={ROUTES.account.home()}
        {...(statusBadge ? { right: statusBadge } : {})}
      />
    ) : (
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
        {...(statusBadge ? { badge: statusBadge } : {})}
      />
    );

  if (!canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tSeller('page.noPermissionTitle')}
            description={tSeller('page.noPermission')}
            actionLabel={tSeller('page.backHome')}
            onAction={() => router.replace(ROUTES.account.home())}
          />
        </Screen>
      </>
    );
  }

  if (profileQuery.isLoading) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={5} />
        </Screen>
      </>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={profileQuery.error}
            title={t('loadError')}
            onRetry={() => void profileQuery.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        {/*
          Chỉ biểu mẫu khai thuế — đúng `SellerTaxSection` bên web (07/10/2026). Thuế ĐÃ khấu trừ
          theo kỳ là chuyện tiền, nên nó ở màn "Số dư & rút tiền" (`WalletScreen`), không ở đây.
        */}
        <SellerTaxForm profile={profile} />
      </Screen>
    </>
  );
}
