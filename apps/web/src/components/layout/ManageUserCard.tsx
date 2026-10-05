'use client';

import {
  LockOutlined,
  LogoutOutlined,
  ShopOutlined,
  UpOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { PERMISSION } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { ZONE } from '@/zones';
import { useZone } from '@/zones/ZoneProvider';
import { AccountTrackBadge } from '@/features/account/components/AccountTrackBadge';
import { useAccountIdentityLabel } from '@/features/account/hooks/use-account-identity-label';
import { cx } from '@/lib/cx';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { initialOf } from '@/lib/initials';
import styles from './ManageUserCard.module.css';
import { useTranslations } from 'next-intl';

export interface ManageUserCardProps {
  /** Thu gọn còn logo (sidebar 64px). */
  collapsed?: boolean;
  /**
   * `dark` = đặt trên `--xp-shell-sidebar-bg` (Sidebar desktop và Drawer mobile).
   * `light` = trên nền trắng. Cùng quy ước với `ManageMenu`.
   */
  tone?: 'light' | 'dark';
}

/**
 * Thẻ ở chân sidebar — danh tính KHU LÀM VIỆC, và là lối vào menu tài khoản.
 *
 * ## Một hình, và nó là logo gian hàng (16/09/2026)
 *
 * Trước đợt này thẻ mang avatar CÁ NHÂN, còn topbar lại mang chữ cái đầu của tên gian hàng —
 * hai hình đại diện cho hai thứ khác nhau trên cùng một màn hình, và người dùng phải tự đoán
 * cái nào nói về cái gì. Nay cả hai chỗ đều là logo gian hàng (`tenant.logoUrl` từ `/auth/me`,
 * fallback là chữ cái đầu của TÊN GIAN HÀNG): trong cổng quản lý, thứ đang được vận hành là
 * gian hàng.
 *
 * Người đang đăng nhập KHÔNG biến mất — họ là dòng "Đăng nhập: …" trong menu, đúng chỗ cần
 * thiết khi nhiều nhân viên dùng chung một máy. Và KHÔNG có đường nào chép logo gian hàng sang
 * `users.avatar_url`: một tấm là mặt tiền cửa hàng, tấm kia là ảnh của một con người trên chợ.
 *
 * Chỉ hiện tên và nhãn vai trò — KHÔNG hiện email hay số điện thoại. Vỏ portal nằm trên mọi
 * trang, kể cả lúc chia sẻ màn hình.
 *
 * Đăng xuất gọi `usePortalLogout` dùng chung với `Topbar` — một luồng, hai lối vào.
 */
export function ManageUserCard({ collapsed = false, tone = 'light' }: ManageUserCardProps) {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  const logout = usePortalLogout();
  const identityLabel = useAccountIdentityLabel();
  const zone = useZone();
  const isAdmin = zone === ZONE.ADMIN;
  /*
   * Không còn mục "Chuyến tôi đi thuê" (ADR 0053): tài khoản partner và nhân sự nền tảng là tài
   * khoản RIÊNG, không bao giờ đứng tên một chuyến đi thuê — chuyến đi thuê thuộc tài khoản khách ở
   * `xeprime.vn`. Lối chuyển tiếp `/manage/account/trips` cũ đã gỡ cùng lúc.
   */

  if (!user) return null;

  const workspaceName = user.tenant?.name ?? (user.displayName || user.email || '—');
  const signedInAs = user.displayName || user.email || '—';
  /*
   * Nhãn danh tính đọc TUYẾN, không đọc bảng vai — xem `useAccountIdentityLabel`.
   *
   * Chủ xe cá nhân và chủ gian hàng cùng mang vai `shop_owner`, nên một `domainLabel('tenantRole')`
   * gọi cả hai là "Chủ gian hàng" — ngay cạnh viên nhãn ghi "Chủ xe cá nhân · Hoa hồng 10%".
   */
  const role = identityLabel(user);
  const dark = tone === 'dark';

  const menuItems: MenuProps['items'] = [
    {
      /*
       * Đầu menu: gian hàng, AI đang đăng nhập, và TUYẾN.
       *
       * Thẻ bên dưới chỉ mang tên gian hàng và vai — nó còn phải thu về cột 64px, nơi cả hai đã
       * bị ẩn. Ba dòng ở đây là chỗ duy nhất trả lời đủ "tôi đang đứng trong gian hàng nào, bằng
       * tài khoản nào, và gian hàng đó trả tiền theo cách nào".
       */
      key: 'identity',
      label: (
        <span className={styles.menuIdentity}>
          <span className={styles.menuShop}>{workspaceName}</span>
          <span className={styles.menuUser}>{t('shell.signedInAs', { name: signedInAs })}</span>
          <AccountTrackBadge tenant={user.tenant} size="small" />
        </span>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      /*
       * BẢO MẬT TÀI KHOẢN — mật khẩu, phương thức đăng nhập, yêu cầu xoá tài khoản.
       *
       * Đích là `/manage/security`, không phải `/account`: đẩy người dùng sang khu khách để đổi
       * mật khẩu là bắt họ rời nơi làm việc, và với gian hàng tuyến gói thì khu đó đã đóng —
       * `AccountShell` chuyển họ ngược về đây, nên mục menu cũ là một vòng tròn.
       */
      key: 'security',
      icon: <LockOutlined aria-hidden />,
      label: (
        <Link href={isAdmin ? ROUTES.ADMIN.SECURITY : ROUTES.MANAGE.SECURITY}>
          {t('shell.security')}
        </Link>
      ),
    },
    // Hồ sơ cá nhân của tài khoản đối tác (ADR 0053 — tài khoản riêng của site partner).
    ...(isAdmin
      ? []
      : [
          {
            key: 'profile',
            icon: <UserOutlined aria-hidden />,
            label: <Link href={ROUTES.MANAGE.ACCOUNT}>{t('shell.profile')}</Link>,
          },
        ]),
    // Cài đặt gian hàng chỉ có nghĩa khi người dùng ĐANG đứng trong một gian hàng — nhân sự
    // nền tảng không có gian hàng nào để cài đặt.
    ...(user.tenant &&
    has(PERMISSION.TENANT_VIEW) &&
    resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE
      ? [
          {
            key: 'shop',
            icon: <ShopOutlined aria-hidden />,
            label: <Link href={ROUTES.MANAGE.SHOP}>{t('shell.shopSettings')}</Link>,
          },
        ]
      : []),
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined aria-hidden />,
      label: t('shell.logout'),
      onClick: () => void logout(),
    },
  ];

  const avatar = (
    <Avatar className={styles.avatar} shape="square" src={user.tenant?.logoUrl ?? undefined}>
      {initialOf(workspaceName)}
    </Avatar>
  );

  const trigger = collapsed ? (
    // Thu gọn thì tên bị ẩn — tooltip là chỗ duy nhất còn đọc được "đang ở gian hàng nào".
    <Tooltip title={`${workspaceName} · ${role}`} placement="right">
      <button
        type="button"
        className={cx(styles.card, dark && styles.dark, styles.cardCollapsed)}
        aria-label={`${t('shell.accountMenu')}: ${workspaceName} · ${role}`}
      >
        {avatar}
      </button>
    </Tooltip>
  ) : (
    <button
      type="button"
      className={cx(styles.card, dark && styles.dark)}
      aria-label={`${t('shell.accountMenu')}: ${workspaceName} · ${role}`}
    >
      {avatar}
      <span className={styles.info}>
        <span className={styles.name} title={workspaceName}>
          {workspaceName}
        </span>
        {/* Figma `14:1495`: vai trò là huy hiệu gold, không phải chữ mờ. Chữ trên nền gold
            dùng `--xp-color-primary-contrast` (đo được 6.60 — đạt AA). */}
        <span className={styles.role} title={role}>
          {role}
        </span>
      </span>
      <UpOutlined className={styles.caret} aria-hidden />
    </button>
  );

  return (
    <Dropdown trigger={['click']} placement="topRight" menu={{ items: menuItems }}>
      {trigger}
    </Dropdown>
  );
}
