import { TripCardSkeleton } from '@/components/ui/Skeleton';
import { RequireSession } from '@/features/auth/RequireSession';
import { TripsScreen } from '@/features/trips/TripsScreen';

/**
 * Tab "Chuyến" (BKG-15). Cổng phiên ở đây chứ không trong màn: một deep link `xeprime://trips`
 * hay một thông báo đẩy mở thẳng màn này, và ẩn tab không phải chặn nó.
 */
export default function TripsRoute() {
  return (
    <RequireSession fallback={<TripsFallback />}>
      <TripsScreen />
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
