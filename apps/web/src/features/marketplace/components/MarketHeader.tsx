'use client';

import {
  CalendarOutlined,
  CarOutlined,
  DownOutlined,
  LogoutOutlined,
  MessageOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';
import { AUTH_MODE, resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { ACCOUNT_TRACK, CHAT_SIDE, resolveAccountTrack, tenantUsesManagePortal } from '@xeprime/types';
import { isCommissionOwner } from '@/constants/account-nav';
import { VerifiedMark } from '@/components/common/VerifiedMark';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { useChatBadge } from '@/features/chat/hooks/use-chat-badge';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import styles from './MarketHeader.module.css';

/**
 * Điều hướng chính — thứ tự và đích cố định, nhãn theo ngôn ngữ.
 *
 * Mục thứ ba đổi theo TUYẾN của tenant: thành viên gian hàng tuyến gói không phải khách thuê ở
 * chợ này, nên "Chuyến của tôi" thành "Quản lý gian hàng". Xem `navFor`.
 */
const NAV_BASE = [
  { key: 'explore', labelKey: 'explore', href: ROUTES.HOME },
  { key: 'about', labelKey: 'about', href: ROUTES.HOME },
] as const;

/**
 * Mục cuối của thanh điều hướng, theo vai của người đang xem.
 *
 * Gian hàng TUYẾN GÓI vẫn **xem marketplace bình thường** — họ chỉ không dùng chức năng khách
 * thuê. Thay vì bỏ trống một chỗ trên thanh, đưa họ về nơi họ thật sự làm việc.
 */
function navFor(isShopMember: boolean) {
  return [
    ...NAV_BASE,
    isShopMember
      ? { key: 'manage', labelKey: 'manageShop' as const, href: ROUTES.MANAGE.ROOT }
      : { key: 'trips', labelKey: 'trips' as const, href: ROUTES.TRIPS },
  ];
}

export function MarketHeader() {
  const t = useTranslations('Navigation.public');
  const { data: user } = useCurrentUser();
  const { open } = useAuthModal();
  const logout = useMarketLogout();
  const nextFromHere = useNextFromCurrentPath();
  const localeGroup = useLocaleMenuGroup();
  const tBadge = useTranslations('Account.trackBadge');
  /*
   * Số chưa đọc dùng CHUNG với biểu tượng chat, không đếm lại.
   *
   * `useChatBadge` cũng trả ĐÍCH của hộp thư, và đích đó đổi theo người: chủ xe tuyến hoa hồng
   * đi tới hộp thư HỢP NHẤT (ADR 0038 điều 10). Ghép `/chat` cứng vào menu sẽ đúng với khách thuê
   * và sai với họ ngay khi hộp thư gian hàng có tin.
   */
  const chat = useChatBadge(CHAT_SIDE.CUSTOMER);

  /*
   * Thành viên gian hàng TUYẾN GÓI — mọi vai, kể cả `shop_owner`.
   *
   * Hỏi TUYẾN của tenant (`billingMode` hiệu lực, đã gồm cả pha `grace`), KHÔNG hỏi `roleKey`:
   * chủ xe tuyến hoa hồng cũng là `shop_owner` nhưng họ VẪN là khách thuê ở chợ này.
   *
   * Bản trước không hỏi gì cả, nên tài khoản gian hàng thấy "Chuyến của tôi", biểu tượng chat
   * khách và chuông thông báo khách — ba chức năng không thuộc về họ.
   */
  const isShopMember = tenantUsesManagePortal(user?.tenant ?? null);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={ROUTES.HOME} className={styles.brand} aria-label={APP_NAME}>
          <Logo size="sm" />
        </Link>

        <nav className={styles.nav} aria-label={t('mainNavLabel')}>
          {navFor(isShopMember).map((item, i) => (
            <Link
              key={item.key}
              href={item.href}
              className={i === 0 ? styles.navActive : styles.navLink}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className={styles.right}>
          {user ? (
            <>
              {/*
                Chat và chuông PHÍA KHÁCH (15/09/2026).

                Gian hàng tuyến gói không có hộp thư khách ở đây: chat vận hành của họ nằm trong
                Manage (`/manage/chat`), cùng hộp thư yêu cầu thuê. Hai luồng khác nhau — một là
                "tôi đang thuê xe của ai đó", một là "khách đang hỏi xe của tôi" — và trộn chúng
                vào một biểu tượng làm người trực đơn không biết mình đang đọc cái nào.
              */}
              {isShopMember ? null : (
                <>
                  <ChatMenu side={CHAT_SIDE.CUSTOMER} />
                  {/*
                    Chuông của chủ xe tuyến hoa hồng phải dẫn tới route trong KHU USER.

                    Họ nhận thông báo của cả hai vai — khách đặt xe của họ, và chuyến họ đi thuê —
                    nhưng `/manage` là cánh cửa đóng với họ. Bề mặt `customer` thì làm mọi thông báo
                    về XE và GIAN HÀNG của chính họ thành dòng không bấm được; bề mặt `owner` đưa
                    hai loại đó về `/account/vehicles` và hồ sơ chủ xe.
                  */}
                  <NotificationBell context={isCommissionOwner(user) ? 'owner' : 'customer'} />
                </>
              )}
              {/*
                Đổi ngôn ngữ nằm TRONG menu tài khoản (nhóm cuối), không phải một nút riêng trên
                thanh: nó là việc làm một lần rồi thôi, còn chỗ trên thanh thì dành cho những thứ
                người ta bấm hằng ngày. Khách CHƯA đăng nhập không có menu này nên vẫn được một
                nút riêng ở nhánh dưới — chọn ngôn ngữ không được nằm sau một cổng đăng nhập.
              */}
              <Dropdown
                trigger={['click']}
                menu={{
                  items: accountMenu({
                    user,
                    onLogout: logout,
                    t,
                    localeGroup,
                    isShopMember,
                    chat,
                    verifiedLabel: tBadge('verifiedHint'),
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
            <>
              <LocaleSwitcher />
              {/* Đăng nhập của KHÁCH mở modal ngay tại trang đang xem — không rời marketplace. */}
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                {t('login')}
              </Button>
            </>
          )}
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
 * ## Lối đi đổi theo TUYẾN, không đổi theo vai
 *
 * Thành viên gian hàng tuyến gói không phải khách thuê ở chợ này (ADR 0038 điều 7): họ không có
 * chuyến, không có hộp thư khách, không có xe trong khu user — cả ba đã ở `/manage`. Chủ xe
 * tuyến hoa hồng thì ngược lại, họ sống ở đây.
 *
 * Mọi dòng đều là `<Link>` thật chứ không phải `onClick` điều hướng: mở tab mới, sao chép địa
 * chỉ và điều hướng bằng bàn phím đều phải hoạt động như người dùng chờ đợi.
 */
function accountMenu({
  user,
  onLogout,
  t,
  localeGroup,
  isShopMember,
  chat,
  verifiedLabel,
}: {
  user: CurrentUser;
  onLogout: () => void;
  t: ReturnType<typeof useTranslations<'Navigation.public'>>;
  localeGroup: NonNullable<MenuProps['items']>[number];
  isShopMember: boolean;
  /** Đích hộp thư + số chưa đọc, lấy từ `useChatBadge` — xem docblock ở `MarketHeader`. */
  chat: { href: string; count: number };
  /** Nghĩa của dấu xác thực — dịch ở nơi gọi để component `common/` không dính namespace nào. */
  verifiedLabel: string;
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

  /*
   * Hồ sơ CON NGƯỜI của người đang đăng nhập.
   *
   * Thành viên gian hàng tuyến gói đọc nó ở `/manage/account`; `AccountShell` chuyển hướng `/account`
   * của họ sang đó, nên trỏ thẳng là bớt một cú nhảy chứ không phải một luật thứ hai.
   */
  const profileHref = isShopMember ? ROUTES.MANAGE.SECURITY : ROUTES.ACCOUNT.ROOT;

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
              {/*
                DẤU XÁC THỰC thay cho nhãn chữ (16/09/2026).

                Nhãn cũ là một pill mang "Chủ gian hàng · Gói <tên gói do admin đặt>" — dài, chiếm
                trọn một dòng dưới email, và tên gói thì không phải thứ người ta mở menu tài khoản
                ra để đọc. Dấu đứng ngay sau tên nói đúng một điều mà khách cần biết về danh tính
                này, bằng thứ ngôn ngữ thị giác họ đã quen.

                Tên gói KHÔNG mất: nó vẫn ở thẻ tài khoản trong `/account` và ở menu của `/manage`,
                nơi người dùng đang thật sự nói chuyện về gói.
              */}
              {isVerifiedShop(user) ? (
                <VerifiedMark label={verifiedLabel} className={styles.identityVerified} />
              ) : null}
            </span>
            {/* Email là thứ phân biệt hai tài khoản trùng tên; thiếu email thì SĐT làm việc đó. */}
            {user.email ?? user.phone ? (
              <span className={styles.identityContact}>{user.email ?? user.phone}</span>
            ) : null}
          </span>
          <RightOutlined className={styles.rowChevron} aria-hidden="true" />
        </Link>
      ),
    },
    { type: 'divider' },
    ...(isShopMember
      ? [
          /*
           * Hồ sơ PHÁP NHÂN — khác hẳn thẻ danh tính ở trên, thứ trỏ về hồ sơ của một CON NGƯỜI.
           * Gộp hai cái lại là để một người sửa hồ sơ gian hàng trong khi tưởng đang sửa hồ sơ mình.
           */
          row('shop-profile', <SolutionOutlined />, ROUTES.MANAGE.SHOP, t('shopProfile')),
        ]
      : [
          row('account', <UserOutlined />, ROUTES.ACCOUNT.ROOT, t('accountMine')),
          /*
           * "Xe của tôi" chỉ có nghĩa với CHỦ XE tuyến hoa hồng — họ là người duy nhất có đội xe
           * nằm trong khu user. Khách thuê thuần không có xe nào, và một mục dẫn tới danh sách
           * rỗng vĩnh viễn là một mục nói dối về sản phẩm.
           */
          ...(isCommissionOwner(user)
            ? [row('vehicles', <CarOutlined />, ROUTES.ACCOUNT.VEHICLES, t('vehiclesMine'))]
            : []),
          row('trips', <CalendarOutlined />, ROUTES.TRIPS, t('trips')),
          row('chat', <MessageOutlined />, chat.href, t('chat'), chat.count),
        ]),
    { type: 'divider' },
    /*
     * Khu làm việc, KHÔNG phải `/manage` cứng: chủ xe tuyến hoa hồng làm việc ở `/account`
     * (ADR 0027/0028), và mục này từng là một trong 19 đường dẫn đưa họ vào nhầm cổng quản lý.
     * `resolveOwnerCtaHref` trả về landing công khai cho người chưa có gian hàng.
     */
    row(
      user.tenant ? 'manage' : 'become-owner',
      <ShopOutlined />,
      resolveOwnerCtaHref(user),
      user.tenant ? t('manageShop') : t('becomeOwner'),
    ),
    ...(user.platformRole
      ? [
          row(
            'admin',
            <SafetyCertificateOutlined />,
            ROUTES.MANAGE.ADMIN,
            t('platformAdmin'),
          ),
        ]
      : []),
    { type: 'divider' },
    localeGroup,
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: t('logout'), onClick: onLogout },
  ];
}

/**
 * Tài khoản này có được gắn dấu xác thực không.
 *
 * ĐÚNG một nhóm: chủ gian hàng tuyến gói. Họ là người đã đi qua vòng duyệt hồ sơ của nền tảng VÀ
 * đang trả thuê bao — hai điều mà một cái tên không tự nói ra được.
 *
 * Chủ xe tuyến hoa hồng KHÔNG có dấu, và đó không phải sự phân biệt đối xử: họ chưa đi qua vòng
 * duyệt đó. Gắn dấu cho cả hai thì dấu không còn phân biệt được gì, và một dấu không phân biệt
 * được gì là một dấu nói dối.
 *
 * Phép suy mượn `resolveAccountTrack` (`@xeprime/types`) — cùng hàm mà nhãn chữ dùng, nên dấu và
 * nhãn không thể nói hai điều khác nhau về cùng một người.
 */
function isVerifiedShop(user: CurrentUser): boolean {
  return resolveAccountTrack(user.tenant).track === ACCOUNT_TRACK.SHOP_OWNER;
}

/**
 * Chữ cái đầu của tên cho avatar. Fallback là chữ cái đầu của "Khách"/"Guest" theo ngôn ngữ —
 * nhưng tên khách là dữ liệu người dùng nhập, nên trường hợp rỗng cực hiếm và một ký tự trung
 * tính đủ dùng; không đáng kéo cả bộ dịch vào một hàm thuần.
 */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}
