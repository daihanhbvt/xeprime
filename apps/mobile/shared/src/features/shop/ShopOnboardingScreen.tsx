import { useEffect, useState } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { REGISTRATION_TRACK, tenantUsesManagePortal, type RegistrationTrack } from '@xeprime/types';
import { images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { LogoutRow } from '@/features/shell/LogoutRow';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { useShellScope } from '@/features/shell/use-shell-scope';
import { isPackageOnboarding, resolveWorkspaceHref } from '@/features/shell/workspace';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { PackageWaitingPanel } from './components/PackageWaitingPanel';
import { ShopLogoRequiredCard } from './components/ShopLogoRequiredCard';
import { useMyShop } from './hooks/use-shop';

/** Số thứ tự của một bước trong chỉ dẫn hai chặng. */
const STEP_INDEX = 24;

/**
 * Cao đúng `.heroArt` ở nhánh mobile của web. Ảnh 640×400 vào khung này bằng `contain` nên
 * không bị xén — nó là hình trang trí, cắt mất một góc là mất luôn ý của hình.
 */
const styles = StyleSheet.create({ heroArt: { width: '100%', height: 132 } });

/** Bốn bước của TUYẾN GÓI — mở gian hàng → kích hoạt gói (trên web) → logo → lên chợ. */
const PACKAGE_GUIDE_STEPS = ['createShop', 'activate', 'logo', 'publish'] as const;
/** Hai chặng của tuyến gói. Tới được màn này (bước 2) thì bước 1 luôn đã xong. */
const STEPS = [1, 2] as const;

/**
 * ONBOARDING (ADR 0040) — bản native của web `/manage/onboarding`.
 *
 * ## Máy trạng thái, và nó SUY TỪ SERVER
 *
 * | Trạng thái thật | Màn hiện ra |
 * | --- | --- |
 * | chưa có gian hàng | chuyển tới form đăng ký MỘT TRANG `/manage/register?track=` — y như web chuyển tới `partnerSignupHref(track)` |
 * | `onboardingState = package_pending` | **bước 2**: màn CHỜ KÍCH HOẠT — app không bán gói (không IAP); chọn gói + thanh toán ở site partner, tiền về thì webhook bật `package_active` |
 * | gói đã hiệu lực | chuyển tới hồ sơ gian hàng |
 * | tuyến hoa hồng (đã có gian hàng) | chuyển tới khu của họ |
 *
 * `track` CHỈ có nghĩa ở dòng đầu — tức khi CHƯA có gian hàng. Sau đó nguồn là
 * `tenants.onboarding_state`, nên tắt app, mở lại, hay đăng nhập trên máy khác đều rơi đúng bước
 * còn nợ.
 *
 * Form tạo hồ sơ cũ của màn này (có ô "Loại hình") đã gỡ 13/11/2026: web không còn dựng form ở đây,
 * và một ô "Loại hình" là lệch với form một trang (`PartnerSignupForm` luôn gửi `individual`).
 */
export function ShopOnboardingScreen({
  track = REGISTRATION_TRACK.COMMISSION,
}: {
  /** Cửa vào người dùng vừa bấm — đọc từ `?track=` ở file route, không đoán trong component. */
  track?: RegistrationTrack;
}) {
  const colors = useColors();
  const t = useTranslations('ShopOnboarding');
  const [guideOpen, setGuideOpen] = useState(false);
  const { switchTo } = useShellScope();

  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const tenant = user?.tenant ?? null;
  const hasTenant = tenant != null;
  const packagePending = isPackageOnboarding(user);
  /*
   * Logo là một phần của bước 1 "Thông tin gian hàng" (ADR 0103, web `/onboarding`): gian hàng chưa có
   * logo đứng lại ở bước 1. Đọc hồ sơ lỗi thì KHÔNG chặn (cổng gửi xe duyệt vẫn đòi logo ở server).
   */
  const shop = useMyShop(packagePending);
  const needsLogo = packagePending && shop.data != null && !shop.data.profile?.logoUrl;
  const currentStep = needsLogo ? 1 : 2;
  /** Gian hàng đã có gói hiệu lực — onboarding xong, không còn gì để làm ở đây. */
  const packageReady = hasTenant && !packagePending && tenantUsesManagePortal(tenant);

  /*
   * Điều hướng trong effect, KHÔNG giữa lúc render: đổi route trong thân render của một màn đang
   * mount là nguồn của cảnh báo "update during render" và của những cú nháy không lần ra được.
   */
  useEffect(() => {
    if (!hasTenant || packagePending) return;
    // Gói đã bật ⇒ hồ sơ gian hàng; còn lại (tuyến hoa hồng, nhân viên) ⇒ khu làm việc của họ.
    if (packageReady) {
      switchTo(APP_SCOPE.MANAGE, ROUTES.manage.shop({ welcome: true }));
      return;
    }
    switchTo(APP_SCOPE.MANAGE, resolveWorkspaceHref(user) ?? ROUTES.manage.home());
  }, [hasTenant, packagePending, packageReady, switchTo, user]);

  const openGuide = () => setGuideOpen(true);
  const closeGuide = () => setGuideOpen(false);
  const backToLogin = () => router.replace(ROUTES.account.login());

  /*
   * CHƯA có gian hàng: form tạo hồ sơ là form đăng ký MỘT TRANG (`PartnerSignupScreen`, không hỏi
   * lại tài khoản/OTP). `Redirect` = replace: lui không quay lại một màn chỉ để chuyển tiếp.
   */
  if (!isLoading && user && !hasTenant) {
    return <Redirect href={ROUTES.manage.register(track)} />;
  }

  // Đang tải phiên, hoặc đã có gian hàng và KHÔNG ở bước 2 (effect đang đưa đi).
  if (isLoading || !user || !packagePending) {
    return (
      <>
        <AppHeader title={t('packagePage.title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  return (
    <>
      {/*
        KHÔNG có nút lui ở bước CHỜ THANH TOÁN: tuyến gói chưa trả tiền chỉ được phép ở đúng màn
        này (ADR 0040 điều 3), nên mũi tên lui đá về `/manage` rồi bị `ScopeGuard` ném ngược lại đây.
        Lối ra thật của họ là ĐĂNG XUẤT, neo ở đáy màn — đúng web.
      */}
      <AppHeader
        right={
          <IconButton icon="help-circle-outline" label={t('guide.trigger')} onPress={openGuide} />
        }
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        footer={<LogoutRow variant="link" onDone={backToLogin} />}
      >
        <YStack gap={layout.section} pb={layout.section}>
          {/* Dải hero nền kem: tiêu đề lớn, câu mô tả, hình minh hoạ neo đáy — bố cục mobile của web. */}
          <YStack bg={colors.primaryLight} px={layout.screenX} pt={layout.section} gap={space.md}>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h1} fow={fontWeight.bold}>
                {t('packagePage.title')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodyLg}>
                {t('packagePage.subtitleApp')}
              </Text>
            </YStack>
            <Image
              source={images.shopOnboarding}
              style={styles.heroArt}
              contentFit="contain"
              accessible={false}
            />
          </YStack>

          <YStack px={layout.screenX} gap={layout.section}>
            {/*
              Chỉ dẫn bước RẤT GỌN: hai chặng, một hàng. Bước đã qua mang dấu tích như web
              (`stepDone` + dấu check), bước đang mở tô vàng.
            */}
            <XStack gap={space.sm} accessibilityLabel={t('steps.label')}>
              {STEPS.map((step) => {
                const active = step === currentStep;
                const done = step < currentStep;
                return (
                  <XStack
                    key={step}
                    f={1}
                    ai="center"
                    gap={space.xs}
                    px={space.sm}
                    py={space.xs}
                    br={radius.md}
                    bw={1}
                    bc={active ? colors.primary : done ? colors.success : colors.border}
                    bg={active ? colors.primaryLight : colors.surface}
                  >
                    <YStack
                      w={STEP_INDEX}
                      h={STEP_INDEX}
                      br={radius.pill}
                      ai="center"
                      jc="center"
                      bg={active ? colors.primary : done ? colors.success : colors.surfaceMuted}
                    >
                      {done ? (
                        <Ionicons name="checkmark" size={iconSize.sm} color={colors.textInverse} />
                      ) : (
                        <Text
                          col={active ? colors.surface : colors.textMuted}
                          fos={fontSize.label}
                          fow={fontWeight.bold}
                        >
                          {step}
                        </Text>
                      )}
                    </YStack>
                    <Text
                      f={1}
                      col={active || done ? colors.text : colors.textMuted}
                      fos={fontSize.label}
                      fow={active ? fontWeight.semibold : fontWeight.medium}
                    >
                      {t(step === 1 ? 'steps.shopInfo' : 'steps.activation')}
                    </Text>
                  </XStack>
                );
              })}
            </XStack>

            {needsLogo ? <ShopLogoRequiredCard /> : null}
            <PackageWaitingPanel />
          </YStack>
        </YStack>
      </Screen>

      {/* Bốn bước mở gian hàng — bản native của `Popover` "Hướng dẫn" trên thanh của web. */}
      <BottomSheet open={guideOpen} onClose={closeGuide} title={t('guide.packageTitle')}>
        <YStack gap={space.sm}>
          {PACKAGE_GUIDE_STEPS.map((step, index) => (
            <XStack key={step} ai="flex-start" gap={space.sm}>
              <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.bold}>
                {index + 1}.
              </Text>
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {t(`guide.steps.${step}`)}
              </Text>
            </XStack>
          ))}
        </YStack>
      </BottomSheet>
    </>
  );
}
