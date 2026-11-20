import { ScrollReveal } from '@/components/motion/ScrollReveal';
import { useTranslations } from 'use-intl';
import { Text, YStack } from 'tamagui';
import { Screen } from '@/components/layout/Screen';
import { AppVersion } from '@/components/ui/AppVersion';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/motion/Reveal';
import { useParallaxHeader } from '@/components/motion/use-parallax-header';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { SettingRow } from '@/components/ui/SettingRow';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { showsDeleteAccountCard } from './account-nav';
import { AccountNav } from './components/AccountNav';
import { AccountTrackNotice } from './components/AccountTrackNotice';
import { AccountHubCard } from './components/AccountHubCard';
import { PartnerInviteCard } from './components/PartnerInviteCard';
import { useMyProfile } from './hooks/use-account';
import type { UserProfile } from './api';
import { layout } from '@/theme/layout';

// Khối giấy tờ đã sang "Quản lý tài khoản" — giữ export cũ cho nơi gọi.
export { ACCOUNT_DOCUMENTS_SECTION } from './AccountProfileScreen';

/**
 * Tab "Tài khoản" (CUS-04) — bản native của trang `/account` bên web.
 *
 * THỨ TỰ KHỐI:
 *
 *  1. thẻ hồ sơ (`AccountProfileCard` = `ProfileCard` của web, viên SỐ DƯ `WalletBalancePill` ở
 *     đầu thẻ như web — người dùng chốt 27/10), thẻ "Đăng xe cho thuê", rồi Giấy tờ & Xác minh (`AccountDocumentsSection` — chỉ
 *     tài khoản KHÁCH, bằng lái thuộc realm `customer`; design 22/10/2026, trước là một mục menu).
 *     TIỀN không còn là một khối ở đây: số dư, tài khoản nhận tiền và lịch sử thanh toán gộp thành
 *     mục "Quản lý thanh toán" của menu (web 22/10/2026);
 *  2. điều hướng tài khoản (`AccountNav` = `AccountSidebar`, kèm Đăng xuất ở cuối) — web ở
 *     ≤900px xếp menu LÊN TRÊN, app cố ý để DƯỚI thẻ hồ sơ (người dùng chốt 15/09/2026): mở tab
 *     Tài khoản là muốn thấy mình là ai trước, rồi mới tới danh sách lối đi;
 *
 * ## Sửa hồ sơ ở đây hay ở khu quản lý — theo TUYẾN (người dùng chốt 16/09/2026)
 *
 * Gian hàng tuyến GÓI sửa hồ sơ con người ở "Tài khoản & bảo mật" (`/manage/account`); tab này
 * với họ chỉ để XEM. Chủ xe tuyến hoa hồng và khách thuê thì không có khu quản lý nào để vào,
 * nên họ sửa ngay tại đây. Một tài khoản chỉ có ĐÚNG MỘT bề mặt sửa được — hai bề mặt là hai chỗ
 * phải sửa mỗi lần đổi luật, và người dùng không đoán được cái nào là "thật".
 *
 * Giao diện sáng/tối + ngôn ngữ nằm TRONG thẻ hồ sơ (`AccountProfileCard`) và trong menu avatar
 * trên thanh (`AccountMenuSheet`) — người dùng chốt 27/10/2026, cùng một bộ hàng
 * (`PreferenceToggleRows`).
 *
 * Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: hai endpoint trả hai thứ khác nhau, và chỉ
 * cái đầu có `phone` + `phoneVerified` — hai trường màn này phải hiện.
 *
 * Cổng phiên nằm ở `app/(tabs)/account.tsx` (`RequireSession`). Phiên chết GIỮA LÚC màn đang mở
 * cũng được cổng đó bắt.
 */
/** Thẻ đầu trang: nhẹ hơn banner — trôi 0.25×, co 0.96, mờ 0.6. */
const HUB_PARALLAX = { factor: 0.25, minScale: 0.96, minOpacity: 0.6, stretch: false } as const;

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

/**
 * Trang chính tab Tài khoản — Figma `21860:83492` (người dùng chốt 28/10/2026): tiêu đề "Tài khoản
 * của tôi" → thẻ hồ sơ gọn (mở "Quản lý tài khoản") → menu → lời mời hợp tác. Thông tin tài khoản,
 * "Đăng xe cho thuê" và giấy tờ đã sang `AccountProfileScreen`.
 */
function AccountBody({
  refreshing,
  refetch,
}: {
  profile: UserProfile;
  refreshing: boolean;
  refetch: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Account');
  const tNav = useTranslations('Navigation');
  const { data: user } = useCurrentUser();
  /*
   * Thẻ đầu trang trôi chậm + co/mờ nhẹ khi cuộn (cùng ngôn ngữ banner Home, nhẹ hơn vì là thẻ
   * thông tin chứ không phải ảnh). Các khối đầu so le một lần lúc mở màn.
   */
  const scrollY = useSharedValue(0);
  const hubStyle = useParallaxHeader(scrollY, HUB_PARALLAX);

  return (
    <Screen
      edges={['left', 'right']}
      scrollReveal
      refreshing={refreshing}
      onRefresh={refetch}
      scrollOffset={scrollY}
    >
      {/* Nhịp khép (người dùng chốt 28/10/2026): khe 12 giữa các khối. */}
      <YStack gap={12}>
        <Reveal listItem variant="fade">
          <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold} accessibilityRole="header">
            {t('title')}
          </Text>
        </Reveal>

        {/* Thẻ đầu + menu trượt so le khi vào/cuộn tới (ScrollReveal: chỉ transform, thẻ có bóng). */}
        <ScrollReveal index={0}>
          <Animated.View style={hubStyle}>
            <AccountHubCard />
          </Animated.View>
        </ScrollReveal>

        {/* Cảnh báo cấu hình gói đứng NGAY TRƯỚC menu (ADR 0038 điều 11). */}
        <AccountTrackNotice />

        <ScrollReveal index={2}>
          <AccountNav />
        </ScrollReveal>

        <PartnerInviteCard revealIndex={3} />

        {/* Xoá tài khoản: thẻ riêng tông đỏ cuối màn (ADR 0038 điều 9), không lẫn vào menu. */}
        {showsDeleteAccountCard(user) ? (
          <ScrollReveal index={4}>
          <Card padded={false}>
            <YStack px={layout.padX} py={space.xs}>
              <SettingRow
                icon="trash-outline"
                label={tNav('account.deleteAccount')}
                description={t('deleteAccount.subtitle')}
                href={ROUTES.account.deleteAccount()}
                danger
              />
            </YStack>
          </Card>
          </ScrollReveal>
        ) : null}

        <AppVersion />
      </YStack>
    </Screen>
  );
}
