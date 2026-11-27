import { useCallback, useRef, type ReactNode } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { Button } from '@/components/ui/Button';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ACCOUNT_SECTION, type AccountSection } from '@/navigation/account-section';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { PartnerLoginMethods } from './components/PartnerLoginMethods';
import { PartnerPasswordForm } from './components/PartnerPasswordForm';
import { PartnerProfileCard } from './components/PartnerProfileCard';
import { useMyProfile } from './hooks/use-account';

/**
 * `/manage/account` - "Tài khoản và bảo mật" của MỌI tài khoản partner (ADR 0085 điều 2), Figma
 * `24231:108047`. Bản native của web `PartnerAccountPage`: hồ sơ con người · thông tin đăng nhập ·
 * mật khẩu · lối yêu cầu xoá tài khoản, cùng luật và cùng câu chữ.
 *
 * Hai HỒ SƠ khác nhau, và đây là chỗ tách chúng: `/manage/shop` là hồ sơ GIAN HÀNG (khách thấy, in
 * trên hợp đồng); trang này là hồ sơ CON NGƯỜI (tên, ảnh, SĐT/email đăng nhập, mật khẩu).
 *
 * Theo Figma (người dùng chốt 25/11/2026): thanh trên là mũi tên quay lại + tiêu đề - không còn
 * thanh menu khu quản lý, phụ đề trang, lời dẫn dưới từng nhóm hay số phiên bản app. Mật khẩu đổi
 * NGAY trên trang (như web), không còn đẩy sang màn riêng. Xoá tài khoản vẫn là màn riêng
 * (`DeleteAccountScreen`) - việc một lần, khó lùi lại - mở từ dòng chữ đỏ cuối trang.
 */
export function ManageAccountScreen({ section }: { section?: AccountSection } = {}) {
  const t = useTranslations('Account.securityPage');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  /* Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: chỉ cái đầu có `phone` + `phoneVerified`. */
  const profile = useMyProfile();

  const goBack = useCallback(() => goBackOr(router, ROUTES.manage.more()), [router]);
  const header = <ManagePageHeader title={t('title')} onBack={goBack} />;

  /* ---------- Cuộn tới `?section=` — MỘT lần mỗi lần màn được focus (web `useScrollToSection`) ---------- */
  const target = isScrollableSection(section) ? section : undefined;
  const scrollRef = useRef<ScrollView | null>(null);
  const columnY = useRef<number | null>(null);
  const sectionY = useRef<Partial<Record<ScrollableSection, number>>>({});
  const scrolled = useRef(false);
  const scrollToSection = useCallback(() => {
    if (!target || scrolled.current) return;
    const y = sectionY.current[target];
    if (columnY.current === null || y === undefined) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, columnY.current + y - space.md), animated: true });
  }, [target]);
  useFocusEffect(
    useCallback(() => {
      scrolled.current = false;
      scrollToSection();
    }, [scrollToSection]),
  );
  const onColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      columnY.current = event.nativeEvent.layout.y;
      scrollToSection();
    },
    [scrollToSection],
  );
  const sectionLayout = useCallback(
    (key: ScrollableSection) => (event: LayoutChangeEvent) => {
      sectionY.current[key] = event.nativeEvent.layout.y;
      scrollToSection();
    },
    [scrollToSection],
  );

  if (profile.isLoading) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <ProfileSkeleton />
        </Screen>
      </>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={profile.isRefetching}
        onRefresh={() => void profile.refetch()}
        scrollRef={scrollRef}
      >
        {/* Thẻ hồ sơ tràn sát hai mép như Figma (`24231:108387`, rộng trọn 390). */}
        <PartnerProfileCard profile={profile.data} />

        <YStack p={space.md} gap={space.md} onLayout={onColumnLayout}>
          <Group title={t('loginTitle')} gap={space.md} onLayout={sectionLayout(ACCOUNT_SECTION.LOGIN)}>
            <PartnerLoginMethods profile={profile.data} />
          </Group>

          <Group title={t('passwordTitle')} gap={GAP_12} onLayout={sectionLayout(ACCOUNT_SECTION.PASSWORD)}>
            <PartnerPasswordForm />
          </Group>

          <YStack ai="flex-start" onLayout={sectionLayout(ACCOUNT_SECTION.DELETE)}>
            <Button
              label={t('deleteLink')}
              lineIcon="trash"
              variant="ghostDanger"
              size="compact"
              tight
              onPress={() => navigateOnce(ROUTES.account.deleteAccount())}
            />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}

const GAP_12 = 12;

/** "Nhóm thông tin" của frame này (`24231:108083`): nền trắng, bo 16, đệm 16, tiêu đề 16/24 - không viền. */
function Group({
  title,
  gap,
  onLayout,
  children,
}: {
  title: string;
  gap: number;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack bg={colors.surface} br={radius.card} p={space.md} gap={gap} onLayout={onLayout}>
      <Text
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </YStack>
  );
}

/** Ba khối cuộn tới được — web `PartnerAccountPage` `useScrollToSection` (login · password · delete). */
type ScrollableSection =
  | typeof ACCOUNT_SECTION.LOGIN
  | typeof ACCOUNT_SECTION.PASSWORD
  | typeof ACCOUNT_SECTION.DELETE;

function isScrollableSection(value: AccountSection | undefined): value is ScrollableSection {
  return (
    value === ACCOUNT_SECTION.LOGIN ||
    value === ACCOUNT_SECTION.PASSWORD ||
    value === ACCOUNT_SECTION.DELETE
  );
}
