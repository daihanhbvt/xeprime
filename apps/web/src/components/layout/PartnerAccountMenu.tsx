'use client';

import { Avatar, Dropdown, type DropdownProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  cloneElement,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import {
  AccountMenuArrow,
  AccountMenuItem,
  AccountMenuLink,
  AccountMenuLocaleRow,
  AccountMenuLogout,
  AccountMenuPanel,
  AccountMenuSection,
  AccountMenuThemeRow,
} from '@/components/account-menu/AccountMenuParts';
import { LineIcon } from '@/components/icons/LineIcon';
import { ACCOUNT_SECTION, ROUTES, accountSectionPath } from '@/constants/routes';
import { useAccountIdentityLabel } from '@/features/account/hooks/use-account-identity-label';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import {
  PARTNER_TRACK,
  isCommissionOwner,
  resolvePartnerTrack,
} from '@/features/auth/post-auth-destination';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useAppDispatch } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import styles from './PartnerAccountMenu.module.css';

/**
 * Dòng "Giao diện ☀|☾" đã dựng xong nhưng CHƯA mở (chốt 06/11/2026): màu tối của site partner chưa
 * được chỉnh, bấm "Tối" lúc này là đưa người dùng vào một site lệch màu. Bật khi làm dark mode.
 */
const PARTNER_THEME_SWITCH_ENABLED = false;

/**
 * Dòng thứ hai dưới tên người — "Gian hàng · Vai", không phải email (header và menu nằm trên mọi
 * trang, kể cả lúc chia sẻ màn hình; đăng nhập site partner là SĐT).
 *
 * Chủ xe cá nhân: gian hàng mang chính tên họ — "Nguyễn Văn A · Chủ xe cá nhân" dưới "Nguyễn Văn A"
 * là nói một điều hai lần. Họ chỉ cần vai.
 */
export function partnerWorkspaceLine(user: CurrentUser, role: string): string {
  return user.tenant?.name && !isCommissionOwner(user) ? `${user.tenant.name} · ${role}` : role;
}

/**
 * Menu HỒ SƠ site partner — Figma Partner-XePrime `24051:85101` (06/11/2026), hai biến thể:
 *
 *   gian hàng (tuyến gói)                     cá nhân (tuyến hoa hồng)
 *   ┌ [logo✓] Tên người · Vai           › ┐   ┌ [ảnh] Tên người · Vai            › ┐
 *   │ Gian hàng              Tên gian hàng │   └─────────────────────────────────────┘
 *   └──────────── nền vàng ─────────────────┘
 *     Tài khoản & bảo mật                       Tài khoản & bảo mật
 *     Quản lý gian hàng                         Quản lý cho thuê
 *     (Giao diện ☀|☾ — chờ dark mode)           (Giao diện ☀|☾ — chờ dark mode)
 *                                               Nâng cấp gian hàng →   (vàng)
 *   ── chân xám: Ngôn ngữ VI|EN · Đăng xuất ──
 *
 * Quyết định đã chốt (`docs/design/09_PARTNER_REDESIGN.md` §2.3):
 *  - dấu tích xanh trên logo = MỌI gian hàng tuyến gói; tài khoản cá nhân không có. Nó là dấu nhận
 *    diện "đây là gian hàng", không phải kết quả xác minh pháp nhân;
 *  - bấm thẻ danh tính = "Tài khoản & bảo mật" (cùng đích với dòng ngay dưới);
 *  - nhãn tuyến/gói của menu cũ (`AccountTrackBadge`) đã bỏ — gói xem ở Thông tin cửa hàng / Hồ sơ
 *    chủ xe › Gói dịch vụ, băng "chờ thanh toán / hết hạn" vẫn ở đầu trang.
 *
 * Ai thấy dòng nào — cùng điều kiện với trang đích, không lối nào dẫn tới 403:
 *  - "Quản lý gian hàng" (`/shop`) chỉ khi `useShopSettingsAccess` — nhân viên không có
 *    `tenant.view` không thấy;
 *  - "Quản lý cho thuê" là "Hồ sơ chủ xe" (`/account`) — chỉ CHỦ xe tuyến hoa hồng. Với họ cùng
 *    URL đó là hồ sơ chủ xe, nên "Tài khoản & bảo mật" trỏ thẳng vào phần đăng nhập/mật khẩu;
 *  - "Nâng cấp gian hàng" (09/11/2026) = phễu nâng cấp có sẵn ở Hồ sơ chủ xe › Gói dịch vụ
 *    (`/account?section=plan`) — cũng chỉ CHỦ xe tuyến hoa hồng, vì section đó chỉ họ có;
 *  - thành viên của chủ xe tuyến hoa hồng và tài khoản chưa có gói: chỉ "Tài khoản & bảo mật".
 *
 * Bảng tự dựng trên `AccountMenuParts` (cùng khuôn với menu site khách), không phải `menu.items`.
 * Site quản trị giữ menu cũ (`useAccountMenuItems`) cho tới khi có design riêng.
 */
