'use client';

import {
  DownOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { ROUTES } from '@/constants/routes';
import { BranchScopeSelector } from '@/features/branches/components/BranchScopeSelector';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { CHAT_SIDE } from '@xeprime/types';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { initialOf } from '@/lib/initials';
import { useAppDispatch } from '@/store/hooks';
import { setMobileNavOpen } from '@/store/slices/app.slice';
import type { CurrentUser } from '@/hooks/use-current-user';
import { ManageBreadcrumb } from './ManageBreadcrumb';
import styles from './Topbar.module.css';

/**
 * Thanh trên của cổng quản lý — Figma Foundations `14:1498` (cao 56px, nền sáng).
 *
 * Bố cục theo Figma: **trái** là ngữ cảnh trang (breadcrumb `14:1499`), **phải** là chuông/chat
 * rồi tới ngữ cảnh gian hàng (`14:1519`).
 *
 * Hai thứ trong Figma KHÔNG dựng ở đây, có lý do:
 *  - ô tìm kiếm `⌘K` (`14:1504`): chưa có API tìm kiếm nào — dựng ra là một điều khiển chết;
 *  - nút thu gọn sidebar: Figma đặt nó trong khối brand của sidebar (`47:12`/`47:82`), không
 *    phải trên topbar. Thêm bản thứ hai ở đây là nhân đôi điều khiển cho cùng một việc.
 *
 * ## MỘT hình đại diện, và nó là logo gian hàng (16/09/2026)
 *
 * Trước đợt này góc phải có HAI hình đứng cạnh nhau: một ô chữ cái đầu của tên gian hàng, rồi
 * ngay bên phải là avatar CÁ NHÂN mở menu. Hai hình đại diện cho hai thứ khác nhau, cách nhau
 * 8px, và không cái nào tự nói mình là cái gì. Nay còn một: logo gian hàng (`tenant.logoUrl`,
 * đi kèm `/auth/me` nên có ngay ở lần vẽ đầu), và chính nó là nút mở menu — tên gian hàng đứng
 * cạnh nó, còn tên người đang đăng nhập nằm trong menu.
 *
 * Menu ở đây dùng CÙNG bộ mục với `ManageUserCard` ở chân sidebar, cố ý: hai lối vào cho một
 * menu, không phải hai menu khác nhau tuỳ chỗ bấm.
 */
export function Topbar({ user }: { user: CurrentUser }) {
  const t = useTranslations('Navigation');
  const tManage = useTranslations('ManageCommon');
  const dispatch = useAppDispatch();
  const logout = usePortalLogout();
  const localeGroup = useLocaleMenuGroup();

  const tenantName = user.tenant?.name;
  /** Nhân sự nền tảng không đứng trong gian hàng nào — khi đó danh tính khu làm việc là họ. */
  const workspaceName = tenantName ?? user.displayName;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Button
          type="text"
          className={styles.hamburger}
          icon={<MenuOutlined />}
          aria-label={t('manage.openMenu')}
          onClick={() => dispatch(setMobileNavOpen(true))}
        />
        <ManageBreadcrumb />
      </div>

      <div className={styles.right}>
        <ChatMenu side={CHAT_SIDE.SHOP} />
        <NotificationBell context="manage" />

        {tenantName ? (
          <>
            <span className={styles.divider} aria-hidden />
            {/*
              Bộ chọn CHI NHÁNH: từ wave chi nhánh nó có hành vi thật (thu hẹp danh sách xe/đơn/
              yêu cầu thuê/lịch theo chi nhánh), nên không còn là điều khiển chết. Tự ẩn khi gian
              hàng chỉ có một chi nhánh hoặc người dùng không có `branches.view`.

              Chỉ hiện trong ngữ cảnh GIAN HÀNG: admin nền tảng không đứng trong tenant nào thì
              `tenantName` rỗng và cả khối này không render.
            */}
            <BranchScopeSelector />
          </>
        ) : null}

        {/*
          Đổi ngôn ngữ nằm trong menu tài khoản, giống hệt header khu khách — thanh trên cùng chỉ
          giữ những thứ bấm hằng ngày, còn cài đặt cá nhân đi cùng một chỗ với chúng.
        */}
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'identity',
                label: (
                  <span className={styles.menuIdentity}>
                    <span className={styles.menuShop}>{workspaceName}</span>
                    <span className={styles.menuUser}>
                      {tManage('shell.signedInAs', { name: user.displayName })}
                    </span>
                  </span>
                ),
                disabled: true,
              },
              { type: 'divider' },
              {
                key: 'security',
                icon: <LockOutlined aria-hidden />,
                label: <Link href={ROUTES.MANAGE.SECURITY}>{tManage('shell.security')}</Link>,
              },
              ...(tenantName
                ? [
                    {
                      key: 'shop',
                      icon: <ShopOutlined aria-hidden />,
                      label: (
                        <Link href={ROUTES.MANAGE.SHOP}>{tManage('shell.shopSettings')}</Link>
                      ),
                    },
                  ]
                : []),
              { type: 'divider' },
              localeGroup,
              { type: 'divider' },
              {
                key: 'logout',
                icon: <LogoutOutlined aria-hidden />,
                label: t('public.logout'),
                onClick: () => void logout(),
              },
            ],
          }}
        >
          <button type="button" className={styles.avatarButton} aria-label={t('public.account')}>
            {/*
              Logo GIAN HÀNG, fallback là chữ cái đầu của TÊN GIAN HÀNG. Vuông bo góc chứ không
              tròn: tròn là quy ước của ảnh một con người, còn ở đây danh tính là của cửa hàng.
            */}
            <Avatar
              className={styles.avatar}
              shape="square"
              src={user.tenant?.logoUrl ?? undefined}
            >
              {initialOf(workspaceName)}
            </Avatar>
            <span className={styles.workspaceName} title={workspaceName}>
              {workspaceName}
            </span>
            <DownOutlined className={styles.avatarCaret} aria-hidden />
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
