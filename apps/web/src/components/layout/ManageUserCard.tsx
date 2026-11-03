'use client';

import { UpOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, Tooltip } from 'antd';
import { useAccountIdentityLabel } from '@/features/account/hooks/use-account-identity-label';
import { workspaceAvatar } from '@/features/account/workspace-avatar';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/hooks/use-current-user';
import { initialOf } from '@/lib/initials';
import { useAccountMenuItems } from './use-account-menu';
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
 * gian hàng. Ngoại lệ duy nhất (06/10/2026): CHỦ xe tuyến hoa hồng — với họ người và trang chủ xe
 * là một, nên ảnh là ảnh của họ (tròn) theo đúng luật mặt tiền công khai (`workspaceAvatar`).
 *
 * Người đang đăng nhập KHÔNG biến mất — họ là dòng "Đăng nhập: …" trong menu, đúng chỗ cần
 * thiết khi nhiều nhân viên dùng chung một máy. Và KHÔNG có đường nào chép logo gian hàng sang
 * `users.avatar_url`: một tấm là mặt tiền cửa hàng, tấm kia là ảnh của một con người trên chợ.
 *
 * Chỉ hiện tên và nhãn vai trò — KHÔNG hiện email hay số điện thoại. Vỏ portal nằm trên mọi
 * trang, kể cả lúc chia sẻ màn hình.
 *
 * Menu là `useAccountMenuItems` — CÙNG bộ mục với khối hồ sơ ở header site partner và avatar ở
 * thanh trên site quản trị.
 */
export function ManageUserCard({ collapsed = false, tone = 'light' }: ManageUserCardProps) {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const menuItems = useAccountMenuItems();
  const identityLabel = useAccountIdentityLabel();

  if (!user) return null;

  const workspaceName = user.tenant?.name ?? (user.displayName || user.email || '—');
  /*
   * Nhãn danh tính đọc TUYẾN, không đọc bảng vai — xem `useAccountIdentityLabel`.
   *
   * Chủ xe cá nhân và chủ gian hàng cùng mang vai `shop_owner`, nên một `domainLabel('tenantRole')`
   * gọi cả hai là "Chủ gian hàng" — ngay cạnh viên nhãn ghi "Chủ xe cá nhân · Hoa hồng 10%".
   */
  const role = identityLabel(user);
  const dark = tone === 'dark';

  const avatar = (
    <Avatar className={styles.avatar} {...workspaceAvatar(user)}>
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
