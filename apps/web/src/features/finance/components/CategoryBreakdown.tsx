'use client';

import { Alert, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import {
  RECEIPT_STATUS,
  SYSTEM_FINANCE_CATEGORY_VALUES,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { receiptsPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import type { FinanceCategoryBreakdown, FinanceOverviewFilters } from '../types';
import styles from './CategoryBreakdown.module.css';

interface CategoryBreakdownProps {
  title: string;
  /** Chiều tiền của khối này — quyết định màu thanh và tham số của đường dẫn ra sổ. */
  type: string;
  tone: 'revenue' | 'cost';
  data: FinanceCategoryBreakdown | undefined;
  filters: FinanceOverviewFilters;
  loading: boolean;
  error: boolean;
}

/**
 * Cơ cấu doanh thu (hoặc chi phí) theo danh mục — thanh ngang, không phải bánh tròn.
 *
 * Vì sao thanh ngang: gian hàng có 18 danh mục hệ thống cộng danh mục riêng. Bánh tròn quá 5 lát
 * là không đọc được, còn thanh ngang xếp giảm dần đọc được ở mọi số lượng, mang được cả số tiền
 * lẫn tỷ trọng lẫn số phiếu trên cùng một dòng, và **bấm được từng dòng**.
 *
 * Màu ở đây KHÔNG mã hoá danh mục — mỗi dòng đã có tên chữ ngay bên trái, nên màu chỉ nói dòng
 * này thuộc chiều thu hay chiều chi. Đó cũng là lý do không cần một dải màu định danh dài: tô 18
 * danh mục bằng 18 màu là bắt người đọc tra bảng màu cho thứ đã ghi bằng chữ.
 */
export function CategoryBreakdown({
  title,
  type,
  tone,
  data,
  filters,
  loading,
  error,
}: CategoryBreakdownProps) {
  const t = useTranslations('Finance.overview.categories');
  const fmt = useAppFormat();

  /**
   * Nhãn của một dòng.
   *
   * Danh mục HỆ THỐNG có tên tiếng Việt nằm trong DB, nên bản tiếng Anh dịch từ `systemKey` —
   * mã là dữ liệu, chỉ nhãn mới dịch (ADR 0012). Danh mục riêng của gian hàng (`systemKey` rỗng)
   * giữ nguyên tên người dùng tự đặt: dịch tên do người dùng gõ là việc vô nghĩa. Phiếu chưa gán
   * danh mục có cả hai đều rỗng → một nhãn riêng, không phải một ô trắng.
   */
  const labelOf = (item: FinanceCategoryBreakdown['items'][number]): string => {
    const key = item.systemKey;
    if (key && isSystemCategoryKey(key)) return t(`system.${key}`);
    return item.name ?? t('uncategorized');
  };

  return (
    <section className={styles.block} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>

      {error && !data ? (
        <Alert type="warning" showIcon message={t('error')} />
      ) : loading && !data ? (
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState variant="empty" title={t('empty')} description={t('emptyHint')} />
      ) : (
        <ol className={styles.rows}>
          {data.items.map((item) => (
            <li key={item.categoryId ?? 'uncategorized'} className={styles.row}>
              <Link
                className={styles.link}
                href={receiptsPath.filtered({
                  type,
                  status: RECEIPT_STATUS.APPROVED,
                  categoryId: item.categoryId ?? undefined,
                  from: filters.from,
                  to: filters.to,
                })}
              >
                <span className={styles.name}>{labelOf(item)}</span>
                <span className={styles.amount}>{fmt.money(item.amount)}</span>
              </Link>
              {/* Chiều dài thanh chỉ biết lúc chạy → CSS custom property (ngoại lệ ADR 0003). */}
              <div
                className={styles.track}
                style={{ '--xp-bar-width': `${item.sharePercent}%` } as CSSProperties}
              >
                <div className={tone === 'revenue' ? styles.barRevenue : styles.barCost} />
              </div>
              <span className={styles.meta}>
                {t('share', { percent: item.sharePercent })} · {t('count', { count: item.count })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Khoá danh mục hệ thống có bản dịch riêng — mọi khoá khác rơi về tên trong DB. */
function isSystemCategoryKey(key: string): key is SystemFinanceCategoryKey {
  return (SYSTEM_FINANCE_CATEGORY_VALUES as readonly string[]).includes(key);
}
