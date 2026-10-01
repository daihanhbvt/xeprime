'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode, Ref } from 'react';

import { cx } from '@/lib/cx';

import styles from './WorkDrawer.module.css';

/**
 * Khung PANEL LÀM VIỆC — chuẩn chung cho mọi panel chi tiết mà người trực đọc rồi RA QUYẾT ĐỊNH
 * (duyệt xe, giao dịch tiền vào, chốt kết cục giữ chỗ…). Rút ra từ màn "Kiểm duyệt xe" để mọi panel
 * cùng một dáng, không phải mỗi màn tự dựng một kiểu:
 *
 *   `DetailDrawer size="xl" closeAtEnd` + `bodyClassName={WORK_DRAWER_BODY_CLASS}`
 *   ├─ title  : `WorkDrawerTitle`  — nhãn · mã · trạng thái
 *   ├─ extra  : `WorkDrawerPager`  — bản ghi trước / sau trong danh sách đang lọc
 *   ├─ body   : `WorkDrawerLayout` — hồ sơ bên trái, cột hành động bên phải (dính khi cuộn)
 *   │           `WorkDrawerFacts`  — lưới nhãn–giá trị chỉ đọc
 *   └─ footer : `WorkDrawerFooter` — gợi ý bên trái, nút quyết định bên phải (dính đáy)
 *
 * Lý do bắt buộc của một quyết định đi vào HỘP THOẠI mở từ nút ở chân panel — không nằm lẫn trong
 * thân panel — để thân chỉ còn việc đọc và chọn.
 */

/** Lớp đệm thân panel làm việc — truyền vào `DetailDrawer.bodyClassName`. */
export const WORK_DRAWER_BODY_CLASS = styles.body;

export function WorkDrawerTitle({
  label,
  code,
  status,
}: {
  label: ReactNode;
  /** Mã bản ghi (biển số, mã giao dịch…) — chữ nhỏ, số thẳng cột. */
  code?: ReactNode;
  /** Thường là một `StatusTag`. */
  status?: ReactNode;
}) {
  return (
    <div className={styles.headTitle}>
      <span className={styles.headLabel}>{label}</span>
      {code ? <span className={styles.headCode}>{code}</span> : null}
      {status ?? null}
    </div>
  );
}

/** Nút bản ghi trước / sau — chuyển thẳng trong panel, không phải đóng rồi mở lại. */
export function WorkDrawerPager({
  previousId,
  nextId,
  onNavigate,
  previousLabel,
  nextLabel,
}: {
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <div className={styles.headNav}>
      <Button
        size="small"
        icon={<LeftOutlined />}
        aria-label={previousLabel}
        title={previousLabel}
        disabled={!previousId}
        onClick={() => previousId && onNavigate(previousId)}
      />
      <Button
        size="small"
        icon={<RightOutlined />}
        aria-label={nextLabel}
        title={nextLabel}
        disabled={!nextId}
        onClick={() => nextId && onNavigate(nextId)}
      />
    </div>
  );
}

/**
 * Thân hai cột (68% / 32%) khi panel đủ rộng; một cột — cột phải đứng SAU hồ sơ — khi hẹp. Cột
 * phải dính (`sticky`) trong chính vùng cuộn của panel, không sinh thanh cuộn lồng thứ hai.
 */
export function WorkDrawerLayout({
  main,
  side,
  sideLabel,
  ref,
}: {
  main: ReactNode;
  side?: ReactNode;
  /** Tên vùng cho trình đọc màn hình ("Danh mục kiểm tra", "Xử lý giao dịch"…). */
  sideLabel?: string;
  /** Mốc cuộn về đầu khi chuyển bản ghi. */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className={cx(styles.layout, side ? styles.layoutSplit : undefined)}>
      <div className={styles.main}>{main}</div>
      {side ? (
        <aside className={styles.side} aria-label={sideLabel}>
          {side}
        </aside>
      ) : null}
    </div>
  );
}

export interface WorkDrawerFact {
  key: string;
  label: ReactNode;
  value: ReactNode;
  /** Chiếm trọn hàng — mô tả, nội dung chuyển khoản dài. */
  wide?: boolean;
  /** Giữ xuống dòng của người gõ (`pre-line`). */
  multiline?: boolean;
}

/**
 * Lưới nhãn–giá trị CHỈ ĐỌC: `<dl>` thật, tự dàn 2 cột khi đủ chỗ (≥ 2 × 280px), 1 cột khi hẹp —
 * không có nhánh JS theo màn hình. Nhãn trung tính, giá trị đậm hơn: mắt quét cột giá trị.
 */
export function WorkDrawerFacts({ items }: { items: readonly WorkDrawerFact[] }) {
  if (items.length === 0) return null;
  return (
    <dl className={styles.grid}>
      {items.map((item) => (
        <div key={item.key} className={cx(styles.gridItem, item.wide && styles.gridItemWide)}>
          <dt className={styles.gridLabel}>{item.label}</dt>
          <dd className={cx(styles.gridValue, item.multiline && styles.gridValueText)}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Chân panel: gợi ý trạng thái bên trái, nút quyết định bên phải. Mobile: nút xếp dọc, đủ vùng chạm. */
export function WorkDrawerFooter({ hint, actions }: { hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={styles.footerBar}>
      {hint ? <span className={styles.footerHint}>{hint}</span> : <span />}
      {actions ? <div className={styles.footerActions}>{actions}</div> : null}
    </div>
  );
}
