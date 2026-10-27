'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cx } from '@/lib/cx';
import { isActivePath } from '@/lib/active-path';
import { LineIcon } from '@/components/icons/LineIcon';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';
import { AUTH_MODE, resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { CHAT_SIDE } from '@xeprime/types';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { useChatBadge } from '@/features/chat/hooks/use-chat-badge';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTheme } from '@/lib/theme';
import { CtaButton } from './CtaButton';
import { MarketAccountMenu } from './MarketAccountMenu';
import styles from './MarketHeader.module.css';

/**
 * Điều hướng chính theo design v2 (ADR 0062) — thứ tự và đích cố định, nhãn theo ngôn ngữ.
 *
 * "Cẩm nang" của bản thiết kế CỐ Ý không có: chưa có trang nào cho khách ở đích đó, và một mục
 * menu dẫn tới chỗ trống tệ hơn là không có mục. "Liên hệ" (trung tâm trợ giúp) nằm ở chân trang.
 */
const NAV = [
  // Đúng trang chủ — `isActivePath('/')` chỉ khớp chính nó, không khớp mọi đường dẫn.
  { key: 'home', labelKey: 'home', href: ROUTES.HOME },
  {
    key: 'search',
    labelKey: 'searchCars',
    href: ROUTES.SEARCH,
    /*
     * "Tìm xe" bao trùm cả việc TÌM và việc XEM một chiếc xe hay một gian hàng — người dùng ở
     * `/listings/abc` vẫn đang trong luồng tìm xe. Không có danh sách này thì mục tắt ngay khi
     * mở một thẻ xe, trông như menu bị hỏng.
     */
    activeWhen: [ROUTES.SEARCH, '/listings', '/shops'],
  },
  // Khách chưa đăng nhập tới đây vẫn được `AccountShell` mời đăng nhập ngay tại trang.
  { key: 'trips', labelKey: 'tripsNav', href: ROUTES.TRIPS },
  // Đích thật là `/about` (`ROUTES.ABOUT`), trang duy nhất nói sàn này là gì và tiền đi đâu.
  { key: 'about', labelKey: 'aboutXePrime', href: ROUTES.ABOUT },
] as const;

/** Logo theo chế độ sáng/tối — tỉ lệ 128 × 40 của artwork trong Figma. */
const LOGO = {
  light: { src: '/home/logo-gold.svg', width: 128, height: 40 },
  dark: { src: '/home/logo-gold-dark.svg', width: 128, height: 40 },
} as const;

export function MarketHeader() {
  const t = useTranslations('Navigation.public');
  const { data: user } = useCurrentUser();
  const pathname = usePathname();
  const { open } = useAuthModal();
  const logout = useMarketLogout();
  const nextFromHere = useNextFromCurrentPath();
  // Số chưa đọc dùng CHUNG với biểu tượng chat, không đếm lại — và cùng đích hộp thư.
  const chat = useChatBadge(CHAT_SIDE.CUSTOMER);
  const { theme, toggleTheme } = useTheme();
  const currentLogo = theme === 'dark' ? LOGO.dark : LOGO.light;

  const isSearchPage = pathname === ROUTES.SEARCH;
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    if (!isSearchPage) return;
    const onScroll = () => {
      setScrolledPast(window.scrollY > 140);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isSearchPage]);

  const hiddenOnScroll = isSearchPage && scrolledPast;

  return (
    <header className={cx(styles.header, isSearchPage && hiddenOnScroll && styles.headerHidden)}>
      <div className={styles.inner}>
        <Link href={ROUTES.HOME} className={styles.brand} aria-label={APP_NAME}>
          <Image
            src={currentLogo.src}
            width={currentLogo.width}
            height={currentLogo.height}
            alt=""
            priority
            unoptimized
            className={styles.logo}
          />
        </Link>

        <nav className={styles.nav} aria-label={t('mainNavLabel')}>
          {NAV.map((item) => {
            /*
             * Trước 23/09/2026 dòng này là `i === 0`, tức mục đầu luôn sáng vàng — ở trang điều
             * khoản sử dụng, thanh trên cùng vẫn khẳng định người dùng đang "Khám phá".
             *
             * `activeWhen` cho mục nào cần bao nhiều đường dẫn; mặc định là chính `href` của nó.
             */
            const current = ('activeWhen' in item ? item.activeWhen : [item.href]).some((path) =>
              isActivePath(pathname, path),
            );
            return (
              <Link
                key={item.key}
                href={item.href}
                className={current ? styles.navActive : styles.navLink}
                aria-current={current ? 'page' : undefined}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          {user ? (
            <>
              {/*
                Tin nhắn và thông báo đứng NGOÀI menu tài khoản: đó là hai thứ người ta liếc hằng
                ngày. Icon theo bộ nét của design v2 (`LineIcon`), cùng bộ với các dòng trong menu.
              */}
              <ChatMenu side={CHAT_SIDE.CUSTOMER} icon={<LineIcon name="message" />} />
              <NotificationBell context="customer" icon={<LineIcon name="bell" />} />
              {/*
                Đổi ngôn ngữ, đổi sáng/tối và lối "Trở thành chủ xe" nằm TRONG menu tài khoản,
                không phải nút riêng trên thanh: chỗ trên thanh dành cho những thứ người ta bấm hằng
                ngày. Khách CHƯA đăng nhập không có menu này nên vẫn thấy hai nút đó trên thanh, và
                đổi ngôn ngữ ở chân trang (VI | EN) — các lựa chọn ấy không được nằm sau cổng đăng nhập.
              */}
              <MarketAccountMenu user={user} chat={chat} onLogout={logout} />
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label={t('toggleTheme')}
                title={theme === 'dark' ? t('themeLight') : t('themeDark')}
              >
                {theme === 'dark' ? (
                  <LineIcon name="sun" className={styles.themeIcon} />
                ) : (
                  <LineIcon name="moon" className={styles.themeIcon} />
                )}
              </button>
              {/*
                Đăng nhập của KHÁCH mở modal ngay tại trang đang xem — không rời marketplace. Đổi
                ngôn ngữ của khách chưa đăng nhập nằm ở chân trang (VI | EN) theo design v2.
              */}
              <button
                type="button"
                className={styles.login}
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                <span className={styles.loginIcon} aria-hidden="true">
                  <Image src="/home/icon-login.svg" width={20} height={21} alt="" unoptimized />
                </span>
                <span className={styles.loginText}>
                  {t.rich('loginOrRegister', { br: () => <br /> })}
                </span>
              </button>
              {/*
                Lối sang SITE PARTNER (ADR 0051 điều 3) — đăng ký cho thuê xe là một tài khoản
                riêng ở đó (ADR 0053). Khách đã đăng nhập đi lối này từ menu tài khoản.
              */}
              <CtaButton href={resolveOwnerCtaHref()} className={styles.ownerCta}>
                {t('becomeOwner')}
              </CtaButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
