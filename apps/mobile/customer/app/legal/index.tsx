import { useRouter } from 'expo-router';
import { ContentWebScreen } from '@/features/content/ContentWebScreen';
import { CONTENT_PATH } from '@/features/content/content-navigation';
import { ROUTES } from '@/navigation/routes';

/**
 * `/legal` — trang chủ khu pháp lý, CÙNG địa chỉ với web, nên một liên kết dán từ web (hoặc một
 * URL bị người dùng cắt bớt đuôi) mở thẳng được trong app.
 *
 * Đọc từ web như ba trang nội dung còn lại: nó nói bốn văn bản này là MỘT BỘ, cùng một ngày hiệu
 * lực, và chỗ phản ánh là trung tâm trợ giúp — ba câu đổi theo chính sách.
 */
export default function LegalIndexRoute() {
  const router = useRouter();

  return (
    <ContentWebScreen
      path={CONTENT_PATH.LEGAL}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.explore.home()))}
    />
  );
}
