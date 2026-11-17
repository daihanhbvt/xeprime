import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { AppVersion } from '@/components/ui/AppVersion';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { InlineAction } from '@/components/ui/InlineAction';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';
import { isCommissionOwner as isCommissionOwnerOf } from '@/features/shell/partner-track';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { ACCOUNT_SECTION, type AccountSection } from '@/navigation/account-section';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { AccountSecuritySections, SectionHead } from './components/AccountSecuritySections';
import { PersonalProfileCard } from './components/PersonalProfileCard';
import { useMyProfile } from './hooks/use-account';
import { useAccountIdentityLabel } from './use-account-identity-label';

/**
 * TÀI KHOẢN & BẢO MẬT của NGƯỜI ĐANG ĐĂNG NHẬP — trong khu quản lý (ADR 0038 điều 7).
 *
 * ## Vì sao màn này phải tồn tại
 *
 * Khu khách của một tài khoản gian hàng tuyến gói chỉ còn hai mục ("Quản lý gian hàng", "Hồ sơ
 * gian hàng"), nên sau đợt tách tuyến KHÔNG mục nào dẫn tới màn đổi mật khẩu nữa. Một `shop_staff`
 * sống trong khu quản lý vì thế không có đường nào để đổi mật khẩu của chính mình.
 *
 * ## Hai HỒ SƠ khác nhau, và đây là chỗ tách chúng
 *
 *   `/manage/shop`    — hồ sơ GIAN HÀNG: pháp nhân, địa chỉ, mã số thuế, tài khoản thu. Đổi nó là
 *                       đổi thứ khách nhìn thấy và thứ in trên hợp đồng.
 *   `/manage/account` — hồ sơ CON NGƯỜI: tên, email/SĐT, mật khẩu, thao tác bảo mật.
 *
 * Nhầm hai hồ sơ đó là chuyện xảy ra thật, nên màn mở đầu bằng `PersonalProfileCard` — ĐÚNG thẻ
 * mà tab Tài khoản bên khu khách dựng, cùng một component — trả lời "tôi đang đăng nhập bằng tài
 * khoản nào, vai gì, tuyến nào". Không có câu mô tả nào dưới tiêu đề trang: web không có, và
 * chính khối nhận diện ngay bên dưới đã nói rõ đây là hồ sơ của ai.
 *
 * ## Khác web ở VỎ, không khác ở nghiệp vụ
 *
 * Web xếp bốn khối trên một trang cuộn; app native cũng vậy — khác ở chỗ đổi mật khẩu và xoá tài
 * khoản là hai MÀN riêng đã có sẵn, nên ở đây chúng là hai dòng dẫn đi chứ không phải bản sao thứ
 * hai của cùng một biểu mẫu.
 *
 * Xoá tài khoản đứng RIÊNG một thẻ và mang tông nguy hiểm: xếp nó ngay dưới "đổi mật khẩu", cùng
 * cỡ chữ cùng màu, là mời người dùng chạm nhầm vào thứ không rút lại được.
 */

/**
 * `/manage/account` — "Tài khoản & bảo mật" của MỌI tài khoản partner (ADR 0085 điều 2, web
 * `PartnerAccountRoute`). Trước ADR 0085 cùng URL này là "Hồ sơ chủ xe" của chủ xe tuyến hoa hồng;
 * hồ sơ đó nay là trang Thông tin `/manage/shop` (route chuyển các `?section=` cũ sang đó).
 */
