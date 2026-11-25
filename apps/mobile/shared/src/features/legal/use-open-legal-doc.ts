import { createElement, useCallback } from 'react';
import { useSheetLevel, useSheetPortal } from '@/components/ui/SheetPortal';
import type { LegalDoc } from '@xeprime/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { LegalDocOverlay } from './LegalDocOverlay';

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
  const portal = useSheetPortal();
  const level = useSheetLevel();

  return useCallback(
    (doc: LegalDoc) => {
      /*
       * Gọi từ BÊN TRONG một tấm trượt ⇒ văn bản mở đè lên tấm (tầng trên), không điều hướng: tấm
       * vẽ ở host phủ trên cả ngăn xếp, một màn mới sẽ nằm DƯỚI nó (người dùng 20/11/2026).
       */
      if (portal && level > 0) {
        const id = `legal-doc-${doc}`;
        const close = () => portal.remove(id);
        portal.upsert(id, level + 1, createElement(LegalDocOverlay, { doc, onClose: close }));
        return;
      }
      navigateOnce(ROUTES.legal.doc(doc));
    },
    [navigateOnce, portal, level],
  );
}
