import { Redirect, useLocalSearchParams } from 'expo-router';
import { TripsScreen } from '@/features/trips/TripsScreen';
import { ROUTES } from '@/navigation/routes';
import { TRIPS_TAB, TRIPS_TAB_PARAM } from '@/navigation/routes-base';

/**
 * Tab "Chuyến" của app khách — CHỈ chuyến mình đi thuê, như web `TripsView` sau #221.
 *
 * "Chuyến tôi lái" (ADR 0063) đã chuyển sang "Trung tâm Tài xế" (`/account/driving`). Link cũ
 * `?tab=driving` (thông báo đã gửi, deep link) vẫn phải tới đúng chỗ — chuyển thẳng, không dừng lại
 * ở danh sách thuê.
 */
export function TripsWithDrivingScreen() {
  const params = useLocalSearchParams<{ [TRIPS_TAB_PARAM]?: string }>();
  if (params[TRIPS_TAB_PARAM] === TRIPS_TAB.DRIVING) {
    return <Redirect href={ROUTES.driving.trips()} />;
  }
  return <TripsScreen />;
}
