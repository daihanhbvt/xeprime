import { useEffect } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { REGISTRATION_TRACK, tenantUsesManagePortal, type RegistrationTrack } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { LogoutRow } from '@/features/shell/LogoutRow';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { useShellScope } from '@/features/shell/use-shell-scope';
import { isPackageOnboarding, resolveWorkspaceHref } from '@/features/shell/workspace';
import { ROUTES } from '@/navigation/routes';
import { PackageWaitingPanel } from './components/PackageWaitingPanel';

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
  const t = useTranslations('ShopOnboarding');
  const { switchTo } = useShellScope();

  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const tenant = user?.tenant ?? null;
  const hasTenant = tenant != null;
  const packagePending = isPackageOnboarding(user);
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
    /*
      KHÔNG có header (người dùng 28/11/2026): tuyến gói chưa trả tiền chỉ được ở đúng màn này
      (ADR 0040 điều 3); lối ra là ĐĂNG XUẤT neo ở đáy màn.
    */
    <Screen footer={<LogoutRow variant="link" onDone={backToLogin} />}>
      <PackageWaitingPanel />
    </Screen>
  );
}
