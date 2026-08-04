'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { AuthPanel } from '@/features/auth/components/AuthPanel';
import { useAuthCache } from '@/features/auth/hooks/use-auth-actions';
import {
  AUTH_INTENT,
  AUTH_MODE,
  resolvePortalDestination,
} from '@/features/auth/post-auth-destination';
import type { CurrentUser } from '@/hooks/use-current-user';
import styles from './portal-login.module.css';

/**
 * Đăng nhập CỔNG QUẢN LÝ — chủ xe, nhân viên gian hàng và quản trị viên nền tảng.
 *
 * Cố tình là trang đầy đủ chứ không phải popup: đây là không gian quản lý, người dùng cần thấy
 * rõ mình đang rời marketplace. Khách thuê xe không bao giờ bị đưa tới đây cho các hành động
 * của khách — họ dùng modal ngay trên trang đang xem.
 *
 * Route này CÔNG KHAI (AppShell bỏ qua cổng xác thực cho nó, proxy không chặn) — nếu không thì
 * chưa đăng nhập sẽ bị đá về chính nó, thành vòng lặp.
 */
export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <PortalLoginView />
    </Suspense>
  );
}

function PortalLoginView() {
  const router = useRouter();
  const search = useSearchParams();
  const { refreshAfterAuth } = useAuthCache();

  const intent = search.get('intent');
  const next = search.get('next');
  const isOwnerIntent = intent === AUTH_INTENT.OWNER;

  async function handleAuthenticated(user: CurrentUser) {
    // Điều hướng theo SCOPE THẬT lấy từ `/auth/me` sau khi làm mới cache — không đoán từ form.
    const fresh = (await refreshAfterAuth(user)) ?? user;
    router.replace(resolvePortalDestination({ user: fresh, next, intent }));
  }

  return (
    <div className={styles.page}>
      <section className={styles.aside} aria-hidden="true">
        <Logo size="lg" tone="light" />
        <p className={styles.asideText}>
          Quản lý xe, lịch thuê, đơn hàng và tài chính của gian hàng ở một nơi.
        </p>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          <div className={styles.head}>
            <Logo size="md" />
            <div>
              <h1 className={styles.title}>Đăng nhập cổng quản lý</h1>
              <p className={styles.sub}>
                Dành cho chủ xe, nhân viên gian hàng và quản trị viên XePrime.
              </p>
            </div>
          </div>

          {isOwnerIntent ? (
            <div className={styles.intentNote}>
              Đăng nhập để tiếp tục đăng ký gian hàng. Chưa có tài khoản? Tạo tài khoản ở bước
              đăng nhập bên dưới rồi quay lại đây.
            </div>
          ) : null}

          <AuthPanel mode={AUTH_MODE.LOGIN} onAuthenticated={handleAuthenticated} />

          <div className={styles.foot}>
            <Link href={ROUTES.HOME} className={styles.backLink}>
              <ArrowLeftOutlined /> Quay lại tìm xe
            </Link>
            {!isOwnerIntent ? (
              <Link href={ROUTES.MANAGE.ONBOARDING}>
                <Button type="link" className={styles.ownerCta}>
                  Đăng ký trở thành chủ xe
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
