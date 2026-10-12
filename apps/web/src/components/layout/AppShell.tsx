'use client';

import { Alert, Button, Spin } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FEATURE_STATE } from '@xeprime/types';
import { flattenLeaves, matchSelectedKey } from '@/constants/nav';
import { ROUTES } from '@/constants/routes';
import { FeatureExpiredNotice } from '@/components/feedback/FeatureExpiredNotice';
import {
  PARTNER_TRACK,
  isPartnerPublicPage,
  partnerPageRedirect,
  portalLoginWithNext,
  resolvePartnerTrack,
} from '@/features/auth/post-auth-destination';
import { shopStatusNotice } from '@/features/shop/status-notice';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFeatureStates, usePlanEndsAt } from '@/hooks/use-feature';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useWorkspace } from '@/hooks/use-workspace';
import { destroySession } from '@/services/auth.service';
import { ShellFrame } from './ShellFrame';
import { useManageNavTree } from './use-manage-nav-tree';
import { useNavPreferencesSync } from './use-nav-preferences-sync';
import styles from './AppShell.module.css';

/**
 * Route CHIẾM TRỌN VIEWPORT: vùng cuộn dọc là của chính màn đó (lịch xe cuộn TRONG lưới; hộp thư
 * tự quản hai cột cuộn), không phải của body. Shell khoá chiều cao = 100dvh và ẩn thanh tab dưới đáy
 * CHỈ ở các route này.
 */
const VIEWPORT_PATHS: readonly string[] = [ROUTES.MANAGE.CALENDAR, ROUTES.MANAGE.CHAT];

/**
 * Route TỰ DỰNG khung của mình, không sidebar: onboarding (thanh trên cùng + hero riêng) và wizard
 * đăng xe nhanh (`PartnerFocusLayout`). Cả hai là màn một việc, và cả hai có thể chạy khi CHƯA có
 * gian hàng — dựng sidebar rồi để mọi mục bên trong trả 403 là lừa người dùng. Wizard còn tự mở gian
 * hàng ở bước lưu: nằm trong khung đầy đủ thì sidebar bật lên giữa chừng.
 */
const BARE_PATHS: readonly string[] = [
  ROUTES.MANAGE.ONBOARDING,
  ROUTES.MANAGE.VEHICLE_REGISTER,
  // Quay về từ cổng thanh toán (ADR 0058) — có thể là gian hàng chưa mở cổng quản lý.
  ROUTES.MANAGE.PAYMENT_RETURN,
];

