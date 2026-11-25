import { useLocalSearchParams } from 'expo-router';
import { isRegistrationTrack } from '@xeprime/types';
import { PartnerSignupScreen } from '@/features/shop/PartnerSignupScreen';
import { REGISTRATION_TRACK_PARAM } from '@/navigation/routes';

/**
 * Chọn cách cho thuê — tài khoản ĐỐI TÁC chưa có gian hàng (web `/register` của site partner khi đã
 * đăng nhập): chọn tuyến rồi MỘT form chỉ còn phần hồ sơ của tuyến (không hỏi lại tài khoản/OTP).
 *
 * `?track=` (web `partnerSignupHref(track)`) mở thẳng form của tuyến đó — `/manage/onboarding` chuyển
 * về đây khi chưa có gian hàng, y như web. Giá trị lạ ⇒ màn chọn tuyến, không đoán.
 *
 * `ScopeGuard` giữ tài khoản chưa có gian hàng ở đây; người đã có gian hàng mở màn này thì được đưa
 * về trang chủ theo tuyến. Màn chọn tuyến KHÔNG còn dòng Đăng xuất (Figma "Signup - Plan" không vẽ,
 * người dùng chốt bỏ 20/11/2026) và không có mũi tên lui (không có màn nào để lui về).
 */
export default function ManageRegisterRoute() {
  const params = useLocalSearchParams<{ [REGISTRATION_TRACK_PARAM]?: string }>();
  const rawTrack = params[REGISTRATION_TRACK_PARAM];
  return <PartnerSignupScreen initialTrack={isRegistrationTrack(rawTrack) ? rawTrack : null} />;
}
