import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Screen } from '@/components/layout/Screen';
import { TripsScreen } from '@/features/trips/TripsScreen';
import { TRIPS_TAB, TRIPS_TAB_PARAM, type TripsTab } from '@/navigation/routes-base';
import { DrivingTabSwitch } from './components/DrivingTabSwitch';
import { DrivingTripsList } from './DrivingTripsList';

/**
 * Tab "Chuyến" của app khách với bộ chuyển "Chuyến tôi thuê / Chuyến tôi lái" (ADR 0063) — gương
 * `TripsView` + `DrivingTabSwitch` bên web.
 *
 * Tab đang chọn đọc từ tham số `?tab=` của route — cùng tham số với web và với đích thông báo
 * `/trips?tab=driving`, nên một thông báo/deep link mở thẳng đúng tab. Đổi tab bằng `setParams`
 * (không push): đây là cùng một màn, nút lui không được dừng lại ở tab kia.
 */
export function TripsWithDrivingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ [TRIPS_TAB_PARAM]?: string }>();
  const tab: TripsTab =
    params[TRIPS_TAB_PARAM] === TRIPS_TAB.DRIVING ? TRIPS_TAB.DRIVING : TRIPS_TAB.RENTING;

  const change = useCallback(
    (next: TripsTab) =>
      router.setParams({ [TRIPS_TAB_PARAM]: next === TRIPS_TAB.DRIVING ? next : undefined }),
    [router],
  );

  if (tab === TRIPS_TAB.RENTING) {
    return <TripsScreen header={<DrivingTabSwitch value={tab} onChange={change} />} />;
  }

  return (
    // Màn gốc của tab: thanh tab đã nuốt `insets.bottom` — xem ghi chú ở `TripsScreen`.
    <Screen edges={['left', 'right']} scroll={false} padded={false}>
      <DrivingTabSwitch value={tab} onChange={change} />
      <DrivingTripsList />
    </Screen>
  );
}
