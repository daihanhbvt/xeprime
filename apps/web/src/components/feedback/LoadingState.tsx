'use client';

import { Skeleton, Spin } from 'antd';

import styles from './LoadingState.module.css';
import { useTranslations } from 'next-intl';

/**
 * Figma `134:2011` (12.36) R1–R2 chia đôi rất rõ:
 *  - **biết trước bố cục** (bảng, danh sách thẻ, trang chi tiết, drawer) → **skeleton**
 *  - **chưa biết bố cục** (tải trang lần đầu) → **spinner**
 *
 * Nên `variant` ở đây mô tả *cái đang được tải*, không phải *hình thức chờ* — chọn skeleton hay
 * spinner là việc của component, không phải của người gọi.
 */
export type LoadingVariant = 'page' | 'table' | 'cards' | 'inline';

interface LoadingStateProps {
  variant?: LoadingVariant;
  /**
   * Câu mô tả cho trình đọc màn hình. Figma R7 muốn cụ thể ("Đang tải danh sách xe…") thay vì
   * chung chung, nên đây là chỗ feature nói rõ mình đang tải gì.
   */
  label?: string;
  /** Số dòng/thẻ giả — nên xấp xỉ số dòng thật để không nhảy bố cục (R3). */
  rows?: number;
}

const DEFAULT_ROWS = 5;

/**
 * Trạng thái đang tải dùng chung.
 *
 * A11y: bọc `role="status"` + `aria-busy` và một nhãn chỉ-đọc-bằng-trình-đọc-màn-hình. `Spin` và
 * `Skeleton` của AntD không tự phát ra thông báo nào, nên nếu không có lớp này thì người dùng
 * trình đọc màn hình chỉ gặp một vùng im lặng.
 */
export function LoadingState({
  variant = 'page',
  label,
  rows = DEFAULT_ROWS,
}: LoadingStateProps) {
  const tCommon = useTranslations('Common');
  const labelText = label ?? tCommon('states.loading');
  return (
    <div className={styles.root} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>{labelText}</span>

      {variant === 'page' ? (
        <div className={styles.page}>
          <Spin size="large" />
        </div>
      ) : null}

      {variant === 'inline' ? <Spin size="small" /> : null}

      {variant === 'table' ? (
        <div className={styles.table}>
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton
              key={index}
              active
              title={false}
              paragraph={{ rows: 1, width: '100%' }}
              className={styles.row}
            />
          ))}
        </div>
      ) : null}

      {variant === 'cards' ? (
        <div className={styles.cards}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className={styles.card}>
              <Skeleton active avatar title={{ width: '60%' }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
