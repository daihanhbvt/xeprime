'use client';

import { LogoutOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ACCOUNT_NAV, matchAccountNavKey } from '@/constants/account-nav';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';

import styles from './AccountSidebar.module.css';

/**
 * Menu khu tài khoản.
 *
 * Desktop: cột dọc bên trái. Mobile: dải cuộn ngang ngay dưới tiêu đề — 9 mục xếp dọc trên
 * điện thoại đẩy nội dung thật xuống dưới màn hình đầu tiên, còn Drawer thì giấu mất bản đồ mà
 * cả menu này sinh ra để cho thấy. Một cây dữ liệu (`ACCOUNT_NAV`), hai cách trình bày bằng CSS.
 *
 * Mục `comingSoon` render thành `<span>` chứ KHÔNG phải `<Link>` mờ đi: một liên kết vẫn bấm
 * được, vẫn focus được bằng bàn phím và vẫn dẫn tới trang trống. Không có link thì không có
 * đường tới đó — đúng ý nghĩa "chưa mở".
 */
export function AccountSidebar() {
  const t = useTranslations('Navigation.account');
  const tAccount = useTranslations('Account');
  // 'Đăng xuất' đã có ở `Navigation.public` (header marketplace dùng chung chuỗi này) —
  // chép sang bó của tính năng là tạo bản dịch thứ hai cho cùng một từ.
  const tPublic = useTranslations('Navigation.public');
  const pathname = usePathname();
  const logout = useMarketLogout();
  const activeKey = matchAccountNavKey(pathname);

  return (
    <nav className={styles.nav} aria-label={t('menuLabel')}>
      <ul className={styles.list}>
        {ACCOUNT_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          const label = t(item.labelKey);

          if (item.comingSoon) {
            return (
              <li key={item.key}>
                <span className={`${styles.item} ${styles.disabled}`} aria-disabled="true">
                  <Icon className={styles.icon} />
                  <span className={styles.label}>{label}</span>
                  <Tag className={styles.soonTag} bordered={false}>
                    {tAccount('comingSoon.badge')}
                  </Tag>
                </span>
              </li>
            );
          }

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`${styles.item} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={styles.icon} />
                <span className={styles.label}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <button type="button" className={styles.logout} onClick={() => void logout()}>
        <LogoutOutlined className={styles.icon} />
        <span className={styles.label}>{tPublic('logout')}</span>
      </button>
    </nav>
  );
}
