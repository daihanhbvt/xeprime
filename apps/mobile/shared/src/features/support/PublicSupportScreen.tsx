import { useRouter } from 'expo-router';
import { ContentWebScreen } from '@/features/content/ContentWebScreen';
import { CONTENT_PATH } from '@/features/content/content-navigation';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

/**
 * Trung tâm trợ giúp CÔNG KHAI — đọc từ web bằng bộ đọc nội dung chung (người dùng chốt
 * 24/09/2026).
 *
 * Trước đó đây là một màn NATIVE dựng từ bó `Support.*`: ba kênh liên hệ, tám chủ đề chia hai
 * nhóm người đọc, danh sách cần chuẩn bị, phạm vi hỗ trợ và khối pháp lý. Bản đó đẹp hơn ở khoản
 * bày biện (tám hàng gọn thay vì một lưới thẻ cao gần hai màn), nhưng nó là **bản sao thứ hai**
 * của một trang đổi theo CHÍNH SÁCH — số hotline, khung giờ trực, phạm vi tiếp nhận — nên mỗi lần
 * web sửa là một lần phải nhớ sửa lại ở đây, và chỗ nào quên thì app nói sai mà không ai biết.
 * Đúng một tuần sau khi dựng, web đã thay ba chỗ trống bằng viên "Sắp công bố" và bản native suýt
 * nữa đứng lại phía sau.
 *
 * Tám chủ đề vẫn tới đúng đích: `contentNavigation` giữ `/about#…` và `/legal/…` trong bộ đọc,
 * còn "Đăng xe cho thuê" và "Quản lý gian hàng" rời WebView sang wizard và khu quản lý NATIVE.
 *
 * Cổng phiên: KHÔNG có. Quy chế sàn viện dẫn trang này làm "cơ chế tiếp nhận phản ánh", và người
 * mắc kẹt giữa chuyến thường là người không đăng nhập nổi.
 */
export function PublicSupportScreen() {
  const router = useRouter();

  return (
    <ContentWebScreen
      path={CONTENT_PATH.SUPPORT}
      onBack={() => goBackOr(router, ROUTES.explore.home())}
    />
  );
}