/**
 * Khung của SITE PARTNER (`partner.xeprime.vn`, realm `partner` — ADR 0051 điều 3 · ADR 0053).
 *
 * Phục vụ HAI tuyến trên một cây URL: gian hàng tuyến gói (Full Manage) và chủ xe tuyến hoa hồng
 * (Owner Lite). Menu chọn theo tuyến (`useManageNavTree`); trang nào tuyến nào được ở lại do
 * `partnerPageRedirect` quyết — cùng một luật với đích sau đăng nhập (bảng B1):
 *
 *  - chưa có gian hàng → `/register` (chọn tuyến);
 *  - gian hàng gói chưa thanh toán → `/onboarding` (bare, không khung);
 *  - tuyến hoa hồng mở trang chỉ của tuyến gói → trang chủ Owner Lite.
 *
 * Đây là lớp TRẢI NGHIỆM. Chặn thật nằm ở backend: RealmGuard (chỉ tài khoản partner), guard quyền,
 * `@SubscriptionTrackOnly` và cờ gói (ADR 0027 điều 4 · ADR 0038 điều 4).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const tShop = useTranslations('Shop');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const { tenant } = useTenantScope();
  const featureStates = useFeatureStates();
  const planEndsAt = usePlanEndsAt();
  const workspace = useWorkspace();
  const { sections } = useManageNavTree();
  // Một chỗ ghi duy nhất cho tuỳ chọn sidebar/khối menu — sidebar desktop và Drawer mobile
  // cùng sửa một state, nên việc lưu không thuộc về riêng cái nào.
  useNavPreferencesSync();

  const isPublicPage = isPartnerPublicPage(pathname);
  const notAuthenticated = !isPublicPage && !isLoading && (isError || !user);

  // Cookie phiên hỏng/hết hạn: proxy chỉ kiểm tra CÓ cookie chứ không verify, nên vẫn cho vào rồi
  // `/auth/me` trả 401. Ở đây xoá cookie hỏng (DELETE /auth/session) rồi ra trang đăng nhập — không
  // xoá thì proxy cứ đá trang đăng nhập ngược lại (loop).
  useEffect(() => {
    if (!notAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        await destroySession();
      } catch {
        // Lỗi mạng khi xoá phiên vẫn không cản việc điều hướng ra trang đăng nhập.
      }
      if (cancelled) return;
      queryClient.clear();
      router.replace(portalLoginWithNext(pathname));
    })();
    return () => {
      cancelled = true;
    };
  }, [notAuthenticated, pathname, router, queryClient]);

  // Đăng nhập, đăng ký, đặt lại mật khẩu, nhận lời mời: tự render lấy — không cần phiên, không khung.
  if (isPublicPage) return <>{children}</>;

  if (isLoading || isError || !user) {
    // Hoặc đang nạp /auth/me, hoặc đang dọn phiên hỏng để ra trang đăng nhập (effect ở trên).
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  const redirect = partnerPageRedirect(user, pathname);
  if (redirect) return <WrongPageRedirect href={redirect} />;

  if (BARE_PATHS.includes(pathname)) return <>{children}</>;

  const track = resolvePartnerTrack(user);

  /**
   * Dải trạng thái gian hàng tuyến gói, đầu vùng nội dung — nói đúng trạng thái và luôn kèm lối đi
   * tiếp; không lặp ở trang Cửa hàng (trang đó có bản đầy đủ). Tuyến hoa hồng theo dõi trạng thái ở
   * màn tiến trình đăng ký, không cần dải này.
   */
  const shopNotice = (() => {
    if (track !== PARTNER_TRACK.PACKAGE || !tenant || pathname === ROUTES.MANAGE.SHOP) return null;
    const notice = shopStatusNotice(tenant.status);
    return notice.showInShell ? notice : null;
  })();

  /**
   * Băng "gói hết hạn, tính năng chỉ-xem" (ADR 0027 điều 3). Bản đồ `pathname → feature` lấy từ
   * CHÍNH cây menu đang dùng (`leaf.feature`), không đẻ bản đồ thứ hai.
   */
  const expiredFeature = (() => {
    if (!tenant) return null;
    const leaves = flattenLeaves(sections);
    const href = matchSelectedKey(pathname, leaves);
    const feature = leaves.find((leaf) => leaf.href === href)?.feature;
    if (!feature) return null;
    return featureStates[feature] === FEATURE_STATE.READ_ONLY ? feature : null;
  })();

  const notices = (
    <>
      {shopNotice ? (
        <Alert
          className={styles.statusNotice}
          type={shopNotice.tone}
          showIcon
          title={tShop(`status.${shopNotice.key}.title`)}
          description={tShop(`status.${shopNotice.key}.shell`)}
          action={
            shopNotice.action ? (
              <Link href={workspace.paths[shopNotice.action.target]}>
                <Button size="small">{tShop(`status.action.${shopNotice.action.key}`)}</Button>
              </Link>
            ) : null
          }
        />
      ) : null}
      {expiredFeature ? (
        <FeatureExpiredNotice feature={expiredFeature} planEndsAt={planEndsAt} />
      ) : null}
    </>
  );

  return (
    <ShellFrame user={user} viewport={VIEWPORT_PATHS.includes(pathname)} notices={notices}>
      {children}
    </ShellFrame>
  );
}

/**
 * Người mở trang không thuộc tuyến/bước của mình: đưa về đúng chỗ, không render gì của trang đó.
 *
 * Là một component RIÊNG vì `AppShell` đã trả về sớm ở nhiều nhánh phía trên — gọi `useEffect`
 * sau một `return` có điều kiện là vi phạm quy tắc hook. `replace` chứ không `push`: bấm Quay lại
 * phải về trang trước, không phải về đúng URL vừa bị đẩy ra.
 */
function WrongPageRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <div className={styles.centered}>
      <Spin size="large" />
    </div>
  );
}
