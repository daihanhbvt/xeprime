'use client';

import { Select } from 'antd';

import { cx } from '@/lib/cx';

import styles from './SectionNav.module.css';

export interface SectionNavItem<K extends string> {
  key: K;
  label: string;
}

/**
 * Mục lục của một trang NHIỀU SECTION xếp dọc — trang Cửa hàng, trang Tài khoản & bảo mật.
 *
 * ## Một cây, hai hình dạng
 *
 * Desktop: cột trái 200–230px, DÍNH — trang cao hơn một màn hình, và một menu cuộn mất tăm là
 * menu chỉ dùng được ở đầu trang. Mobile: một ô chọn; tab ngang ở bề ngang đó hoặc tràn ra
 * ngoài, hoặc thành một vùng cuộn ngang mà không ai biết là cuộn được.
 *
 * ## Vì sao là ANCHOR chứ không phải tab
 *
 * Mọi section được dựng cùng lúc và xếp dọc ở cột phải; mục đang chọn chỉ quyết định *cuộn tới
 * đâu* và *mục nào sáng*. Nếu đây là tab thật (mỗi lần chọn thì unmount khối cũ), một form đang
 * sửa dở sẽ bị tháo ra và người dùng mất thay đổi chưa lưu chỉ vì bấm sang mục khác để xem.
 *
 * Mỗi mục là `<a href="#id">` chứ không phải `<button>`: đó là hành vi đúng của một mục lục
 * trong trang — mở tab mới được, copy link được, và bàn phím đi qua nó như mọi liên kết khác.
 * `onSelect` chỉ thêm việc ghi `?section=` vào URL để reload và nút Quay lại còn đúng chỗ.
 *
 * Generic theo khoá section; chữ (`title`, `ariaLabel`) do trang truyền vào từ namespace của nó.
 */
export function SectionNav<K extends string>({
  items,
  active,
  onSelect,
  domIdOf,
  title,
  ariaLabel,
}: {
  items: readonly SectionNavItem<K>[];
  active: K;
  onSelect: (section: K) => void;
  /** Id của khối section trong DOM — đích của anchor. */
  domIdOf: (section: K) => string;
  /** Dòng nhỏ viết hoa trên danh sách (desktop). */
  title: string;
  ariaLabel: string;
}) {
  return (
    <>
      <nav className={styles.rail} aria-label={ariaLabel}>
        <p className={styles.railTitle}>{title}</p>
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.key}>
              <a
                href={`#${domIdOf(item.key)}`}
                className={cx(styles.link, item.key === active && styles.linkActive)}
                aria-current={item.key === active ? 'true' : undefined}
                onClick={(event) => {
                  // Giữ phím tắt mở tab mới của trình duyệt — chỉ chặn cú bấm thường.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  onSelect(item.key);
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.mobile}>
        <Select<K>
          className={styles.select}
          aria-label={ariaLabel}
          value={active}
          onChange={onSelect}
          options={items.map((item) => ({ value: item.key, label: item.label }))}
        />
      </div>
    </>
  );
}
