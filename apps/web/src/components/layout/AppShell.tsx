'use client';

import { Alert, Button, Spin } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { FEATURE_STATE } from '@xeprime/types';
import { flattenLeaves, matchSelectedKey, navForScope } from '@/constants/nav';
import { ROUTES } from '@/constants/routes';
import { FeatureExpiredNotice } from '@/components/feedback/FeatureExpiredNotice';
import { portalLoginWithNext } from '@/features/auth/post-auth-destination';
import { NoTenantState } from '@/features/shop/components/NoTenantState';
import { shopStatusNotice } from '@/features/shop/status-notice';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFeatureStates, usePlanEndsAt } from '@/hooks/use-feature';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { destroySession } from '@/services/auth.service';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNav } from './MobileNav';
import { useNavPreferencesSync } from './use-nav-preferences-sync';
import styles from './AppShell.module.css';
import { useTranslations } from 'next-intl';

/**
 * Các route NẰM TRONG `/manage` nhưng không dùng khung portal.
 *
 * `/manage/login` phải công khai, nếu không thì chưa đăng nhập sẽ bị chính shell đá về
 * `/manage/login` → vòng lặp. `/manage/onboarding` đã đăng nhập nhưng chưa có gian hàng, tức là
 * đúng nhóm mà shell chặn — nên nó tự render lấy, không có sidebar (chưa có gì để điều hướng).
 *
 * Next.js không cho một route con "thoát" layout cha, nên danh sách này là cách khai báo điều
 * đó ở đúng nơi quyết định — chính shell.
 */
const PUBLIC_PORTAL_PATHS: readonly string[] = [ROUTES.MANAGE.LOGIN];
const BARE_PORTAL_PATHS: readonly string[] = [ROUTES.MANAGE.LOGIN, ROUTES.MANAGE.ONBOARDING];

/**
 * Route CHIẾM TRỌN VIEWPORT: vùng cuộn dọc là của chính màn đó (lịch xe cuộn TRONG lưới),
 * không phải của body. Shell khoá chiều cao = 100dvh và tắt cuộn ở `.content`; đồng thời ẨN
 * thanh bottom-nav mobile CHỈ ở các route này — lịch cần đáy màn hình cho hàng "Xe còn trống",
 * các trang khác vẫn giữ điều hướng như cũ.
 */
const VIEWPORT_PORTAL_PATHS: readonly string[] = [ROUTES.MANAGE.CALENDAR];

