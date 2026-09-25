import { useLocalSearchParams, useRouter } from 'expo-router';
import { AboutScreen } from '@/features/content/AboutScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

/**
 * "Giới thiệu XePrime" — cùng địa chỉ với web (`/about`), nên một liên kết dán từ web mở được
 * thẳng trong app.
 *
 * `anchor` mang đúng phần `#…` mà trung tâm hỗ trợ dùng để nhảy tới một mục ("Đặt xe diễn ra thế
 * nào", "Tôi phải trả những khoản nào"). Nó đi qua tham số vì expo-router không phơi phần hash
 * của một Href ra cho màn đọc.
 */
export default function AboutRoute() {
  const { anchor } = useLocalSearchParams<{ anchor?: string }>();
  const router = useRouter();
  return (
    <AboutScreen
      {...(anchor ? { anchor } : {})}
      onBack={() => goBackOr(router, ROUTES.explore.home())}
    />
  );
}
