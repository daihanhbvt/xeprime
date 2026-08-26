import { useLocalSearchParams, useRouter } from 'expo-router';
import { SearchResultsScreen } from '@/features/marketplace/SearchResultsScreen';
import { ROUTES } from '@/navigation/routes';

/**
 * Ngữ cảnh đi qua route params — cùng vai trò query string của `/search` bên web, chỉ khác chỗ
 * cất. Giá trị đến từ `expo-router` nên luôn là chuỗi; ép về đúng kiểu trước khi vào filter.
 */
export default function SearchRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    vehicleType?: string;
    serviceType?: string;
    provinceCode?: string;
    routeType?: string;
    pickupAt?: string;
    returnAt?: string;
    hourly?: string;
  }>();

  return (
    <SearchResultsScreen
      initialFilters={{
        ...(params.vehicleType ? { vehicleType: params.vehicleType } : {}),
        ...(params.serviceType ? { serviceType: params.serviceType } : {}),
        ...(params.provinceCode ? { provinceCode: params.provinceCode } : {}),
        ...(params.routeType ? { routeType: params.routeType } : {}),
        ...(params.pickupAt ? { pickupAt: params.pickupAt } : {}),
        ...(params.returnAt ? { returnAt: params.returnAt } : {}),
        ...(params.hourly === '1' ? { hourly: true } : {}),
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.explore.home()))}
    />
  );
}