export function PartnerAccountMenu({
  user,
  placement = 'bottomRight',
  openOnHover = false,
  children,
}: {
  user: CurrentUser;
  placement?: DropdownProps['placement'];
  /** Header: rê chuột là mở. Thẻ người dùng trong drawer mobile (màn chạm) giữ bấm-để-mở. */
  openOnHover?: boolean;
  /** Nút mở — Dropdown gắn sự kiện vào nó. */
  children: ReactElement<HTMLAttributes<HTMLElement>>;
}) {
  const t = useTranslations('ManageCommon');
  const identityLabel = useAccountIdentityLabel();
  const canOpenShopSettings = useShopSettingsAccess();
  const logout = usePortalLogout();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  // Mở từ thẻ người dùng trong drawer mobile: đi trang thì drawer cũng phải đóng, không thì nó
  // che trang vừa mở. Trên desktop drawer vốn đóng — lệnh này không làm gì.
  const close = () => {
    setOpen(false);
    dispatch(setMobileNavOpen(false));
  };

  const isShop = resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE;
  const ownerProfile = isCommissionOwner(user);
  const personName = user.displayName || '—';
  const role = identityLabel(user);
  // Thẻ gian hàng đã có dòng "Gian hàng · Tên" riêng — dòng dưới tên chỉ còn vai.
  const subtitle = isShop ? role : partnerWorkspaceLine(user, role);
  const shopName = user.tenant?.name ?? '';
  const accountHref = ownerProfile
    ? accountSectionPath(ACCOUNT_SECTION.LOGIN)
    : ROUTES.MANAGE.ACCOUNT;

  const avatar = isShop ? (
    <span className={styles.avatarWrap}>
      <Avatar size={40} src={user.tenant?.logoUrl ?? undefined} className={styles.avatar}>
        {initialOf(shopName || personName)}
      </Avatar>
      <span className={styles.shopMark} aria-hidden="true" />
    </span>
  ) : (
    <Avatar size={40} src={user.avatarUrl ?? undefined} className={styles.avatar}>
      {initialOf(personName)}
    </Avatar>
  );

  const panel = (
    <AccountMenuPanel
      label={t('shell.accountMenu')}
      footer={
        <>
          <AccountMenuLocaleRow />
          <AccountMenuLogout
            label={t('shell.logout')}
            onClick={() => {
              close();
              void logout();
            }}
          />
        </>
      }
    >
      <AccountMenuSection>
        <AccountMenuItem>
          <Link
            href={accountHref}
            className={cx(styles.identity, isShop && styles.identityShop)}
            onClick={close}
          >
            <span className={styles.identityMain}>
              {avatar}
              <span className={styles.identityText}>
                <span className={styles.name} title={personName}>
                  {personName}
                </span>
                <span className={styles.subtitle} title={subtitle}>
                  {subtitle}
                </span>
              </span>
              <LineIcon name="chevron-right" className={styles.chevron} />
            </span>
            {isShop ? (
              <span className={styles.shopLine}>
                <span className={styles.shopLabel}>{t('shell.workspace')}</span>
                <span className={styles.shopName} title={shopName}>
                  {shopName}
                </span>
              </span>
            ) : null}
          </Link>
        </AccountMenuItem>
      </AccountMenuSection>

      <AccountMenuSection>
        <AccountMenuLink
          href={accountHref}
          icon="profile"
          label={t('shell.account')}
          onNavigate={close}
        />
        {isShop && canOpenShopSettings ? (
          <AccountMenuLink
            href={ROUTES.MANAGE.SHOP}
            icon="bag"
            label={t('shell.shopManage')}
            onNavigate={close}
          />
        ) : null}
        {ownerProfile ? (
          <AccountMenuLink
            href={ROUTES.MANAGE.ACCOUNT}
            icon="bag"
            label={t('shell.rentalManage')}
            onNavigate={close}
          />
        ) : null}
      </AccountMenuSection>

      {PARTNER_THEME_SWITCH_ENABLED || ownerProfile ? (
        <AccountMenuSection divider>
          {PARTNER_THEME_SWITCH_ENABLED ? <AccountMenuThemeRow /> : null}
          {ownerProfile ? (
            <AccountMenuLink
              href={accountSectionPath(ACCOUNT_SECTION.PLAN)}
              icon="award"
              label={t('shell.upgradeToShop')}
              onNavigate={close}
              trailing={<AccountMenuArrow />}
              accent
            />
          ) : null}
        </AccountMenuSection>
      ) : null}
    </AccountMenuPanel>
  );

  /*
   * Rê chuột là mở (header, 09/11/2026). Bấm / Enter / Space / ↓ cũng MỞ (không bật-tắt): người rê
   * chuột tới rồi bấm không được thấy menu vừa mở đã sập, và bàn phím phải có đường vào.
   */
  const trigger = openOnHover
    ? cloneElement(children, {
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        onClick: () => setOpen(true),
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        },
      })
    : children;

  return (
    <Dropdown
      trigger={openOnHover ? ['hover'] : ['click']}
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      popupRender={() => panel}
    >
      {trigger}
    </Dropdown>
  );
}
