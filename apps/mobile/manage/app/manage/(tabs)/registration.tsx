import { Redirect, type Href } from 'expo-router';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { PARTNER_PATH, partnerPathRedirect } from '@/features/shell/partner-track';
import { ACCOUNT_SECTION } from '@/navigation/account-section';
import { ROUTES } from '@/navigation/routes';

/**
 * ALIAS CHUYỂN TIẾP (web PR #156 `OwnerRegistrationRedirect`).
 *
 * "Hồ sơ chủ xe" đã gộp vào trang tài khoản (`/manage/account?section=profile`); tiến trình đăng
 * ký là trang chủ Owner Lite (`/manage`). Route này giữ lại để deep link / thông báo cũ vẫn tới
 * đúng chỗ. Hỏi luật tuyến TRƯỚC (`partnerPathRedirect` — gian hàng tuyến gói về trang Cửa hàng),
 * đúng thứ tự web; không phụ thuộc việc `ScopeGuard` đã kịp chuyển hay chưa.
 */
export default function ManageOwnerLiteRegistrationRoute() {
  const { data: user, isLoading } = useCurrentUser();
  // Chưa biết tuyến thì chưa chuyển: `user` rỗng sẽ bị coi là "chưa có gian hàng" và đẩy sang
  // `/manage/register` — không có đường quay lại khi phiên nạp xong.
  if (isLoading) return <ScreenLoading />;
  const byTrack = partnerPathRedirect(user, PARTNER_PATH.REGISTRATION);
  return (
    <Redirect href={(byTrack as Href | null) ?? ROUTES.manage.account(ACCOUNT_SECTION.PROFILE)} />
  );
}
