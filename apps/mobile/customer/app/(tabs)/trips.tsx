import { TripCardSkeleton } from '@/components/ui/Skeleton';
import { RequireSession } from '@/features/auth/RequireSession';
import { TripsWithDrivingScreen } from '@/features/driving/TripsWithDrivingScreen';

/**
 * Tab "Chuyến" (BKG-15). Cổng phiên ở đây chứ không trong màn: một deep link `xeprime://trips`
 * hay một thông báo đẩy mở thẳng màn này, và ẩn tab không phải chặn nó. `?tab=driving` mở
 * thẳng "Chuyến tôi lái" (ADR 0063).
 */
export default function TripsRoute() {
  return (
    <RequireSession fallback={<TripsFallback />}>
      <TripsWithDrivingScreen />
    </RequireSession>
  );
}

function TripsFallback() {
  return (
    <>
      {[0, 1, 2, 3].map((row) => (
        <TripCardSkeleton key={row} />
      ))}
    </>
  );
}
