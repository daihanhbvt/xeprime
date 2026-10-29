import { useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useTranslations } from 'use-intl';
import { tenantUsesManagePortal } from '@xeprime/types';
import { YStack } from 'tamagui';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { AccountDocumentsSection } from '@/features/driver-licence/components/AccountDocumentsSection';
import { ACCOUNT_SECTION_PARAM } from '@/navigation/account-section';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';
import { AccountProfileCard } from './components/AccountProfileCard';
import { ShopEntryCard } from './components/ShopEntryCard';
import { useMyProfile } from './hooks/use-account';

/** Giá trị `?section=` mở thẳng khối giấy tờ (thông báo bằng lái, `/account/documents`). */
export const ACCOUNT_DOCUMENTS_SECTION = 'documents';

/**
 * "Quản lý tài khoản" — màn thứ hai của Figma `21860:76359`: thông tin tài khoản (tên, ảnh, email,
 * SĐT, số dư), thẻ "Đăng xe cho thuê", rồi giấy tờ & xác minh. Trang chính của tab Tài khoản chỉ
 * còn thẻ hồ sơ gọn + menu (người dùng chốt 28/10/2026). Nội dung giữ nguyên như trước khi tách.
 */
export function AccountProfileScreen() {
  const t = useTranslations('Navigation');
  const router = useRouter();
  const profile = useMyProfile();
  const { data: user } = useCurrentUser();
  const params = useLocalSearchParams<{ [ACCOUNT_SECTION_PARAM]?: string }>();
  const wantsDocuments = params[ACCOUNT_SECTION_PARAM] === ACCOUNT_DOCUMENTS_SECTION;
  const scrollRef = useRef<ScrollView | null>(null);
  const scrolledToDocuments = useRef(false);
  const onDocumentsLayout = (event: LayoutChangeEvent) => {
    if (!wantsDocuments || scrolledToDocuments.current) return;
    scrolledToDocuments.current = true;
    scrollRef.current?.scrollTo({
      y: Math.max(0, event.nativeEvent.layout.y - space.md),
      animated: true,
    });
  };

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('account.profile')}
      />
      {profile.isLoading ? (
        <Screen edges={['left', 'right', 'bottom']}>
          <ProfileSkeleton />
        </Screen>
      ) : profile.isError || !profile.data ? (
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />
        </Screen>
      ) : (
        <Screen
          edges={['left', 'right', 'bottom']}
          refreshing={profile.isRefetching}
          onRefresh={() => void profile.refetch()}
          scrollRef={scrollRef}
        >
          <YStack gap={space.lg}>
            <AccountProfileCard
              profile={profile.data}
              editable={!tenantUsesManagePortal(user?.tenant ?? null)}
            />
            <ShopEntryCard />
            {/* Bằng lái là của TÀI KHOẢN KHÁCH (ADR 0057) — app khách luôn hiện khối này. */}
            <AccountDocumentsSection onLayout={onDocumentsLayout} />
          </YStack>
        </Screen>
      )}
    </>
  );
}
