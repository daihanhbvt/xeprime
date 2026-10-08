import { Redirect, useLocalSearchParams } from 'expo-router';
import { PARTNER_HANDOFF_INTENT, PARTNER_HANDOFF_PATHNAME } from '@/navigation/routes';

/**
 * Lời mời vào gian hàng dành cho TÀI KHOẢN ĐỐI TÁC (ADR 0053 điều 3) — trả lời ở app XePrime
 * Partner. Link mời mở nhầm app khách thì chuyển sang màn handoff, và nút "Mở XePrime Partner" mở
 * thẳng đúng lời mời đó.
 */
export default function InviteHandoffRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return (
    <Redirect
      href={{
        pathname: PARTNER_HANDOFF_PATHNAME,
        params: { intent: PARTNER_HANDOFF_INTENT.INVITE, token },
      }}
    />
  );
}
