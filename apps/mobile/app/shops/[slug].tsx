import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShopDetailScreen } from '@/features/marketplace/ShopDetailScreen';
import { ROUTES } from '@/navigation/routes';

export default function ShopDetailRoute() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return (
    <ShopDetailScreen
      slug={slug}
      // Mở từ trong app thì lui về chỗ cũ; mở bằng deep link thì chưa có gì để lui.
      onBack={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.explore.home()))}
    />
  );
}
