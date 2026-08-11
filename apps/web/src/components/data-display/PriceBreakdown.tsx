'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { PRICE_ROW } from '@xeprime/types';
import { formatMoneyVnd } from '@/lib/money';

import styles from './PriceBreakdown.module.css';

/** Một dòng breakdown — cùng shape với `PriceBreakdownRowDto` của API/snapshot. */
export interface PriceBreakdownRowInput {
  key: string;
  label: string;
  sublabel?: string | null;
  /** VND chuỗi; dòng giảm giá mang dấu âm ('-120000'). */
  amount: string;
}

interface PriceBreakdownProps {
  rows: PriceBreakdownRowInput[];
  /** Tổng khách trả TRƯỚC cọc. */
  totalAmount: string;
  totalLabel?: string;
  /** Cọc thế chấp — không nằm trong tổng; bỏ trống thì ẩn khối cọc. */
  depositAmount?: string | null;
  depositNote?: string;
  title?: string;
  /** Chip cạnh tiêu đề (tên xe, nguồn chính sách…). */
  badge?: ReactNode;
  /** Khối chú thích cuối (vd "Áp dụng chính sách riêng cho xe này"). */
  footer?: ReactNode;
}

/**
 * Bảng chi tiết giá dùng CHUNG (Figma `237:1988`) — drawer báo giá giao nhận, luồng đặt xe
 * marketplace và snapshot trên đơn đều dựng từ đây, không nơi nào tự vẽ lại hàng tiền.
 *
 * Component CHỈ hiển thị: mọi con số đến từ PricingService/snapshot (một nguồn tính giá),
 * không cộng trừ gì ở đây.
 */
export function PriceBreakdown({
  rows,
  totalAmount,
  totalLabel = 'Tổng trước cọc',
  depositAmount,
  depositNote = '* Tiền cọc được hoàn trả 100% khi bàn trả xe không phát sinh thiệt hại.',
  title = 'Chi tiết giá thuê',
  badge,
  footer,
}: PriceBreakdownProps) {
  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </header>

      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <dt className={styles.rowLabel}>
              <span className={row.key === PRICE_ROW.DISCOUNT ? styles.discountText : undefined}>
                {row.label}
              </span>
              {row.sublabel ? <span className={styles.sublabel}>{row.sublabel}</span> : null}
            </dt>
            <dd
              className={[
                styles.rowAmount,
                row.key === PRICE_ROW.DISCOUNT ? styles.discountText : '',
                row.amount === '0' ? styles.muted : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {formatMoneyVnd(row.amount)}
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.totalBlock}>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>{totalLabel}</span>
          <span className={styles.totalAmount}>{formatMoneyVnd(totalAmount)}</span>
        </div>

        {depositAmount != null ? (
          <>
            <div className={styles.depositRow}>
              <span className={styles.depositLabel}>
                Tiền đặt cọc thế chấp
                <Tooltip title="Cọc cố định bằng VND, không nằm trong tổng khách trả và không chịu giảm giá.">
                  <InfoCircleOutlined className={styles.depositInfo} />
                </Tooltip>
              </span>
              <span className={styles.depositAmount}>{formatMoneyVnd(depositAmount)}</span>
            </div>
            <p className={styles.depositNote}>{depositNote}</p>
          </>
        ) : null}
      </div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}
