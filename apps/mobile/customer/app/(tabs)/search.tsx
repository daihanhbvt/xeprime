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
    bodyType?: string;
  }>();

  // Màn tìm xe là TAB thứ hai (người dùng chốt 28/10/2026): tab giữ màn sống giữa các lần mở,
  // nên `key` theo tham số — trang chủ gửi bộ lọc mới thì màn dựng lại với bộ lọc đó.
  return (
    <SearchResultsScreen
      key={JSON.stringify(params)}
      initialFilters={{
        ...(params.vehicleType ? { vehicleType: params.vehicleType } : {}),
        ...(params.serviceType ? { serviceType: params.serviceType } : {}),
        ...(params.provinceCode ? { provinceCode: params.provinceCode } : {}),
        ...(params.routeType ? { routeType: params.routeType } : {}),
        ...(params.pickupAt ? { pickupAt: params.pickupAt } : {}),
        ...(params.returnAt ? { returnAt: params.returnAt } : {}),
        ...(params.hourly === '1' ? { hourly: true } : {}),
        ...(params.bodyType ? { bodyType: params.bodyType.split(',').filter(Boolean) } : {}),
      }}
      onBack={() => router.navigate(ROUTES.explore.home())}
      embedded
    />
  );
}
