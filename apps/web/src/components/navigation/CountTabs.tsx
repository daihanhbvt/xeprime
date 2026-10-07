'use client';

import { Tabs } from 'antd';

import { useAppFormat } from '@/i18n/use-app-format';

import styles from './CountTabs.module.css';

export interface CountTabItem<T extends string> {
  value: T;
  label: string;
  /** Không truyền (chưa tải) thì không vẽ ô đếm — không hiện "0" giả trong lúc chờ. */
  count?: number;
}

/**
 * Hàng tab GÓC NHÌN của một danh sách quản lý, mỗi tab mang số đếm từ CÙNG lần đọc với bảng
 * (UX §1.1 điều 2) — Duyệt xe (theo loại xe), Xe toàn hệ thống (theo trạng thái trên chợ).
 *
 * Là tab chứ không phải ô lọc: giá trị đang chọn sống ở URL, nhưng nó KHÔNG đếm vào "Lọc n" và
 * không bị giấu vào tấm lọc trên điện thoại — đổi góc nhìn là việc người dùng làm nhiều nhất.
 * Tab của AntD tự cuộn ngang có mũi tên khi không đủ chỗ.
 */
export function CountTabs<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  /** Không khớp tab nào (bộ lọc tay tạo ra một tổ hợp không có tên) thì không tab nào sáng. */
  value: T | null;
  items: readonly CountTabItem<T>[];
  onChange: (value: T) => void;
}) {
  const fmt = useAppFormat();
  return (
    <Tabs
      className={styles.tabs}
      aria-label={label}
      activeKey={value ?? ''}
      onChange={(key) => onChange(key as T)}
      items={items.map((item) => ({
        key: item.value,
        label: (
          <span className={styles.tabLabel}>
            {item.label}
            {item.count === undefined ? null : (
              <span className={styles.tabCount}>{fmt.count(item.count)}</span>
            )}
          </span>
        ),
      }))}
    />
  );
}