/**
 * Khung của Management Portal.
 *
 * Portal dùng chung cho gian hàng và nền tảng, khác nhau ở scope (screen_spec §5) — nên
 * shell không phân biệt host/admin, chỉ Sidebar lọc menu theo quyền.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const tShop = useTranslations('Shop');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const { hasNoTenant, tenant } = useTenantScope();
  const featureStates = useFeatureStates();
  const planEndsAt = usePlanEndsAt();
  // Một chỗ ghi duy nhất cho tuỳ chọn sidebar/khối menu — sidebar desktop và Drawer mobile
  // cùng sửa một state, nên việc lưu không thuộc về riêng cái nào.
  useNavPreferencesSync();

  const isPublicPortalPath = PUBLIC_PORTAL_PATHS.includes(pathname);
  const isBarePortalPath = BARE_PORTAL_PATHS.includes(pathname);
  const notAuthenticated = !isPublicPortalPath && !isLoading && (isError || !user);

  // Cookie phiên hỏng/hết hạn: proxy chỉ kiểm tra CÓ cookie chứ không verify, nên vẫn cho vào
  // /manage rồi /auth/me trả 401. Ở đây xoá cookie hỏng (DELETE /auth/session) rồi ra
  // /manage/login — không xoá thì proxy cứ đá login ngược lại /manage (loop).
  useEffect(() => {
    if (!notAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        await destroySession();
      } catch {
        // Lỗi mạng khi xoá phiên vẫn không cản việc điều hướng ra login.
      }
      if (cancelled) return;
      queryClient.clear();
      router.replace(portalLoginWithNext(pathname));
    })();
    return () => {
      cancelled = true;
    };
  }, [notAuthenticated, pathname, router, queryClient]);

  // Trang đăng nhập cổng quản lý tự render lấy — không cần user, không có shell.
  if (isPublicPortalPath) return <>{children}</>;

  if (isLoading || isError || !user) {
    // Hoặc đang nạp /auth/me, hoặc đang dọn phiên hỏng để ra login (effect ở trên).
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  // User đăng nhập nhưng chưa thuộc gian hàng nào và không phải nhân sự nền tảng.
  // KHÔNG tự bật form tạo gian hàng ở đây (hành vi cũ): "chưa có shop" là trạng thái hợp lệ của
  // một khách thuê xe. Form tạo shop chỉ sống ở `/manage/onboarding`, nơi người dùng chủ động vào.
  if (hasNoTenant && !user.platformRole) {
    if (isBarePortalPath) return <>{children}</>;
    return <NoTenantState />;
  }

  if (isBarePortalPath) return <>{children}</>;

  const isViewportPath = VIEWPORT_PORTAL_PATHS.includes(pathname);

  /**
   * Dải trạng thái gian hàng, đầu vùng nội dung của MỌI trang quản lý.
   *
   * Ba điều đã sửa so với bản trước:
   *
   * 1. **Nói đúng trạng thái.** Trước đây một cờ gộp `draft | pending_review | needs_revision`
   *    in chung câu "Gian hàng đang chờ duyệt" — với shop `draft` thì đó là chuyện chưa xảy ra.
   *    Nội dung giờ lấy từ `shopStatusNotice`, cùng bảng mà dải ở trang hồ sơ dùng.
   * 2. **Có lối đi tiếp.** Dải cũ chỉ phát biểu một tình trạng rồi thôi; giờ nó luôn kèm nút dẫn
   *    tới nơi sửa được tình trạng đó — và ba trạng thái xấu (`rejected`/`suspended`/`expired`)
   *    trước đây không có dải nào cả, gian hàng bị khoá chỉ biết qua việc xe biến mất.
   * 3. **Không lặp ở `/manage/shop`.** Trang đó đã có bản đầy đủ (kèm lý do đội duyệt viết và
   *    nút Gửi duyệt), nên dải này ở đó chỉ là câu thứ hai nói cùng một chuyện — mà trước đây
   *    hai câu đó còn mâu thuẫn nhau.
   *
   * Dùng `Alert` chứ không phải `Result`: `Result` là trạng thái TOÀN TRANG (icon lớn, canh
   * giữa, padding dày) và nó đẩy nội dung thật của mọi màn hình xuống dưới nếp gấp.
   */
  const shopNotice = (() => {
    if (!tenant || pathname === ROUTES.MANAGE.SHOP) return null;
    const notice = shopStatusNotice(tenant.status);
    return notice.showInShell ? notice : null;
  })();

  /**
   * Băng "gói hết hạn, tính năng chỉ-xem" (ADR 0027 điều 3) — cùng chỗ và cùng lý do với dải
   * trạng thái gian hàng ở trên: một chỗ sửa phủ cả bảy khu bị gác.
   *
   * Bản đồ `pathname → feature` lấy từ CHÍNH cây nav (`leaf.feature`), không đẻ bản đồ thứ hai —
   * thêm một trang bị gác chỉ phải khai một chỗ. `matchSelectedKey` chạy trên cây CHƯA lọc, nên
   * băng vẫn tra được ngay cả khi mục đó đã bị ẩn khỏi menu.
   */
  const expiredFeature = (() => {
    if (!tenant) return null;
    const leaves = flattenLeaves(navForScope(Boolean(user.platformRole)));
    const href = matchSelectedKey(pathname, leaves);
    const feature = leaves.find((leaf) => leaf.href === href)?.feature;
    if (!feature) return null;
    return featureStates[feature] === FEATURE_STATE.READ_ONLY ? feature : null;
  })();

  return (
    <div
      className={[styles.shell, isViewportPath ? styles.shellViewport : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Sidebar />
      <div className={styles.main}>
        <Topbar user={user} />
        <main
          className={[styles.content, isViewportPath ? styles.contentViewport : '']
            .filter(Boolean)
            .join(' ')}
        >
          {shopNotice ? (
            <Alert
              className={styles.statusNotice}
              type={shopNotice.tone}
              showIcon
              title={tShop(`status.${shopNotice.key}.title`)}
              description={tShop(`status.${shopNotice.key}.shell`)}
              action={
                shopNotice.action ? (
                  <Link href={shopNotice.action.href}>
                    <Button size="small">{tShop(`status.action.${shopNotice.action.key}`)}</Button>
                  </Link>
                ) : null
              }
            />
          ) : null}
          {expiredFeature ? (
            <FeatureExpiredNotice feature={expiredFeature} planEndsAt={planEndsAt} />
          ) : null}
          {children}
        </main>
        {isViewportPath ? null : <MobileNav />}
      </div>
    </div>
  );
}
