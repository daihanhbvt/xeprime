import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './SettingRow.module.css';

/**
 * Hàng thiết lập của design partner ("Discount Toggle"): tiêu đề + mô tả bên trái, điều khiển (công
 * tắc, nhãn trạng thái) bên phải, các ô của thiết lập đó xếp ngay bên dưới.
 *
 * Chỉ là phần TRÌNH BÀY — công tắc do nơi gọi dựng (lưu ngay, hay nối RHF), nên nó tự mang
 * `aria-label`. Khác `SwitchRow` ở chỗ cả hàng KHÔNG phải một `<label>`: bên dưới còn ô nhập, bấm vào
 * khoảng trống không được lật công tắc.
 */
export function SettingRow({
  title,
  titleExtra,
  description,
  control,
  children,
  boxed = false,
  size = 'md',
  id,
  className,
}: {
  title: ReactNode;
  /** Ngay sau tiêu đề — icon ⓘ. */
  titleExtra?: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  /** Khung viền bo 12 (hàng đứng riêng trong thẻ); không khung khi hàng là đầu một khối. */
  boxed?: boolean;
  /** `lg`: tiêu đề 16px — hàng mở đầu một khối lớn ("Dịch vụ giao nhận xe tận nơi"). */
  size?: 'md' | 'lg';
  id?: string;
  className?: string;
}) {
  return (
    <div id={id} className={cx(styles.row, boxed && styles.boxed, className)}>
      <div className={styles.head}>
        <div className={styles.text}>
          <h3 className={cx(styles.title, size === 'lg' && styles.titleLg)}>
            {title}
            {titleExtra ? <span className={styles.extra}>{titleExtra}</span> : null}
          </h3>
          {description ? <div className={styles.description}>{description}</div> : null}
        </div>
        {control ? <div className={styles.control}>{control}</div> : null}
      </div>
      {children}
    </div>
  );
}
