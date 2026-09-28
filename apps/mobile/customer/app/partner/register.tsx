import { Redirect, useLocalSearchParams } from 'expo-router';
import { REGISTRATION_TRACK, isRegistrationTrack } from '@xeprime/types';
import { isPackageOnboarding } from '@/features/shell/workspace';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ShopOnboardingScreen } from '@/features/shop/ShopOnboardingScreen';
import { PARTNER_ROUTES, REGISTRATION_TRACK_PARAM } from '@/navigation/routes';

/**
 * ĐĂNG KÝ GIAN HÀNG — bước tạo hồ sơ (`POST /tenants`) vẫn thuộc app Customer sau đợt tách
 * app: người đăng ký đang đứng ở đây, và họ chưa có gì để đăng nhập bên Partner.
 *
 * Khác bản `/manage/onboarding` cũ ở MỘT chỗ: bước THANH TOÁN gói không chạy ở app này.
 * Hồ sơ tuyến gói vừa tạo xong (`package_pending`) ⇒ chuyển sang màn success/handoff — việc
 * chuyển khoản + kích hoạt tiếp tục trong XePrime Partner, đọc từ trạng thái server.
 */
export default function PartnerRegisterRoute() {
  const params = useLocalSearchParams<{ [REGISTRATION_TRACK_PARAM]?: string }>();
  const raw = params[REGISTRATION_TRACK_PARAM];
  const track = isRegistrationTrack(raw) ? raw : REGISTRATION_TRACK.COMMISSION;

  const { data: user } = useCurrentUser();
  if (isPackageOnboarding(user)) {
    return <Redirect href={PARTNER_ROUTES.success()} />;
  }

  return <ShopOnboardingScreen track={track} />;
}
