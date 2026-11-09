'use client';

import { Avatar, Badge, Dropdown } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { ROUTES } from '@/constants/routes';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import styles from './MarketAccountMenu.module.css';

/**
 * Menu tài khoản của site khách - avatar trên thanh + bảng thả xuống, dựng lại 26/10/2026 theo
 * Figma "Homepage - Dropdown" (`20063:57521`).
 *
 * ## Bố cục
 *
 *   ┌ thẻ danh tính (avatar · tên · email/SĐT · ›) - bấm vào là hồ sơ ┐
 *   │ Chuyến của tôi · Xe yêu thích · Tin nhắn · Giao diện [☀|☾]     │  ← mặt trắng
 *   │ Trở thành chủ xe →                                               │
 *   └──────────────────────────────────────────────────────────────────┘
 *     Ngôn ngữ [VI|EN] · Đăng xuất                                      ← chân menu, nền xám
 *
 * Dòng "Tài khoản của tôi" của bản trước đã GỘP vào thẻ danh tính: hai lối cùng tới `/account`
 * đặt sát nhau là một lối thừa.
 *
 * Vỏ, dòng, nút gạt và đăng xuất là khuôn chung với menu hồ sơ site partner
 * (`components/account-menu/AccountMenuParts` - vì sao không dùng `menu.items` của AntD cũng ghi
 * ở đó).
 */
export function MarketAccountMenu({
  user,
  chat,
  onLogout,
}: {
  user: CurrentUser;
  /** Đích hộp thư + số chưa đọc, lấy từ `useChatBadge` - cùng con số với biểu tượng trên thanh. */
  chat: { href: string; count: number };
  onLogout: () => void;
}) {
  const t = useTranslations('Navigation.public');
  const tAccount = useTranslations('Navigation.account');
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Email phân biệt hai tài khoản trùng tên (khách ↔ đối tác, ADR 0053); thiếu email thì SĐT.
  const contact = user.email ?? user.phone ?? t('accountSubtitle');

  const panel = (
    <AccountMenuPanel
      label={tAccount('menuLabel')}
      footer={
        <>
          <AccountMenuLocaleRow />
          <AccountMenuLogout
            label={t('logout')}
            onClick={() => {
              close();
              onLogout();
            }}
          />
        </>
      }
    >
      <AccountMenuSection>
        <AccountMenuItem>
          <Link href={ROUTES.ACCOUNT.ROOT} className={styles.identity} onClick={close}>
            <Avatar size={40} src={user.avatarUrl ?? undefined} className={styles.avatar}>
              {initialOf(user.displayName)}
            </Avatar>
            <span className={styles.identityText}>
              <span className={styles.identityName}>{user.displayName}</span>
              <span className={styles.identityContact}>{contact}</span>
            </span>
            <LineIcon name="chevron-right" className={styles.identityIcon} />
          </Link>
        </AccountMenuItem>

        <AccountMenuLink href={ROUTES.TRIPS} icon="calendar" label={t('trips')} onNavigate={close} />
        <AccountMenuLink
          href={ROUTES.ACCOUNT.FAVORITES}
          icon="heart"
          label={t('favorites')}
          onNavigate={close}
        />
        <AccountMenuLink
          href={chat.href}
          icon="message"
          label={t('chat')}
          onNavigate={close}
          trailing={
            chat.count ? <Badge count={chat.count} overflowCount={99} size="small" /> : null
          }
        />
        <AccountMenuThemeRow />
      </AccountMenuSection>

      <AccountMenuSection divider>
        {/*
          Lối sang SITE PARTNER (ADR 0051 điều 3) - đăng ký cho thuê xe là một tài khoản riêng ở
          đó (ADR 0053). Link khác site: URL tuyệt đối ở chế độ `host`.
        */}
        <AccountMenuLink
          href={resolveOwnerCtaHref()}
          icon="work"
          label={t('becomeOwner')}
          onNavigate={close}
          trailing={<AccountMenuArrow />}
        />
      </AccountMenuSection>
    </AccountMenuPanel>
  );

  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      popupRender={() => panel}
    >
      <span
        className={cx(styles.trigger, open && styles.triggerOpen)}
        role="button"
        tabIndex={0}
        aria-label={t('account')}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        <Avatar className={styles.triggerAvatar} size={32} src={user.avatarUrl ?? undefined}>
          {initialOf(user.displayName)}
        </Avatar>
        <LineIcon name="caret-up" className={styles.caret} />
      </span>
    </Dropdown>
  );
}
