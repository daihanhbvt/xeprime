'use client';

import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './StatusRail.module.css';

/** Sắc của chấm trạng thái — cùng bảng sắc với `ToneDotBadge`. */
export type StatusRailTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

export interface StatusRailItem<T extends string> {
  value: T;
  label: string;
  tone: StatusRailTone;
  /** Bỏ trống khi chưa tải — không vẽ "0" giả. */
  count?: number;
}

export interface StatusRailGroup<T extends string> {
  key: string;
  label: string;
  items: readonly StatusRailItem<T>[];
}

/**
 * Cột NGĂN TRẠNG THÁI bên trái một danh sách site partner — Figma Partner-XePrime "Vehicle Edit
 * Sidebar" của màn Đơn thuê xe (`23790:46261`, 02/11/2026): một mục đầu đứng riêng ("Tất cả"),
 * rồi các nhóm có tiêu đề chữ in nhỏ ("CẦN XỬ LÝ", "ĐÃ KẾT THÚC"); mỗi mục là chấm màu · nhãn · số
 * đếm, mục đang chọn nền xám.
 *
 * Khác `QueueRail` (site quản trị, có icon và tiêu đề cột) ở hình chứ không ở vai trò: đây là bộ
 * lọc trạng thái của MỘT danh sách, giá trị sống ở URL do nơi gọi giữ. Điện thoại: cả cột thành
 * một hàng cuộn ngang phía trên danh sách — chỉ CSS, cùng một cây DOM và thứ tự đọc.
 */
export function StatusRail<T extends string>({
  label,
  head,
  groups,
  value,
  onSelect,
}: {
  /** Tên khả truy cập của vùng điều hướng. */
  label: string;
  /** Mục đầu, không thuộc nhóm nào ("Tất cả"). */
  head?: StatusRailItem<T>;
  groups: readonly StatusRailGroup<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const fmt = useAppFormat();

  function renderItem(item: StatusRailItem<T>) {
    const active = item.value === value;
    return (
      <li key={item.value}>
        <button
          type="button"
          className={cx(styles.item, active && styles.active)}
          aria-current={active ? 'true' : undefined}
          onClick={() => onSelect(item.value)}
        >
          <span className={cx(styles.dot, styles[item.tone])} aria-hidden="true" />
          <span className={styles.label}>{item.label}</span>
          {item.count === undefined ? null : (
            <span className={styles.count}>{fmt.count(item.count)}</span>
          )}
        </button>
      </li>
    );
  }

  return (
    <nav className={styles.rail} aria-label={label}>
      {head ? <ul className={styles.items}>{renderItem(head)}</ul> : null}
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.key} className={styles.group}>
            <h2 className={styles.groupTitle}>{group.label}</h2>
            <ul className={styles.items}>{group.items.map(renderItem)}</ul>
          </div>
        ))}
    </nav>
  );
}
