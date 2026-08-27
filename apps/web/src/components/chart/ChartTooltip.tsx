'use client';

import type { CSSProperties } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './ChartTooltip.module.css';

/**
 * Một dòng trong tooltip. `raw` là số tiền CHUỖI gốc từ API — tooltip in nó qua `fmt.money()`,
 * không in lại con số đã quy đổi để vẽ (`chart-data.ts`). Nếu in con số vẽ, tooltip sẽ hiện
 * "12750000" trong khi thẻ ngay trên hiện "12.750.000 ₫" cho cùng một khoản.
 */
export interface TooltipRow {
  key: string;
  label: string;
  color: string;
  raw: string;
}

interface ChartTooltipProps {
  title: string;
  rows: readonly TooltipRow[];
}

/**
 * Tooltip dùng chung cho mọi biểu đồ tài chính.
 *
 * Chấm màu đứng cạnh NHÃN CHỮ, và chữ mang màu mực bình thường: màu là thứ nối dòng này với
 * cột trên hình, không phải thứ mang nghĩa. Tô cả dòng bằng màu series là bắt người đọc giải mã
 * bảng màu để đọc một con số.
 */
export function ChartTooltip({ title, rows }: ChartTooltipProps) {
  const fmt = useAppFormat();

  return (
    <div className={styles.tooltip} role="presentation">
      <div className={styles.title}>{title}</div>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <dt className={styles.label}>
              {/* Màu series chỉ biết lúc chạy → CSS custom property, ngoại lệ duy nhất của ADR 0003. */}
              <span
                className={styles.swatch}
                style={{ '--xp-swatch': row.color } as CSSProperties}
              />
              {row.label}
            </dt>
            <dd className={styles.value}>{fmt.money(row.raw)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
