'use client';

import type { ComponentType } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';

import styles from './QueueRail.module.css';

export interface QueueRailItem<T extends string> {
  value: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Số việc đang chờ trong hàng đợi — `null`/bỏ trống khi chưa tải (không vẽ "0" giả). */
  count?: number | null;
}

export interface QueueRailGroup<T extends string> {
  key: string;
  label: string;
  items: readonly QueueRailItem<T>[];
}

/**
 * Cột HÀNG ĐỢI bên trái một màn làm việc nhiều hàng đợi (Tài chính, Vận hành chuyến) — nhóm theo
 * nghiệp vụ của màn đó. Ở mobile nó thành một hàng nút cuộn ngang phía trên nội dung (chỉ CSS —
 * cùng một cây DOM, cùng thứ tự đọc).
 *
 * Mỗi mục là một nút chuyển hàng đợi, mang `aria-current` khi đang chọn. Nơi gọi chỉ truyền những
 * hàng đợi người dùng CÓ QUYỀN thấy — không có mục nào hiện ra rồi báo 403. Nhóm rỗng (mọi hàng đợi
 * trong nhóm bị ẩn) không vẽ tiêu đề nhóm.
 */
export function QueueRail<T extends string>({
  title,
  label,
  groups,
  active,
  onSelect,
}: {
  /** Tiêu đề cột ("Hàng đợi"). */
  title: string;
  /** Tên khả truy cập của vùng điều hướng ("Chọn hàng đợi"). */
  label: string;
  groups: readonly QueueRailGroup<T>[];
  active: T | null;
  onSelect: (value: T) => void;
}) {
  const fmt = useAppFormat();
  const visible = groups.filter((group) => group.items.length > 0);

  return (
    <nav className={styles.rail} aria-label={label}>
      <h2 className={styles.title}>{title}</h2>
      {visible.map((group) => (
        <div key={group.key} className={styles.group}>
          <h3 className={styles.groupTitle}>{group.label}</h3>
          <ul className={styles.items}>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.value === active;
              const count = item.count ?? null;
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    className={cx(styles.item, isActive && styles.itemActive)}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => onSelect(item.value)}
                  >
                    <Icon className={styles.icon} />
                    <span className={styles.label}>{item.label}</span>
                    {count !== null ? (
                      <span className={cx(styles.count, count > 0 && styles.countActive)}>
                        {fmt.count(count)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
