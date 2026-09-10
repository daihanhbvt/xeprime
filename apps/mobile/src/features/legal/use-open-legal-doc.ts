import { useCallback } from 'react';
import type { LegalDoc } from '@xeprime/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';

/**
 * Mở một văn bản pháp lý — MỘT cửa duy nhất cho mọi nơi viện dẫn nó.
 *
 * Có hook thay vì để từng chỗ tự gọi `router.push`: bốn chỗ cam kết (đăng nhập, đăng ký, tạo
 * gian hàng, trung tâm hỗ trợ) đều mở cùng một thứ, và khi cách mở thay đổi — nó đã đổi một lần
 * rồi, từ trình duyệt trong-app sang WebView — thì chỉ có một chỗ phải sửa.
 *
 * `useNavigateOnce` chứ không `router.push` trần: chạm hai lần vào một liên kết trong câu cam
 * kết là hai màn văn bản chồng lên nhau, và người dùng phải lui hai lần mới về được biểu mẫu
 * đang điền dở.
 */
export function useOpenLegalDoc(): (doc: LegalDoc) => void {
  const navigateOnce = useNavigateOnce();

  return useCallback((doc: LegalDoc) => navigateOnce(ROUTES.legal.doc(doc)), [navigateOnce]);
}
