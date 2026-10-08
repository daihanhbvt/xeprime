import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { SESSION_STATUS, useSessionGate } from '@/features/auth/hooks/use-session-gate';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ROUTES } from '@/navigation/routes';
import { isSafeAppPath, useCurrentAppPath } from '@/features/auth/auth-next';
import { deepLinkPended } from '@/features/shell/shell-scope.slice';
import { useAppDispatch } from '@/store/hooks';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { PARTNER_PATH, partnerPathRedirect } from './partner-track';

/**
 * Cổng của KHU QUẢN LÝ (app XePrime Partner) — bản native của luật trang theo TUYẾN mà `AppShell`
 * của site partner áp (`partnerPageRedirect`, ADR 0053).
 *
 * Từ ADR 0053 mọi tài khoản tới được đây đều là tài khoản ĐỐI TÁC — realm do server quyết lúc đăng
 * nhập, nên không còn ca "tài khoản này không thuộc app" để đá ra. Việc còn lại của cổng là đặt
 * người dùng vào đúng trang của TUYẾN họ (`partner-track.ts`):
 *
 *  - chưa có gian hàng → màn chọn cách cho thuê (`/manage/register`);
 *  - gian hàng trả phí chưa chuyển khoản → màn onboarding;
 *  - chủ xe tuyến hoa hồng → chỉ các trang Owner Lite (danh sách trắng), còn lại về trang chủ;
 *  - gian hàng tuyến gói → ba trang chỉ của tuyến hoa hồng đổi sang bản tương đương trong khu Gian hàng.
 *
 * Hai điều nó cố ý KHÔNG làm:
 *
 * 1. **Không đăng xuất.** Đổi tuyến (vd. gói hết ân hạn ⇒ về hoa hồng) không phải mất phiên.
 * 2. **Không gánh 403 của từng màn.** Màn nào bị API từ chối thì tự hiện trạng thái lỗi của chính
 *    nó; cổng này dọn ở nhịp refetch `/auth/me` kế tiếp.
 *
 * Chuyển hướng chạy trong `useEffect` chứ không phải `<Redirect>` giữa lúc render: điều hướng
 * trong thân render của một layout đang mount là nguồn của cảnh báo "update during render".
 */
export function ScopeGuard({ children }: { children: ReactNode }) {
  const t = useTranslations('MobileShell.scope');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const dispatch = useAppDispatch();
  const currentPath = useCurrentAppPath();
  const { status, error, retry } = useSessionGate();
  const { tenant } = useTenantScope();
  const pathname = usePathname() ?? '';

  /**
   * Còn ĐANG ĐỨNG trong khu quản lý hay không. `pathname` đổi TRƯỚC khi layout này unmount, nên
   * ngay khi người dùng rời khu (vd. sang wizard đăng xe nhanh) vẫn còn một khung hình mà layout
   * chưa tháo nhưng đường dẫn đã ở ngoài — đừng chuyển hướng ở khung đó.
   */
  const insideManage =
    pathname === PARTNER_PATH.HOME || pathname.startsWith(`${PARTNER_PATH.HOME}/`);

  const ready = status === SESSION_STATUS.READY;
  const redirectTo = ready && insideManage ? partnerPathRedirect({ tenant }, pathname) : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo as Parameters<typeof router.replace>[0]);
  }, [redirectTo, router]);

  switch (status) {
    case SESSION_STATUS.LOADING:
      return (
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      );

    case SESSION_STATUS.UNAUTHENTICATED:
      return (
        <Screen scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('signInRequired')}
            actionLabel={t('signIn')}
            onAction={() => {
              // Đăng nhập xong quay lại ĐÚNG trang đang mở (deep link, push, link từ app XePrime).
              if (isSafeAppPath(currentPath)) dispatch(deepLinkPended(currentPath));
              navigateOnce(ROUTES.account.login());
            }}
          />
        </Screen>
      );

    case SESSION_STATUS.UNREACHABLE:
      return (
        <Screen scroll={false}>
          <ScreenError error={error} onRetry={retry} />
        </Screen>
      );

    case SESSION_STATUS.READY:
      // Khung hình giữa lúc effect ở trên chưa kịp chạy: hiện màn chờ thay vì nội dung của một
      // trang người này không được đứng. (`READY` đã bảo đảm có `user` — xem `useSessionGate`.)
      return redirectTo ? (
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      ) : (
        children
      );
  }
}
