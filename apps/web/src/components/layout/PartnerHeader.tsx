'use client';

import { MenuOutlined } from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CHAT_SIDE } from '@xeprime/types';
import { Logo } from '@/components/brand/Logo';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAccountIdentityLabel } from '@/features/account/hooks/use-account-identity-label';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useWorkspace } from '@/hooks/use-workspace';
import { initialOf } from '@/lib/initials';
import { useAppDispatch } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import { PartnerAccountMenu, partnerWorkspaceLine } from './PartnerAccountMenu';
import { PartnerTopNav } from './PartnerTopNav';
import styles from './PartnerHeader.module.css';

/**
 * Header site partner — Figma Partner-XePrime Header `23649:27690` (biến thể Default).
 *
 * Trái → phải: logo · menu ngang (`PartnerTopNav`) · hai nút (tin nhắn · thông báo) · vạch ngăn ·
 * ảnh đại diện mở menu hồ sơ. Dải breadcrumb (biến thể Details) là
 * `PartnerBreadcrumb`, đứng NGOÀI phần dính để không ăn thêm chiều cao khi cuộn.
 *
 * Quyết định đã chốt với người dùng (`docs/design/09_PARTNER_REDESIGN.md` §2.3):
 *  - nút bánh răng ĐÃ BỎ (09/11/2026) — "Tài khoản & bảo mật" là dòng đầu của menu hồ sơ;
 *  - lối vào hồ sơ CHỈ là ảnh đại diện, rê chuột là mở (09/11/2026). Tên người và "Gian hàng · Vai"
 *    (không phải email — header nằm trên mọi trang, kể cả lúc chia sẻ màn hình) ở thẻ đầu menu;
 *  - menu hồ sơ là `PartnerAccountMenu` (Figma `24051:85101`) — cùng bảng với thẻ người dùng ở
 *    drawer mobile.
 *
 * Dưới ranh vỏ 1024px menu ngang nhường chỗ cho nút mở drawer (`MobileNav` dựng drawer + thanh tab
 * dưới đáy từ CÙNG cây menu).
 */
export function PartnerHeader({ user }: { user: CurrentUser }) {
  const t = useTranslations('Navigation');
  const tShell = useTranslations('ManageCommon');
  const dispatch = useAppDispatch();
  const identityLabel = useAccountIdentityLabel();
  const { paths } = useWorkspace();
  const ownerProfile = isCommissionOwner(user);

  const personName = user.displayName || '—';
  const workspaceLine = partnerWorkspaceLine(user, identityLabel(user));

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
            <ChatMenu side={CHAT_SIDE.SHOP} shape="square" icon={<LineIcon name="message" />} />
            <NotificationBell
              context={ownerProfile ? 'owner' : 'manage'}
              shape="square"
              icon={<LineIcon name="notification" />}
            />
          </div>

          <span className={styles.divider} aria-hidden="true" />

          <PartnerAccountMenu user={user} openOnHover>
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
            </button>
          </PartnerAccountMenu>
        </div>
      </div>
    </header>
  );
}
