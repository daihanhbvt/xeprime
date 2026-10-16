'use client';

import { useRef, type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import styles from './SegmentedTabs.module.css';

export interface SegmentedTabItem<T extends string> {
  value: T;
  label: string;
  /** Icon trang trí — luôn `aria-hidden`, nhãn chữ mới là tên khả truy cập. */
  icon?: ReactNode;
  /**
   * Nhãn cho màn hẹp; rơi về `label` nếu không có. Chỉ MỘT nhãn được render tại một thời điểm —
   * dựng cả hai rồi ẩn bằng CSS sẽ khiến tên khả truy cập của nút là hai nhãn dính liền nhau.
   */
  shortLabel?: string;
}

interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  items: ReadonlyArray<SegmentedTabItem<T>>;
  /** Tên khả truy cập của cả nhóm — bắt buộc: một tablist không tên là một nhóm nút vô danh. */
  ariaLabel: string;
  /** `id` của vùng form mà nhóm này điều khiển (`aria-controls`) — chỉ có nghĩa với `tabs`. */
  controls?: string;
  /**
   * Ngữ nghĩa:
   *   · `tabs` (mặc định) — `tablist`/`tab`, khi nhóm đổi vùng form bên dưới;
   *   · `radio` — `radiogroup`/`radio`, khi nhóm là một LỰA CHỌN nằm ngay trong vùng form đó
   *     (Ô tô · Xe máy trong hàng ô nhập). Một tab không được nằm trong chính tabpanel nó điều khiển.
   * Bàn phím giống nhau ở cả hai: một điểm dừng Tab, mũi tên để đổi.
   */
  semantics?: 'tabs' | 'radio';
  /** `md` cho hero, `sm` cho panel thu gọn. */
  size?: 'md' | 'sm';
  /**
   * Hình dạng (design v2 — ADR 0062):
   *   · `pill` (mặc định) — rãnh chìm + viên nổi, dùng trong panel thu gọn;
   *   · `tabs` — dải TAB của thẻ tìm kiếm trang chủ (Thuê xe tự lái · Xe có tài xế · Dài hạn);
   *   · `segment` — nhóm nút "Loại xe" trong hàng ô nhập (Ô tô · Xe máy).
   * Chỉ là hình — hành vi bàn phím và ngữ nghĩa tab giữ nguyên ở cả ba.
   */
  appearance?: 'pill' | 'tabs' | 'segment';
  className?: string;
}

/**
 * Bộ chọn phân đoạn dùng cho CẢ hai tầng của thẻ tìm kiếm: loại xe (ô tô / xe máy) và dịch vụ
 * (tự lái / có tài xế / dài hạn). Một component, hai tầng — nên chúng không thể trôi ra hai
 * kiểu tương tác khác nhau.
 *
 * Vì sao tự dựng thay vì `Segmented` của AntD: cần ngữ nghĩa `tablist`/`tab` với `aria-selected`
 * + `aria-controls` trỏ vào đúng vùng form đang hiện, và cần roving tabindex (một điểm dừng Tab
 * cho cả nhóm, mũi tên để đi trong nhóm) — đúng bộ hành vi mà `Segmented` không cấp.
 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  controls,
  semantics = 'tabs',
  size = 'md',
  appearance = 'pill',
  className,
}: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isRadio = semantics === 'radio';
  const itemRole = isRadio ? 'radio' : 'tab';

  /** Mũi tên đi trong nhóm (cuộn vòng), Home/End về hai đầu — hành vi tab chuẩn WAI-ARIA. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((item) => item.value === value);
    if (current < 0) return;

    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (current + 1) % items.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === null) return;

    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    // Focus đi theo lựa chọn, nếu không người dùng bàn phím mất dấu mình đang ở đâu.
    listRef.current?.querySelectorAll<HTMLButtonElement>(`[role="${itemRole}"]`)[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role={isRadio ? 'radiogroup' : 'tablist'}
      aria-label={ariaLabel}
      className={cx(
        styles.list,
        size === 'sm' && styles.listSm,
        appearance === 'tabs' && styles.listTabs,
        appearance === 'segment' && styles.listSegment,
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role={itemRole}
            aria-selected={isRadio ? undefined : selected}
            aria-checked={isRadio ? selected : undefined}
            aria-controls={isRadio ? undefined : controls}
            // Roving tabindex: cả nhóm là MỘT điểm dừng Tab, đi trong nhóm bằng mũi tên.
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.tabActive)}
            onClick={() => onChange(item.value)}
          >
            {/* Một khối bọc icon + nhãn: gạch chân của dạng `tabs` chạy liền dưới cả hai. */}
            <span className={styles.tabInner}>
              {item.icon ? (
                <span className={styles.icon} aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className={styles.label}>
                {isMobile && item.shortLabel ? item.shortLabel : item.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
