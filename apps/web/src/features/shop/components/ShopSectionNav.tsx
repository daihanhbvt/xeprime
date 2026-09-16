'use client';

import { Select } from 'antd';
import { useTranslations } from 'next-intl';

import { shopSectionDomId, type ShopSection } from '@/constants/routes';
import { cx } from '@/lib/cx';

import styles from './ShopSectionNav.module.css';

export interface ShopSectionItem {
  key: ShopSection;
  label: string;
}

/**
 * Điều hướng giữa năm section của trang Cửa hàng.
 *
 * ## Một cây, hai hình dạng
 *
 * Desktop: cột trái 200–230px, DÍNH — trang cao hơn một màn hình, và một menu cuộn mất tăm là
 * menu chỉ dùng được ở đầu trang. Mobile: một ô chọn; tab ngang ở bề ngang đó hoặc tràn ra
 * ngoài, hoặc thành một vùng cuộn ngang mà không ai biết là cuộn được.
 *
 * ## Vì sao là ANCHOR chứ không phải tab
 *
 * Cả năm section được dựng cùng lúc và xếp dọc ở cột phải; mục đang chọn chỉ quyết định *cuộn
 * tới đâu* và *mục nào sáng*. Nếu đây là tab thật (mỗi lần chọn thì unmount khối cũ), form hồ sơ
 * sẽ bị tháo ra và người dùng mất thay đổi chưa lưu chỉ vì bấm sang "Gói & hạn mức" để xem hạn.
 *
 * Mỗi mục là `<a href="#id">` chứ không phải `<button>`: đó là hành vi đúng của một mục lục
 * trong trang — mở tab mới được, copy link được, và bàn phím đi qua nó như mọi liên kết khác.
 * `onSelect` chỉ thêm việc ghi `?section=` vào URL để reload và nút Quay lại còn đúng chỗ.
 */
export function ShopSectionNav({
  items,
  active,
  onSelect,
}: {
  items: readonly ShopSectionItem[];
  active: ShopSection;
  onSelect: (section: ShopSection) => void;
}) {
  const t = useTranslations('Shop.sections');

  return (
    <>
      <nav className={styles.rail} aria-label={t('navLabel')}>
        <p className={styles.railTitle}>{t('navTitle')}</p>
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.key}>
              <a
                href={`#${shopSectionDomId(item.key)}`}
                className={cx(styles.link, item.key === active && styles.linkActive)}
                aria-current={item.key === active ? 'true' : undefined}
                onClick={(event) => {
                  // Giữ phím tắt mở tab mới của trình duyệt — chỉ chặn cú bấm thường.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
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
        <Select<ShopSection>
          className={styles.select}
          aria-label={t('navLabel')}
          value={active}
          onChange={onSelect}
          options={items.map((item) => ({ value: item.key, label: item.label }))}
        />
      </div>
    </>
  );
}
