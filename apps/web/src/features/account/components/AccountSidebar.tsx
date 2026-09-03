'use client';

import { LogoutOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ACCOUNT_NAV, matchAccountNavKey } from '@/constants/account-nav';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';

import styles from './AccountSidebar.module.css';

const NAV_GROUPS = [
  { key: 'personal', labelKey: 'sidebar.personal', itemKeys: ['profile'] },
  { key: 'rental', labelKey: 'sidebar.rental', itemKeys: ['trips'] },
  { key: 'preferences', labelKey: 'sidebar.preferences', itemKeys: ['support'] },
] as const;

const itemsOfGroup = (itemKeys: readonly string[]) =>
  ACCOUNT_NAV.filter((item) => itemKeys.includes(item.key));

/**
 * Khối còn ít nhất một mục.
 *
 * Tính ở NGOÀI component: `ACCOUNT_NAV` và `NAV_GROUPS` đều là hằng module, nên đây là một
 * phép lọc chạy đúng một lần lúc nạp — không phải việc của mỗi lần render.
 */
const visibleGroups = NAV_GROUPS.filter((group) => itemsOfGroup(group.itemKeys).length > 0);

/**
 * Menu khu tài khoản.
 *
 * Desktop: cột dọc bên trái. Mobile: dải cuộn ngang ngay dưới tiêu đề — 9 mục xếp dọc trên
 * điện thoại đẩy nội dung thật xuống dưới màn hình đầu tiên, còn Drawer thì giấu mất bản đồ mà
 * cả menu này sinh ra để cho thấy. Một cây dữ liệu (`ACCOUNT_NAV`), hai cách trình bày bằng CSS.
 *
 * Menu chỉ liệt kê mục CÓ LUỒNG THẬT (gap analysis §7). Bảy mục "Sắp có" trước đây đã được gỡ
 * ngày 03/09/2026: một bản đồ đầy đủ nhưng bảy phần chín là chỗ trống thì không phải bản đồ, nó
 * là bảy lời hứa. Route của chúng vẫn còn cho link đã lỡ phát ra ngoài; chỉ menu là im.
 *
 * Khối rỗng bị LOẠI chứ không render tiêu đề trống — mỗi đợt mở tính năng lại đổi số mục trong
 * một khối, và một tiêu đề không có mục nào dưới nó trông như lỗi tải.
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
      <div className={styles.groups}>
        {visibleGroups.map((group) => (
          <section key={group.key} className={styles.group} aria-label={tAccount(group.labelKey)}>
            <h2 className={styles.groupTitle}>{tAccount(group.labelKey)}</h2>
            <ul className={styles.list}>
              {itemsOfGroup(group.itemKeys).map((item) => {
                const Icon = item.icon;
                const active = item.key === activeKey;
                const label = t(item.labelKey);

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
          </section>
        ))}
      </div>

      <button type="button" className={styles.logout} onClick={() => void logout()}>
        <LogoutOutlined className={styles.icon} />
        <span className={styles.label}>{tPublic('logout')}</span>
      </button>
    </nav>
  );
}
