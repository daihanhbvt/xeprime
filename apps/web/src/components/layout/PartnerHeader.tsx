'use client';

import { MenuOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CHAT_SIDE } from '@xeprime/types';
import { Logo } from '@/components/brand/Logo';
import { LineIcon } from '@/components/icons/LineIcon';
import { ROUTES } from '@/constants/routes';
import { useAccountIdentityLabel } from '@/features/account/hooks/use-account-identity-label';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useWorkspace } from '@/hooks/use-workspace';
import { initialOf } from '@/lib/initials';
import { useAppDispatch } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import { HeaderIconButton } from './HeaderIconButton';
import { PartnerTopNav } from './PartnerTopNav';
import { useAccountMenuItems } from './use-account-menu';
import styles from './PartnerHeader.module.css';

/**
 * Header site partner — Figma Partner-XePrime Header `23649:27690` (biến thể Default).
 *
 * Trái → phải: logo · menu ngang (`PartnerTopNav`) · ba nút (cài đặt · tin nhắn · thông báo) ·
 * vạch ngăn · khối hồ sơ mở menu tài khoản. Dải breadcrumb (biến thể Details) là
 * `PartnerBreadcrumb`, đứng NGOÀI phần dính để không ăn thêm chiều cao khi cuộn.
 *
 * Ba quyết định đã chốt với người dùng (02/11/2026, `docs/design/09_PARTNER_REDESIGN.md` §2):
 *  - nút bánh răng mở "Tài khoản & bảo mật" của NGƯỜI đăng nhập (chủ xe tuyến hoa hồng: cùng URL là
 *    "Hồ sơ chủ xe") — "Cấu hình" trên menu mới là cài đặt của CỬA HÀNG;
 *  - khối hồ sơ theo bố cục design (ảnh · tên người) nhưng dòng thứ hai là gian hàng · vai, KHÔNG
 *    phải email: header nằm trên mọi trang kể cả lúc chia sẻ màn hình, và đăng nhập site partner là
 *    SĐT nên nhiều tài khoản không có email;
 *  - menu tài khoản là `useAccountMenuItems` (cùng bộ với thẻ người dùng ở drawer mobile), gồm đổi
 *    ngôn ngữ.
 *
 * Dưới ranh vỏ 1024px menu ngang nhường chỗ cho nút mở drawer (`MobileNav` dựng drawer + thanh tab
 * dưới đáy từ CÙNG cây menu).
 */
export function PartnerHeader({ user }: { user: CurrentUser }) {
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon');
  const dispatch = useAppDispatch();
  const accountMenu = useAccountMenuItems();
  const identityLabel = useAccountIdentityLabel();
  const { paths } = useWorkspace();
  const ownerProfile = isCommissionOwner(user);

  const personName = user.displayName || '-';
  const role = identityLabel(user);
  /*
   * Chủ xe cá nhân: gian hàng mang chính tên họ — "Nguyễn Văn A · Chủ xe cá nhân" dưới "Nguyễn Văn A"
   * là nói một điều hai lần. Họ chỉ cần vai.
   */
  const workspaceLine = user.tenant?.name && !ownerProfile ? `${user.tenant.name} · ${role}` : role;

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Button
          type="text"
          className={styles.hamburger}
          icon={<MenuOutlined />}
          aria-label={t('manage.openMenu')}
          onClick={() => dispatch(setMobileNavOpen(true))}
        />

        <Link href={paths.home} className={styles.logo} aria-label={tShell('shell.homeLink')}>
          <Logo size="header" />
        </Link>

        <PartnerTopNav />

        <div className={styles.right}>
          <div className={styles.actions}>
            <HeaderIconButton
              shape="square"
              className={styles.settings}
              icon={<LineIcon name="setting" />}
              label={ownerProfile ? tShell('shell.ownerProfile') : tShell('shell.account')}
              href={ROUTES.MANAGE.ACCOUNT}
            />
            <ChatMenu side={CHAT_SIDE.SHOP} shape="square" icon={<LineIcon name="message" />} />
            <NotificationBell
              context={ownerProfile ? 'owner' : 'manage'}
              shape="square"
              icon={<LineIcon name="notification" />}
            />
          </div>

          <span className={styles.divider} aria-hidden="true" />

          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: accountMenu }}>
            <button
              type="button"
              className={styles.profile}
              aria-label={`${tShell('shell.accountMenu')}: ${personName} · ${workspaceLine}`}
            >
              <span className={styles.avatarWrap}>
                <Avatar className={styles.avatar} size={40} src={user.avatarUrl ?? undefined}>
                  {initialOf(personName)}
                </Avatar>
                <span className={styles.online} aria-hidden="true" />
              </span>
              <span className={styles.identity}>
                <span className={styles.name} title={personName}>
                  {personName}
                </span>
                <span className={styles.workspace} title={workspaceLine}>
                  {workspaceLine}
                </span>
              </span>
              <LineIcon name="chevron-down" className={styles.caret} />
            </button>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
