import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import type { Href } from 'expo-router';
import { WebDocView } from '@/components/web/WebDocView';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import {
  contentNavigation,
  contentPage,
  CONTENT_NATIVE_TARGET,
  type ContentNativeTarget,
} from './content-navigation';

/** Màn NATIVE nào nhận đích nào — phần LUẬT nằm ở `content-navigation.ts` và có test riêng. */
const NATIVE_HREF: Readonly<Record<ContentNativeTarget, () => Href>> = {
  [CONTENT_NATIVE_TARGET.LIST_YOUR_VEHICLE]: () => ROUTES.listYourVehicle.root(),
  [CONTENT_NATIVE_TARGET.SEARCH]: () => ROUTES.explore.search(),
  [CONTENT_NATIVE_TARGET.MANAGE]: () => ROUTES.manage.home(),
};

/**
 * Bộ đọc CHUNG cho mọi trang nội dung của web — giới thiệu sàn, trung tâm trợ giúp, khu pháp lý.
 *
 * ## Vì sao đọc từ web chứ không dựng màn native
 *
 * Ba khu này mô tả CHÍNH SÁCH: mô hình vận hành, mô hình doanh thu, điều khoản, quyền dữ liệu,
 * cơ chế tiếp nhận phản ánh. Chúng phải sửa được ngay khi chính sách đổi, còn một màn native chỉ
 * đổi được qua một bản phát hành và một vòng duyệt store — nên nó sẽ kể một phiên bản cũ của
 * chính sách mà không ai biết. Bó message (`About.*`, `Legal.*`, `Support.*`) vẫn nằm trong gốc
 * chung, nhưng chúng dành cho web.
 *
 * Người dùng chốt ngày 24/09/2026: kể cả trang CHỈ MỤC pháp lý và trung tâm trợ giúp — hai trang
 * từng có bản native — cũng đọc từ web, để không còn chỗ nào phải đồng bộ tay.
 *
 * ## Một bộ đọc, một luật
 *
 * Trước đó mỗi khu có luật điều hướng riêng, và mỗi lần web thêm một lối đi là một lần phải nhớ
 * sửa đủ ba chỗ — đúng kiểu sai sót đã xảy ra với hai CTA của trang giới thiệu. Giờ cả ba khu
 * dùng `contentNavigation()`: đi lại giữa chúng ở NGAY trong bộ đọc này, và chỉ ba đích có màn
 * thật của app mới rời ra.
 *
 * Tiêu đề thanh đầu màn bám theo trang ĐANG hiện (`contentPage`), không theo địa chỉ mở màn.
 */
export function ContentWebScreen({
  path,
  anchor,
  onBack,
}: {
  /** Đường dẫn trên web, ví dụ `/legal/terms`. */
  path: string;
  anchor?: string;
  onBack: () => void;
}) {
  const tLegal = useTranslations('Legal');
  const tSupport = useTranslations('Support');
  /*
   * Nhãn trang giới thiệu lấy từ cột chân trang web dùng để trỏ tới chính nó — namespace `About`
   * là một trang dài và KHÔNG được gom vào bundle native (nội dung do WebView dựng, nạp cả bó chữ
   * vào app là chở theo một bản sao thứ hai có thể cũ hơn).
   */
  const tCompany = useTranslations('Marketplace.footer.columns.company');
  const navigateOnce = useNavigateOnce();

  const uri = `${resolveWebBaseUrl()}${path}${anchor ? `#${anchor}` : ''}`;

  /** Luật ở `contentNavigation()` (thuần, có test); ở đây chỉ còn phép THI HÀNH nó. */
  const allowNavigation = useCallback(
    (url: string) => {
      const next = contentNavigation(url);
      if (next.kind === 'native') {
        navigateOnce(NATIVE_HREF[next.target]());
        return false;
      }
      return next.kind === 'webview';
    },
    [navigateOnce],
  );

  const title = useCallback(
    (url: string) => {
      const page = contentPage(url);
      if (!page) return tCompany('about');
      if (page.kind === 'about') return tCompany('about');
      if (page.kind === 'support') return tSupport('title');
      if (page.kind === 'legalIndex') return tLegal('index.title');
      return tLegal(`docs.${page.doc}.title` as never);
    },
    [tCompany, tSupport, tLegal],
  );

  return (
    <WebDocView
      uri={uri}
      title={title}
      allowNavigation={allowNavigation}
      onBack={onBack}
      logLabel="trang nội dung"
    />
  );
}
