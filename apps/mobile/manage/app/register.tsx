import { Redirect, useRouter, type Href } from 'expo-router';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { RegisterScreen } from '@/features/auth/RegisterScreen';
import { PartnerSignupScreen } from '@/features/shop/PartnerSignupScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { registrationTrackOfNext, usePendAuthNext } from '@/features/auth/auth-next';
import { SESSION_STATUS, useSessionGate } from '@/features/auth/hooks/use-session-gate';

/**
 * ĐĂNG KÝ ĐỐI TÁC — ADR 0053 điều 3 (realm `partner`), cùng luồng với site partner `/register`:
 * chọn tuyến trước, rồi MỘT form gom tài khoản (họ tên, SĐT + OTP, mật khẩu) + hồ sơ của tuyến
 * (`PartnerSignupScreen`). Hoa hồng xong ⇒ Tổng quan; gói xong ⇒ màn chờ kích hoạt.
 *
 * Ngoại lệ: `?next=` trỏ tới một đích KHÔNG phải tuyến (vd. lời mời vào gian hàng) — người đó chỉ
 * cần TÀI KHOẢN rồi về đúng đích, không mở gian hàng của mình ⇒ form tạo tài khoản như cũ.
 */
export default function PartnerRegisterRoute() {
  const router = useRouter();
  const enterApp = useEnterApp();

  /*
   * Mở từ app XePrime (hoặc link khác) kèm `?next=`: cất đích để vào thẳng đó sau khi xong. Đã có
   * phiên sẵn thì không bắt đăng nhập/đăng ký lần nữa — đi thẳng tới đích.
   */
  const session = useSessionGate();
  const signedIn = session.status === SESSION_STATUS.READY;
  const next = usePendAuthNext({ enabled: !signedIn });
  if (signedIn && next) {
    return <Redirect href={next as Href} />;
  }

  const chosenTrack = registrationTrackOfNext(next);
  if (next && !chosenTrack) {
    return (
      <RegisterScreen
        onAuthenticated={() => enterApp()}
        onRegistered={() => enterApp()}
        onOpenAccount={() => enterApp()}
        onSwitchToLogin={() => router.replace(ROUTES.account.login())}
        onCancel={() => goBackOr(router, ROUTES.account.login())}
      />
    );
  }

  return (
    <PartnerSignupScreen
      initialTrack={chosenTrack}
      onSwitchToLogin={() => router.replace(ROUTES.account.login())}
    />
  );
}
