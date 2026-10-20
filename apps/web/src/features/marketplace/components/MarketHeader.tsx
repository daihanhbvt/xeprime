'use client';

import {
  CalendarOutlined,
  DownOutlined,
  LogoutOutlined,
  MessageOutlined,
  MoonOutlined,
  RightOutlined,
  ShopOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Dropdown, type MenuProps } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { isActivePath } from '@/lib/active-path';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';
import { AUTH_MODE, resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { CHAT_SIDE } from '@xeprime/types';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { useChatBadge } from '@/features/chat/hooks/use-chat-badge';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { CtaButton } from './CtaButton';
import styles from './MarketHeader.module.css';

/**
 * Điều hướng chính theo design v2 (ADR 0062) — thứ tự và đích cố định, nhãn theo ngôn ngữ.
 *
 * "Cẩm nang" của bản thiết kế CỐ Ý không có: chưa có trang nào cho khách ở đích đó, và một mục
 * menu dẫn tới chỗ trống tệ hơn là không có mục. "Chuyến của tôi" nằm trong menu tài khoản và
 * thanh tab dưới đáy (mobile) — nó là lối của người ĐÃ đăng nhập, không phải của mọi khách.
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
  // Đích thật là `/about` (`ROUTES.ABOUT`), trang duy nhất nói sàn này là gì và tiền đi đâu.
  { key: 'about', labelKey: 'aboutXePrime', href: ROUTES.ABOUT },
  // Trung tâm trợ giúp CÔNG KHAI là nơi liên hệ duy nhất hiện có của sàn.
  { key: 'contact', labelKey: 'contact', href: ROUTES.SUPPORT },
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
  const localeGroup = useLocaleMenuGroup();
  // Số chưa đọc dùng CHUNG với biểu tượng chat, không đếm lại — và cùng đích hộp thư.
  const chat = useChatBadge(CHAT_SIDE.CUSTOMER);
  const { theme, toggleTheme } = useTheme();
  const currentLogo = theme === 'dark' ? LOGO.dark : LOGO.light;

  const isSearchPage = pathname === ROUTES.SEARCH;
  const [hiddenOnScroll, setHiddenOnScroll] = useState(false);

  useEffect(() => {
    if (!isSearchPage) {
      setHiddenOnScroll(false);
      return;
    }
    const onScroll = () => {
      setHiddenOnScroll(window.scrollY > 140);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isSearchPage]);

  return (
    <header className={cx(styles.header, hiddenOnScroll && styles.headerHidden)}>
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
          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={t('toggleTheme')}
            title={theme === 'dark' ? t('themeLight') : t('themeDark')}
          >
            {theme === 'dark' ? (
              <SunOutlined className={styles.themeIcon} aria-hidden="true" />
            ) : (
              <MoonOutlined className={styles.themeIcon} aria-hidden="true" />
            )}
          </button>
          {user ? (
            <>
              <ChatMenu side={CHAT_SIDE.CUSTOMER} />
              <NotificationBell context="customer" />
              {/*
                Đổi ngôn ngữ nằm TRONG menu tài khoản (nhóm cuối), không phải một nút riêng trên
                thanh: nó là việc làm một lần rồi thôi, còn chỗ trên thanh thì dành cho những thứ
                người ta bấm hằng ngày. Khách CHƯA đăng nhập đổi ngôn ngữ ở chân trang (VI | EN) —
                chọn ngôn ngữ không được nằm sau một cổng đăng nhập.
              */}
              <Dropdown
                trigger={['click']}
                menu={{
                  items: accountMenu({
                    user,
                    onLogout: logout,
                    t,
                    localeGroup,
                    chat,
                    theme,
                    toggleTheme,
                  }),
                  className: styles.menu,
                }}
              >
                <span
                  className={styles.avatarTrigger}
                  role="button"
                  tabIndex={0}
                  aria-label={t('account')}
                >
                  <Avatar className={styles.avatar} size={34} src={user.avatarUrl ?? undefined}>
                    {initial(user.displayName)}
                  </Avatar>
                  <DownOutlined className={styles.avatarCaret} aria-hidden="true" />
                </span>
              </Dropdown>
            </>
          ) : (
            /*
             * Đăng nhập của KHÁCH mở modal ngay tại trang đang xem — không rời marketplace. Đổi
             * ngôn ngữ của khách chưa đăng nhập nằm ở chân trang (VI | EN) theo design v2.
             */
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
          )}
          {/*
            Lối sang SITE PARTNER (ADR 0051 điều 3) — đăng ký cho thuê xe là một tài khoản riêng ở
            đó (ADR 0053). Hiện cho cả khách đã đăng nhập: một khách thuê vẫn có thể muốn cho thuê.
          */}
          <CtaButton href={resolveOwnerCtaHref()} className={styles.ownerCta}>
            {t('becomeOwner')}
          </CtaButton>
        </div>
      </div>
    </header>
  );
}

