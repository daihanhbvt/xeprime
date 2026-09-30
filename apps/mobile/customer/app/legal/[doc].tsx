import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { isLegalDoc } from '@xeprime/domain';
import { LegalDocScreen } from '@/features/legal/LegalDocScreen';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/navigation/routes';

/**
 * Bốn văn bản pháp lý dùng CHUNG một route động, y như web (`/legal/[doc]`) — nên một liên kết
 * dán từ web mở được thẳng trong app.
 *
 * Slug lạ thì LUI, không render một WebView trỏ vào trang 404 của web: người dùng sẽ thấy trang
 * lỗi của một site khác nằm bên trong app mình.
 */
export default function LegalDocRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const router = useRouter();
  const valid = isLegalDoc(doc);

  /*
   * Lui trong EFFECT, không trong thân render.
   *
   * `router.back()` gọi thẳng lúc render là điều hướng ngay giữa lúc React đang dựng cây — React
   * cảnh báo, và tệ hơn: `useLocalSearchParams` có thể trả `undefined` ở khung hình ĐẦU TIÊN của
   * một cú deep link, nên màn tự lui trước khi tham số kịp về và người dùng thấy màn nhấp nháy
   * rồi biến mất.
   */
  useEffect(() => {
    if (valid) return;
    logger.warn(`Slug văn bản pháp lý không hợp lệ: ${String(doc)}`);
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.explore.home());
  }, [valid, doc, router]);

  if (!valid) return null;

  return (
    <LegalDocScreen
      doc={doc}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.explore.home()))}
    />
  );
}
