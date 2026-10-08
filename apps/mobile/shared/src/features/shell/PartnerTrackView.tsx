import type { ReactNode } from 'react';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { PARTNER_TRACK, resolvePartnerTrack } from './partner-track';

/**
 * MỘT route, hai nội dung theo TUYẾN — bản native của `PartnerTrackView` bên web (ADR 0053). Tuyến
 * gói thấy `packageView`; mọi tuyến khác thấy `commissionView` (`ScopeGuard` đã đưa tuyến "chưa có
 * gian hàng" và "gói chưa thanh toán" đi nơi khác trước khi tới đây).
 */
export function PartnerTrackView({
  packageView,
  commissionView,
}: {
  packageView: ReactNode;
  commissionView: ReactNode;
}) {
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser();
  // Lỗi mạng khi chưa có hồ sơ: báo lỗi + thử lại, không quay vòng mãi.
  if (!user && isError) {
    return (
      <Screen scroll={false}>
        <ScreenError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (isLoading || !user) {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }
  return <>{resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE ? packageView : commissionView}</>;
}