/**
 * Menu tài khoản — thẻ danh tính + các lối đi, dựng lại 16/09/2026 theo bản thiết kế.
 *
 * ## Vì sao có một THẺ ở đầu thay vì một dòng tên
 *
 * Bản trước mở đầu bằng một dòng chữ bị vô hiệu hoá mang tên người dùng. Nó trả lời "tôi đang
 * đăng nhập bằng tài khoản nào" chỉ bằng một nửa: không có ảnh, không có email, và với người có
 * nhiều tài khoản (rất thường gặp — một để thuê, một để cho thuê) thì cái tên một mình không đủ
 * phân biệt. Thẻ mang avatar + tên + email + NHÃN TUYẾN, và bấm được để vào thẳng hồ sơ.
 *
 * ## Chỉ lối đi của KHÁCH
 *
 * Từ ADR 0053 phiên ở site này luôn là tài khoản khách: không còn nhánh gian hàng/chủ xe/quản trị
 * trong menu. Việc cho thuê xe là một tài khoản KHÁC ở site partner — menu chỉ còn một lối dẫn sang.
 *
 * Mọi dòng đều là `<Link>` thật chứ không phải `onClick` điều hướng: mở tab mới, sao chép địa
 * chỉ và điều hướng bằng bàn phím đều phải hoạt động như người dùng chờ đợi.
 */
function accountMenu({
  user,
  onLogout,
  t,
  localeGroup,
  chat,
  theme,
  toggleTheme,
}: {
  user: CurrentUser;
  onLogout: () => void;
  t: ReturnType<typeof useTranslations<'Navigation.public'>>;
  localeGroup: NonNullable<MenuProps['items']>[number];
  /** Đích hộp thư + số chưa đọc, lấy từ `useChatBadge` — xem docblock ở `MarketHeader`. */
  chat: { href: string; count: number };
  theme: ThemeMode;
  toggleTheme: () => void;
}): MenuProps['items'] {
  /**
   * Một dòng điều hướng: nhãn bên trái, huy hiệu (nếu có), mũi tên bên phải.
   *
   * Mũi tên là DẤU CHỈ HƯỚNG, không phải nút — nó nằm trong cùng thẻ neo với nhãn, nên không có
   * vùng chạm thứ hai để bấm trượt vào.
   */
  const row = (key: string, icon: ReactNode, href: string, label: string, badge?: number) => ({
    key,
    icon,
    label: (
      <Link href={href} className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        {badge ? <Badge count={badge} overflowCount={99} size="small" /> : null}
        <RightOutlined className={styles.rowChevron} aria-hidden="true" />
      </Link>
    ),
  });

  const profileHref = ROUTES.ACCOUNT.ROOT;

  return [
    {
      key: 'identity',
      className: styles.identityItem,
      label: (
        <Link href={profileHref} className={styles.identity}>
          <Avatar size={48} src={user.avatarUrl ?? undefined} className={styles.identityAvatar}>
            {initial(user.displayName)}
          </Avatar>
          <span className={styles.identityText}>
            <span className={styles.identityNameRow}>
              <span className={styles.identityName}>{user.displayName}</span>
            </span>
            {/* Email là thứ phân biệt hai tài khoản trùng tên; thiếu email thì SĐT làm việc đó. */}
            {(user.email ?? user.phone) ? (
              <span className={styles.identityContact}>{user.email ?? user.phone}</span>
            ) : null}
          </span>
          <RightOutlined className={styles.rowChevron} aria-hidden="true" />
        </Link>
      ),
    },
    { type: 'divider' },
    row('account', <UserOutlined />, ROUTES.ACCOUNT.ROOT, t('accountMine')),
    row('trips', <CalendarOutlined />, ROUTES.TRIPS, t('trips')),
    row('chat', <MessageOutlined />, chat.href, t('chat'), chat.count),
    { type: 'divider' },
    /*
     * Lối sang SITE PARTNER (ADR 0051 điều 3) — đăng ký cho thuê xe là một tài khoản riêng ở đó
     * (ADR 0053). Link khác site: URL tuyệt đối ở chế độ `host`.
     */
    row('become-owner', <ShopOutlined />, resolveOwnerCtaHref(), t('becomeOwner')),
    { type: 'divider' },
    localeGroup,
    { type: 'divider' },
    {
      key: 'theme-toggle',
      icon: theme === 'dark' ? <SunOutlined /> : <MoonOutlined />,
      label: (
        <div className={styles.row}>
          <span className={styles.rowLabel}>
            {theme === 'dark' ? t('themeLight') : t('themeDark')}
          </span>
        </div>
      ),
      onClick: toggleTheme,
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: t('logout'), onClick: onLogout },
  ];
}

/**
 * Chữ cái đầu của tên cho avatar. Fallback là chữ cái đầu của "Khách"/"Guest" theo ngôn ngữ —
 * nhưng tên khách là dữ liệu người dùng nhập, nên trường hợp rỗng cực hiếm và một ký tự trung
 * tính đủ dùng; không đáng kéo cả bộ dịch vào một hàm thuần.
 */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}
