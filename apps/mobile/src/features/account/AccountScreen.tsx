import { useTranslations } from 'use-intl';
import { tenantUsesManagePortal } from '@xeprime/types';
import { YStack } from 'tamagui';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { SettingRow } from '@/components/ui/SettingRow';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ShopEntryCard } from '@/features/shell/ShopEntryCard';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';
import { showsDeleteAccountCard } from './account-nav';
import { AccountNav } from './components/AccountNav';
import { AccountTrackNotice } from './components/AccountTrackNotice';
import { PersonalProfileCard } from './components/PersonalProfileCard';
import { useMyProfile } from './hooks/use-account';
import type { UserProfile } from './api';

/**
 * Tab "Tài khoản" (CUS-04) — bản native của trang `/account` bên web.
 *
 * THỨ TỰ KHỐI:
 *
 *  1. thẻ hồ sơ (`PersonalProfileCard`);
 *  2. điều hướng tài khoản (`AccountNav` = `AccountSidebar`, kèm Đăng xuất ở cuối) — web ở
 *     ≤900px xếp menu LÊN TRÊN, app cố ý để DƯỚI thẻ hồ sơ (người dùng chốt 15/09/2026): mở tab
 *     Tài khoản là muốn thấy mình là ai trước, rồi mới tới danh sách lối đi;
 *  3. thẻ cửa vào gian hàng (`ShopEntryCard`).
 *
 * ## Sửa hồ sơ ở đây hay ở khu quản lý — theo TUYẾN (người dùng chốt 16/09/2026)
 *
 * Gian hàng tuyến GÓI sửa hồ sơ con người ở "Tài khoản & bảo mật" (`/manage/account`); tab này
 * với họ chỉ để XEM. Chủ xe tuyến hoa hồng và khách thuê thì không có khu quản lý nào để vào,
 * nên họ sửa ngay tại đây. Một tài khoản chỉ có ĐÚNG MỘT bề mặt sửa được — hai bề mặt là hai chỗ
 * phải sửa mỗi lần đổi luật, và người dùng không đoán được cái nào là "thật".
 *
 * KHÔNG có bộ đổi ngôn ngữ ở cuối màn (gỡ 15/09/2026): `LocaleSwitcher` đã nằm ngay trên thanh
 * đầu màn (`HeaderActions`), nên thẻ ở chân trang là lối vào THỨ HAI cho cùng một công tắc —
 * người dùng phải đọc hết màn mới biết hai chỗ đó là một.
 *
 * Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: hai endpoint trả hai thứ khác nhau, và chỉ
 * cái đầu có `phone` + `phoneVerified` — hai trường màn này phải hiện.
 *
 * Cổng phiên nằm ở `app/(tabs)/account.tsx` (`RequireSession`). Phiên chết GIỮA LÚC màn đang mở
 * cũng được cổng đó bắt.
 */
export function AccountScreen() {
  const profile = useMyProfile();

  if (profile.isLoading) {
    return (
      <Screen edges={['left', 'right']}>
        <ProfileSkeleton />
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen edges={['left', 'right']} scroll={false}>
        <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  return (
    <AccountBody
      profile={profile.data}
      refreshing={profile.isRefetching}
      refetch={() => void profile.refetch()}
    />
  );
}

function AccountBody({
  profile,
  refreshing,
  refetch,
}: {
  profile: UserProfile;
  refreshing: boolean;
  refetch: () => void;
}) {
  const t = useTranslations('Account');
  const tNav = useTranslations('Navigation');
  const { data: user } = useCurrentUser();
  const tenant = user?.tenant ?? null;

  /*
   * SỬA Ở ĐÂU phụ thuộc vào TUYẾN, không phải vai (ADR 0038 điều 4 · người dùng chốt 16/09/2026):
   *
   *   - gian hàng TUYẾN GÓI — hồ sơ con người sống ở `/manage/account`, vì khu khách của họ chỉ
   *     còn ba mục và mọi việc hằng ngày đều ở khu quản lý. Thẻ ở đây chỉ để XEM;
   *   - chủ xe tuyến hoa hồng và khách thuê — KHÔNG có khu quản lý nào để vào, nên chỗ duy nhất
   *     họ sửa được tên, ảnh, email và SĐT là chính màn này.
   *
   * Hỏi `tenantUsesManagePortal` chứ không `tenant != null`: chủ xe tuyến hoa hồng vẫn có
   * `tenant`, nhưng `/manage` đóng với họ — để thẻ này chỉ-xem là khoá luôn hồ sơ của chính họ.
   */
  const editable = !tenantUsesManagePortal(tenant);

  return (
    // Màn gốc của tab: thanh tab đã nuốt `insets.bottom` — xem ghi chú ở `TripsScreen`.
    <Screen edges={['left', 'right']} refreshing={refreshing} onRefresh={refetch}>
      <YStack gap={space.lg}>
        <PersonalProfileCard
          profile={profile}
          subtitle={t('profile.accountLabel')}
          tenant={tenant}
          editable={editable}
        />

        {/*
          Cảnh báo cấu hình gói đứng NGAY TRƯỚC menu, đúng chỗ web đặt nó: nó nói rằng mọi đường
          ghi tiền của gian hàng này đang bị từ chối, nên nó phải đọc được trước khi người dùng
          bấm vào bất cứ việc gì (ADR 0038 điều 11).
        */}
        <AccountTrackNotice />

        <AccountNav />

        <ShopEntryCard />

        {/*
          YÊU CẦU XOÁ TÀI KHOẢN — chỗ hẹn mà ADR 0038 điều 9 nói tới khi đẩy mục này ra khỏi menu
          Owner Lite: "trong Tài khoản của tôi, cạnh danh tính mà nó đụng tới".

          Đứng CUỐI màn, một thẻ riêng tông đỏ. Xếp nó vào menu, cùng cỡ chữ cùng màu với chín mục
          việc hằng ngày, là mời người dùng chạm nhầm vào thứ không rút lại được — mà đây cũng
          chính là lý do nó rời menu.

          `showsDeleteAccountCard` gác để không ai thấy HAI lối vào cùng một thao tác: khách thuê
          đã có mục này trong menu, gian hàng tuyến gói có nó ở `/manage/account`.
        */}
        {showsDeleteAccountCard(user) ? (
          <Card padded={false}>
            <YStack px={space.md} py={space.xs}>
              <SettingRow
                icon="trash-outline"
                label={tNav('account.deleteAccount')}
                description={t('deleteAccount.subtitle')}
                href={ROUTES.account.deleteAccount()}
                danger
              />
            </YStack>
          </Card>
        ) : null}
      </YStack>
    </Screen>
  );
}
