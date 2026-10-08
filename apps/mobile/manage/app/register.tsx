import { Redirect, useRouter, type Href } from 'expo-router';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { RegisterScreen } from '@/features/auth/RegisterScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { registrationTrackOfNext, usePendAuthNext } from '@/features/auth/auth-next';
import { SESSION_STATUS, useSessionGate } from '@/features/auth/hooks/use-session-gate';

/**
 * Tạo TÀI KHOẢN ĐỐI TÁC — ADR 0053 điều 3: app XePrime Partner tự đăng ký như site partner
 * (`/auth/mobile/register` với `clientApp: partner` ⇒ tài khoản realm `partner`). Xong thì vào
 * app; tài khoản mới chưa có gian hàng nên `ScopeGuard` đưa họ tới màn chọn cách cho thuê.
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

  return (
    <RegisterScreen
      onAuthenticated={() => enterApp()}
      onRegistered={() => enterApp()}
      // Tài khoản mới chưa có gian hàng: "mở tài khoản" cũng là vào app — `ScopeGuard` đưa tới màn
      // chọn cách cho thuê, nên không đẩy thêm `/manage/account` (nó bị thay ngay lập tức).
      onOpenAccount={() => enterApp()}
      onSwitchToLogin={() => router.replace(ROUTES.account.login())}
      onCancel={() => goBackOr(router, ROUTES.account.login())}
      chosenTrack={registrationTrackOfNext(next)}
    />
  );
}
