'use client';

import {
  AppstoreOutlined,
  CarOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  SettingOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

import { cx } from '@/lib/cx';

import { EDIT_MENU, EDIT_MENU_GROUPS, type EditMenuKey } from '../vehicle-edit-nav';
import styles from './VehicleEditShell.module.css';

const ICON: Readonly<Record<EditMenuKey, ComponentType>> = {
  [EDIT_MENU.INFORMATION]: CarOutlined,
  [EDIT_MENU.MEDIA]: PictureOutlined,
  [EDIT_MENU.DOCUMENTS]: FileTextOutlined,
  [EDIT_MENU.TRIP_HISTORY]: HistoryOutlined,
  [EDIT_MENU.SERVICES]: AppstoreOutlined,
  [EDIT_MENU.CONDITIONS]: InfoCircleOutlined,
  [EDIT_MENU.HANDOVER]: SwapOutlined,
  [EDIT_MENU.MAINTENANCE]: SettingOutlined,
  [EDIT_MENU.SOURCE]: WalletOutlined,
};

export interface EditMenuBadge {
  text: string;
  /** Còn thiếu thứ cần để lên chợ — nền cảnh báo. */
  warn?: boolean;
  /** Đọc cho trình đọc màn hình thay cho chữ rút gọn ("1 thiếu", "2/3"). */
  label: string;
}

/**
 * Menu trái màn sửa xe — ba nhóm (design `23731:37932`).
 *
 * Mục là NÚT chứ không phải `Link`: đổi mục phải đi qua `onSelect`, nơi màn sửa hỏi "bỏ thay đổi
 * chưa lưu?" khi form đang dở. Một `<Link>` sẽ rời trang trước khi ai kịp hỏi.
 */
export function VehicleEditMenu({
  active,
  enabled,
  badges,
  onSelect,
}: {
  active: EditMenuKey;
  /** Mục có mặt với người này không — quyền ∧ cờ gói ∧ tuyến ∧ phiên hỗ trợ. */
  enabled: (key: EditMenuKey) => boolean;
  badges?: Partial<Record<EditMenuKey, EditMenuBadge>>;
  onSelect: (key: EditMenuKey) => void;
}) {
  const t = useTranslations('Vehicles.editor.menu');

  return (
    <nav className={styles.menu} aria-label={t('label')}>
      {EDIT_MENU_GROUPS.map((group) => {
        const items = group.items.filter(enabled);
        if (items.length === 0) return null;
        const labelId = `vehicle-edit-menu-${group.key}`;
        return (
          <div key={group.key} className={styles.menuGroup}>
            <p id={labelId} className={styles.menuGroupLabel}>
              {t(`groups.${group.key}`)}
            </p>
            <ul className={styles.menuList} aria-labelledby={labelId}>
              {items.map((key) => {
                const Icon = ICON[key];
                const badge = badges?.[key];
                const current = key === active;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={cx(styles.menuItem, current && styles.menuItemActive)}
                      aria-current={current ? 'page' : undefined}
                      onClick={() => onSelect(key)}
                    >
                      <span className={styles.menuIcon} aria-hidden="true">
                        <Icon />
                      </span>
                      <span className={styles.menuLabel}>{t(`items.${key}`)}</span>
                      {badge ? (
                        <span
                          className={cx(styles.menuBadge, badge.warn && styles.menuBadgeWarn)}
                          aria-label={badge.label}
                        >
                          {badge.text}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
