'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { FEE_BEARER, PRICE_ROW } from '@xeprime/types';
import styles from './PriceBreakdown.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useTranslations } from 'next-intl';

/** Một dòng breakdown — cùng shape với `PriceBreakdownRowDto` của API/snapshot. */
export interface PriceBreakdownRowInput {
  key: string;
  label: string;
  sublabel?: string | null;
  /** VND chuỗi; dòng giảm giá mang dấu âm ('-120000'). */
  amount: string;
}

/**
 * Hình dạng TỐI THIỂU của khối phụ phí mà component này vẽ.
 *
 * Cố ý KHÔNG dùng thẳng `CustomerFeeBreakdown` (@xeprime/types) hay `CustomerFeeBreakdownDto`
 * (type sinh từ OpenAPI): hai bản đó khác nhau ở chỗ trường nào optional, và component hiển thị
 * được gọi từ CẢ HAI nguồn — báo giá công khai (qua dây) và snapshot đã đóng băng trên đơn.
 * Khai đúng thứ mình đọc khiến cả hai nguồn vừa khít mà không phải ép kiểu ở nơi gọi.
 */
export interface PriceBreakdownFees {
  lines: ReadonlyArray<{
    key: string;
    bearer: string;
    percent: number;
    amount: string;
    partnerName?: string | null;
  }>;
  customerTotalAmount: string;
  /** Khách chuyển online để giữ chỗ; null/undefined = chuyến này không cần giữ chỗ. */
  holdAmount?: string | null;
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
  /**
   * PHỤ PHÍ PHÍA KHÁCH — ADR 0029 điều 1. Có mặt ⇒ hiện thêm một khối RIÊNG dưới tổng tiền thuê,
   * mỗi dòng đúng tên theo người hưởng, rồi mới tới "Tổng bạn trả".
   *
   * Vì sao là khối riêng chứ không nhét vào `rows`: `rows` là bảng kê giá THUÊ và
   * `totalAmount = Σ rows` là doanh thu của gian hàng. Trộn phí của XePrime/ngân sách/hãng bảo
   * hiểm vào đó là nói dối cả hai phía — xem docblock `PlatformFeeSnapshot` ở @xeprime/types.
   */
  fees?: PriceBreakdownFees | null;
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
  totalLabel,
  depositAmount,
  depositNote,
  title,
  badge,
  footer,
  fees,
}: PriceBreakdownProps) {
  const tCommon = useTranslations('Common');
  const totalText = totalLabel ?? tCommon('components.price.subtotal');
  const depositNoteText = depositNote ?? tCommon('components.price.depositNote');
  const titleText = title ?? tCommon('components.price.title');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <section className={styles.card} aria-label={titleText}>
      <header className={styles.header}>
        <h3 className={styles.title}>{titleText}</h3>
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
              {fmt.money(row.amount)}
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.totalBlock}>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>{totalText}</span>
          <span className={styles.totalAmount}>{fmt.money(totalAmount)}</span>
        </div>

        {depositAmount != null ? (
          <>
            <div className={styles.depositRow}>
              <span className={styles.depositLabel}>
                {tCommon('components.price.deposit')}
                <Tooltip title={tCommon('components.price.depositHint')}>
                  <InfoCircleOutlined className={styles.depositInfo} />
                </Tooltip>
              </span>
              <span className={styles.depositAmount}>{fmt.money(depositAmount)}</span>
            </div>
            <p className={styles.depositNote}>{depositNoteText}</p>
          </>
        ) : null}
      </div>

      {fees && fees.lines.length > 0 ? (
        <div className={styles.feesBlock}>
          <h4 className={styles.feesTitle}>{tCommon('components.price.feesTitle')}</h4>
          <dl className={styles.rows}>
            {fees.lines.map((line) => (
              <div key={line.key} className={styles.row}>
                <dt className={styles.rowLabel}>
                  <span>{domainLabel('feeLine', line.key)}</span>
                  {/*
                    Dòng do CHỦ XE chịu (bảo vệ xe) không cộng vào tổng khách — nói rõ ngay tại
                    dòng, nếu không khách sẽ tự cộng vào và thấy tổng không khớp.
                  */}
                  <span className={styles.sublabel}>
                    {line.bearer === FEE_BEARER.OWNER
                      ? tCommon('components.price.ownerNet')
                      : `${line.percent}%`}
                    {line.partnerName ? ` · ${line.partnerName}` : ''}
                  </span>
                </dt>
                <dd
                  className={[
                    styles.rowAmount,
                    line.bearer === FEE_BEARER.OWNER ? styles.muted : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {fmt.money(line.amount)}
                </dd>
              </div>
            ))}
          </dl>

          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>{tCommon('components.price.customerTotal')}</span>
            <span className={styles.totalAmount}>{fmt.money(fees.customerTotalAmount)}</span>
          </div>

          {/* Giữ chỗ: số khách chuyển ONLINE, và phần còn lại trả tay chủ xe (ADR 0028 điều 7A). */}
          {fees.holdAmount ? (
            <>
              <div className={styles.depositRow}>
                <span className={styles.depositLabel}>
                  {tCommon('components.price.holdAmount')}
                  <Tooltip title={tCommon('components.price.holdHint')}>
                    <InfoCircleOutlined className={styles.depositInfo} />
                  </Tooltip>
                </span>
                <span className={styles.depositAmount}>{fmt.money(fees.holdAmount)}</span>
              </div>
              <div className={styles.depositRow}>
                <span className={styles.depositLabel}>
                  {tCommon('components.price.payAtHandover')}
                </span>
                <span className={styles.depositAmount}>
                  {fmt.money(
                    String(Number(fees.customerTotalAmount) - Number(fees.holdAmount)),
                  )}
                </span>
              </div>
            </>
          ) : null}

          <p className={styles.depositNote}>{tCommon('components.price.feesNote')}</p>
        </div>
      ) : null}

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}
