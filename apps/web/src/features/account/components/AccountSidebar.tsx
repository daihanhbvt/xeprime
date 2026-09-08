'use client';

import { LogoutOutlined } from '@ant-design/icons';
import { Avatar } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import {
  flattenAccountNav,
  matchAccountNavKey,
  resolveAccountNav,
} from '@/constants/account-nav';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';

import styles from './AccountSidebar.module.css';

/**
 * Menu khu tài khoản.
 *
 * Nhận `user` từ vỏ thay vì tự gọi `useCurrentUser`: vỏ đã gác cửa và đã có người dùng, menu chỉ
 * SUY ra hình dạng của mình từ đó (`resolveAccountNav`) — chủ gian hàng thấy nhóm chủ xe,
 * người khác thấy menu cá nhân ngắn. Không có mục nào được render rồi mới hỏi quyền.
 *
 * Desktop: cột dọc bên trái, thẻ người dùng ở chân. Mobile: dải cuộn ngang ngay dưới header —
 * mười mục xếp dọc trên điện thoại đẩy nội dung thật xuống dưới màn hình đầu tiên, còn Drawer
 * thì giấu mất bản đồ mà cả menu này sinh ra để cho thấy. Một cây dữ liệu, hai cách bày bằng CSS.
 *
 * Thẻ người dùng chỉ hiện tên và NHÃN VAI (chủ gian hàng / nhân sự nền tảng / tài khoản XePrime)
 * — không hiện email hay số điện thoại, và không gắn nhãn gói kiểu "Premium": gói là dữ liệu
 * của `tenant.planCode`, không phải danh hiệu.
 */
export function AccountSidebar({ user }: { user: CurrentUser }) {
  const t = useTranslations('Navigation');
  const tAccount = useTranslations('Account');
  const domainLabel = useDomainLabel();
  const pathname = usePathname();
  const logout = useMarketLogout();

  const groups = useMemo(() => resolveAccountNav(user), [user]);
  const activeKey = matchAccountNavKey(pathname, flattenAccountNav(groups));

  const name = user.displayName || user.email || tAccount('profile.accountLabel');
  const roleKey = user.tenant?.roleKey;
  const role = roleKey
    ? domainLabel('tenantRole', roleKey, roleKey)
    : user.platformRole
      ? domainLabel('platformRole', user.platformRole, user.platformRole)
      : tAccount('profile.accountLabel');

  return (
    <nav className={styles.nav} aria-label={t('account.menuLabel')}>
      <div className={styles.groups}>
        {groups.map((group, index) => (
          <section
            key={group.key}
            className={cx(styles.group, index > 0 && styles.groupDivided)}
            aria-label={group.labelKey ? t(group.labelKey) : undefined}
          >
            {group.labelKey ? <h2 className={styles.groupTitle}>{t(group.labelKey)}</h2> : null}
            <ul className={styles.list}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeKey;

                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={cx(styles.item, active && styles.active)}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className={styles.icon} />
                      <span className={styles.label}>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* 'Đăng xuất' đã có ở `Navigation.public` (header marketplace dùng chung chuỗi này) —
            chép sang bó của tính năng là tạo bản dịch thứ hai cho cùng một từ. */}
        <button type="button" className={styles.logout} onClick={() => void logout()}>
          <LogoutOutlined className={styles.icon} />
          <span className={styles.label}>{t('public.logout')}</span>
        </button>
      </div>

      <div className={styles.userCard} aria-label={tAccount('sidebar.userCard')}>
        <Avatar size={40} src={user.avatarUrl ?? undefined} className={styles.avatar}>
          {initialOf(user.displayName || user.email)}
        </Avatar>
        <div className={styles.userText}>
          <span className={styles.userName} title={name}>
            {name}
          </span>
          <span className={styles.userRole} title={role}>
            {role}
          </span>
        </div>
      </div>
    </nav>
  );
}
