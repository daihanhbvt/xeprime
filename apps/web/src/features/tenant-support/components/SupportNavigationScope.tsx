'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useContext, useMemo, type MouseEvent, type ReactNode } from 'react';
// Next không export hook "ghi đè router" công khai; context này là thứ `useRouter()` đọc. Import
// sâu có chủ đích (ADR 0050 §12) — nếu Next đổi đường dẫn, typecheck đỏ ngay chỗ này.
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { toTenantSupportRoute } from '@/constants/tenant-support-routes';
import { useSupportSession } from '../support-session';
import styles from './SupportNavigationScope.module.css';

type AppRouter = NonNullable<React.ContextType<typeof AppRouterContext>>;

/**
 * Giữ MỌI điều hướng của các trang dùng lại bên trong phiên hỗ trợ (ADR 0050 §12).
 *
 * Trang Manage/Owner Lite dựng link bằng `ROUTES.MANAGE.*`, `vehiclePath`, `bookingPath`… — hàng
 * trăm chỗ. Thay vì sửa từng chỗ (và để sót chỗ thứ n+1), lớp này đứng ở ranh giới:
 *
 *  - `useRouter().push/replace/prefetch` — ghi đè `AppRouterContext` cho cây con, ánh xạ qua
 *    `toTenantSupportRoute`.
 *  - Click `<Link>`/`<a>` — `next/link` KHÔNG đi qua context (nó điều hướng bằng hàm cấp module),
 *    nên chặn ở pha CAPTURE: `preventDefault` (Link bỏ qua click đã bị chặn) rồi tự điều hướng
 *    tới route của phiên. Ctrl/⌘/chuột giữa mở route của phiên ở tab mới.
 *
 * Route không có trong phiên (tài chính, chat, tài khoản…) → không đi đâu, và NÓI ra điều đó (một
 * cú bấm im lặng trông như lỗi). Route ngoài khu làm việc (trang công khai, màn nền tảng như "Thoát
 * chế độ hỗ trợ", tài khoản của chính nhân sự) → để nguyên. Chuột phải không bao giờ điều hướng:
 * trình duyệt bắn `auxclick` cho CẢ nút phải, và chỉ nút giữa nghĩa là "mở tab mới".
 *
 * Ngoài phiên: không làm gì (trả thẳng `children`).
 */
export function SupportNavigationScope({ children }: { children: ReactNode }) {
  const t = useTranslations('TenantSupport.navigation');
  const { message } = App.useApp();
  const session = useSupportSession();
  const router = useContext(AppRouterContext);
  const contextId = session?.contextId ?? null;

  const value = useMemo<AppRouter | null>(() => {
    if (!router || !contextId) return null;
    const resolve = (href: string) => toTenantSupportRoute(contextId, href);
    const blocked = () => void message.info(t('blocked'));
    return {
      ...router,
      push: (href, options) => {
        const route = resolve(href);
        if (route.kind === 'blocked') blocked();
        else router.push(route.href, options);
      },
      replace: (href, options) => {
        const route = resolve(href);
        if (route.kind === 'blocked') blocked();
        else router.replace(route.href, options);
      },
      prefetch: (href, options) => {
        const route = resolve(href);
        if (route.kind !== 'blocked') router.prefetch(route.href, options);
      },
    };
  }, [router, contextId, message, t]);

  if (!value || !contextId) return <>{children}</>;

  function intercept(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    // `click` chỉ nút trái; `auxclick` chỉ nút GIỮA (mở tab mới) — nút phải là menu ngữ cảnh.
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const anchor = (event.target as HTMLElement).closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href') ?? '';
    const route = toTenantSupportRoute(contextId!, href);
    if (route.kind === 'outside') return;
    if (route.kind === 'mapped' && route.href === href && anchor.target !== '_blank') return;

    event.preventDefault();
    if (route.kind === 'blocked') {
      void message.info(t('blocked'));
      return;
    }
    const newTab =
      anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
    if (newTab) window.open(route.href, '_blank', 'noopener');
    else value!.push(route.href);
  }

  return (
    <AppRouterContext.Provider value={value}>
      <div className={styles.scope} onClickCapture={intercept} onAuxClickCapture={intercept}>
        {children}
      </div>
    </AppRouterContext.Provider>
  );
}