export function ManageAccountScreen({ section }: { section?: AccountSection } = {}) {
  return <PartnerAccountScreen section={section} />;
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

function PartnerAccountScreen({ section }: { section: AccountSection | undefined }) {
  const colors = useColors();
  const tHub = useTranslations('Account.hub');
  const canOpenShopSettings = useShopSettingsAccess();
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  /*
   * Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: chỉ cái đầu có `phone` + `phoneVerified`,
   * hai trường thẻ hồ sơ phải hiện và phải cho đổi.
   */
  const profile = useMyProfile();
  const tenant = user?.tenant ?? null;
  const isCommissionOwner = isCommissionOwnerOf(user);

  /* Nhãn danh tính — xem `useAccountIdentityLabel`: tuyến, không phải vai RBAC. */
  const userRole = identityLabel(user);

  /* ---------- Cuộn tới `?section=` — MỘT lần mỗi lần màn được focus (như `OwnerProfileScreen`) ---------- */
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
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']}>
          <ProfileSkeleton />
        </Screen>
      </>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      {/*
        Thanh trên của KHU QUẢN LÝ, không phải `AppHeader` trần: màn này là một mục của drawer, và
        `AppHeader` trần mọc ra ở đây thì mất nút mở menu, mất tên gian hàng, mất phạm vi chi
        nhánh — người dùng vào được rồi không có đường mở lại menu. Tiêu đề TRANG đi vào nội dung
        qua `ManagePageTitle`, đúng khuôn mọi màn gốc khác của khu quản lý.
      */}
      <ManageHeader />
      <ManagePageTitle title={tHub('title')} subtitle={tHub('subtitle')} />

      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={profile.isRefetching}
        onRefresh={() => void profile.refetch()}
        scrollRef={scrollRef}
      >
        <YStack gap={space.lg} onLayout={onColumnLayout}>
          {/*
            Thẻ hồ sơ CON NGƯỜI, bản CHO SỬA — đây là nơi duy nhất sửa tên/ảnh/email/SĐT trong
            app (người dùng chốt 16/09/2026). Tab Tài khoản bên khu khách dựng CÙNG component ở
            bản chỉ xem, nên hai màn không thể lệch nhau về cách hiển thị.
          */}
          {/*
            BỐN phần, cùng thứ tự và cùng lời dẫn với trang "Tài khoản & bảo mật" của web (PR #151 —
            `PartnerAccountPage`): hồ sơ · thông tin đăng nhập · mật khẩu · xoá tài khoản. Thẻ hồ sơ
            gánh luôn phần đăng nhập (email/SĐT đổi qua OTP) — tách thành hai thẻ là hai nơi hiện
            cùng một danh tính.
          */}
          {/* Thẻ hồ sơ gánh phần đăng nhập (SĐT/email) — đích của `?section=login`. */}
          <YStack gap={space.lg} onLayout={sectionLayout(ACCOUNT_SECTION.LOGIN)}>
            <SectionHead title={tHub('sections.profile')} hint={tHub('sections.profileHint')} />
            <PersonalProfileCard
              profile={profile.data}
              subtitle={userRole}
              tenant={tenant}
              editable
            />
          </YStack>
          {/*
            Tài khoản ≠ gian hàng: tên/ảnh ở đây là của con người; tên, logo, SĐT liên hệ khách thấy là
            của gian hàng. Một câu cho mọi tuyến, đúng web `AccountProfileForm` sau PR #156 (danh tính
            trang chủ xe tuyến hoa hồng nay do server suy — ADR 0054).
          */}
          {/*
            Câu luôn hiện, kể cả tài khoản partner CHƯA có gian hàng (vừa đăng ký, chưa onboarding) -
            web `AccountProfileForm` vẽ nó không điều kiện; chỉ lối dẫn sang /shop mới cần quyền.
          */}
          <YStack gap={space.xs}>
            {/*
              Chủ xe tuyến hoa hồng: ảnh + họ tên này CHÍNH LÀ thứ khách thấy (ADR 0054), nên câu
              nói điều đó và dẫn sang "Hồ sơ chủ xe" (`/manage/shop`, ADR 0085) — như web
              `AccountProfileForm`.
            */}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {isCommissionOwner ? tHub('profile.personalStorefront') : tHub('profile.notShop')}
            </Text>
            {isCommissionOwner ? (
              <InlineAction
                label={tHub('profile.ownerProfileLink')}
                onPress={() => navigateOnce(ROUTES.manage.shop())}
              />
            ) : canOpenShopSettings ? (
              <InlineAction
                label={tHub('profile.shopSettingsLink')}
                onPress={() => navigateOnce(ROUTES.manage.shop())}
              />
            ) : null}
          </YStack>
          <AccountSecuritySections
            onPasswordLayout={sectionLayout(ACCOUNT_SECTION.PASSWORD)}
            onDeleteLayout={sectionLayout(ACCOUNT_SECTION.DELETE)}
          />

          <AppVersion />
        </YStack>
      </Screen>
    </>
  );
}
