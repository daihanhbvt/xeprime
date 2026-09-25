import { useLocalSearchParams } from 'expo-router';
import { TripDetailScreen } from '@/features/trips/TripDetailScreen';
import { ROUTES } from '@/navigation/routes';

/**
 * Chi tiết một chuyến đi thuê của chủ gian hàng — web `/manage/account/trips/[id]`
 * (`TripDetailView backHref={ROUTES.MANAGE.ACCOUNT_TRIPS}`). Cùng màn chi tiết của khu khách,
 * chỉ khác nơi nút lui trả về.
 */
export default function ManageAccountTripDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TripDetailScreen tripId={id} listHref={ROUTES.manage.accountTrips()} />;
}
