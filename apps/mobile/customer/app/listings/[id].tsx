import { useLocalSearchParams, useRouter } from 'expo-router';
import { ListingDetailScreen } from '@/features/marketplace/ListingDetailScreen';
import { ROUTES } from '@/navigation/routes';

export default function ListingDetailRoute() {
  const router = useRouter();
  const { id, serviceType } = useLocalSearchParams<{ id: string; serviceType?: string }>();

  return (
    <ListingDetailScreen
      vehicleId={id}
      {...(serviceType ? { initialServiceType: serviceType } : {})}
      // Mở từ danh sách thì lui về đó; mở bằng deep link thì chưa có gì để lui.
      onBack={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.explore.home()))}
    />
  );
}
