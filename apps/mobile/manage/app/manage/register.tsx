import { useRouter } from 'expo-router';
import { PartnerSignupScreen } from '@/features/shop/PartnerSignupScreen';
import { LogoutRow } from '@/features/shell/LogoutRow';
import { ROUTES } from '@/navigation/routes';

/**
 * Chọn cách cho thuê — tài khoản ĐỐI TÁC chưa có gian hàng (web `/register` của site partner khi đã
 * đăng nhập): chọn tuyến rồi MỘT form chỉ còn phần hồ sơ của tuyến (không hỏi lại tài khoản/OTP).
 *
 * `ScopeGuard` giữ tài khoản chưa có gian hàng ở đây; người đã có gian hàng mở màn này thì được đưa
 * về trang chủ theo tuyến. Không có menu nào để mở, nên đăng xuất đứng ngay cuối màn chọn tuyến.
 */
export default function ManageRegisterRoute() {
  const router = useRouter();
  return (
    <PartnerSignupScreen
      footer={<LogoutRow variant="link" onDone={() => router.replace(ROUTES.account.login())} />}
    />
  );
}
