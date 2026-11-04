'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './SegmentedTabs.module.css';

export interface SegmentedTabItem<T extends string> {
  value: T;
  label: string;
  /** Bỏ trống khi chưa tải — không vẽ "0" giả. */
  count?: number;
}

/**
 * Hàng tab dạng NHÓM NÚT GỘP có số đếm — Figma Partner-XePrime (thanh "Cần xử lý · Chờ khách hàng
 * thanh toán · Đã kết thúc" của màn Yêu cầu đặt xe, 02/11/2026): khung viền bo 12, tab đang chọn
 * nền trắng có viền, các tab khác chữ xám.
 *
 * Là tab thật (`role="tablist"`/`"tab"`, mũi tên trái/phải chuyển tab) chứ không phải một dãy nút:
 * nó đổi GÓC NHÌN của cùng một danh sách. Giá trị đang chọn sống ở URL, do nơi gọi giữ.
 */
export function SegmentedTabs<T extends string>({
  label,
  value,
  items,
  onChange,
  className,
}: {
  /** Tên khả truy cập của hàng tab. */
  label: string;
  value: T;
  items: readonly SegmentedTabItem<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const fmt = useAppFormat();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next]!.value);
  }

  return (
    <div role="tablist" aria-label={label} className={cx(styles.list, className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.selected)}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={styles.label}>{item.label}</span>
            {item.count === undefined ? null : (
              <span className={styles.count}>{fmt.count(item.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
