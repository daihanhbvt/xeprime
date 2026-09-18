'use client';

import { DownOutlined, InfoCircleOutlined, UpOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { subtractMoney } from '@xeprime/domain';
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
  /**
   * B − D — khách trả TRỰC TIẾP chủ xe lúc nhận xe, do server tính sẵn (`CustomerFeeBreakdownDto`).
   * Ưu tiên đọc trường này thay vì tự trừ `customerTotalAmount − holdAmount` ở client; thiếu thì
   * mới rơi về phép trừ (đơn/snapshot cũ chưa có trường này).
   */
  payAtPickupAmount?: string | null;
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
  /**
   * Người đang đọc bảng này là CHỦ XE hay KHÁCH. Mặc định là khách — bề mặt đông hơn, và mặc
   * định an toàn phải là "ít lộ hơn".
   *
   * Quyết định đúng một chuyện: có vẽ những dòng do CHỦ XE chịu hay không. Thuế khấu trừ là ví
   * dụ điển hình — nó KHÔNG cộng vào tổng khách (ADR 0032 điều 3), nên với khách nó chỉ là một
   * con số lạ nằm giữa hoá đơn của mình. Với chủ xe thì ngược lại: đó là dòng giải thích vì sao
   * số thực nhận thấp hơn tổng khách trả.
   */
  audience?: 'customer' | 'owner';
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
  /**
   * Gấp các dòng kê chi tiết (bảng giá thuê + từng khoản phụ phí) sau một nút "Xem chi tiết",
   * mặc định ĐÓNG — chỉ tổng cuối/cọc/tiền giữ chỗ hiện ngay. Mặc định của prop là `false` để
   * KHÔNG đổi hành vi ở màn đặt xe (khách cần thấy đủ trước khi bấm gửi): chỉ màn xem lại sau
   * khi đã đặt (chi tiết chuyến) mới bật, nơi con số đã chốt và bảng dài chỉ còn là tra cứu.
   */
  collapsible?: boolean;
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
  audience = 'customer',
  collapsible = false,
}: PriceBreakdownProps) {
  const tCommon = useTranslations('Common');
  const totalText = totalLabel ?? tCommon('components.price.subtotal');
  const depositNoteText = depositNote ?? tCommon('components.price.depositNote');
  const titleText = title ?? tCommon('components.price.title');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [expanded, setExpanded] = useState(!collapsible);
  const showItems = !collapsible || expanded;

  /*
   * Dòng do CHỦ XE chịu chỉ vẽ cho chủ xe. Với khách, thuế khấu trừ là một con số lạ nằm giữa
   * hoá đơn của họ mà họ không trả — nó không cộng vào tổng (ADR 0032 điều 3), nên hiện ra chỉ
   * làm người ta tưởng mình đang gánh thuế của người khác.
   */
  const feeLines = (fees?.lines ?? []).filter(
    (line) => audience === 'owner' || line.bearer !== FEE_BEARER.OWNER,
  );
  /*
   * Có khối phụ phí ⇒ `totalAmount` (giá thuê) KHÔNG còn là số cuối cùng khách phải chuẩn bị —
   * `fees.customerTotalAmount` mới là. Vẽ to-đậm CẢ HAI bằng cùng kiểu chữ (bản trước) khiến
   * người đọc không biết số nào là "cái phải trả" — đúng phản hồi người dùng 18/09/2026. Khi
   * không có phụ phí thì `totalAmount` vẫn là số cuối, giữ nguyên kiểu chữ nổi bật như cũ.
   */
  const hasFees = Boolean(fees) && feeLines.length > 0;
  const payAtHandoverAmount =
    fees?.payAtPickupAmount ??
    (fees?.holdAmount ? subtractMoney(fees.customerTotalAmount, fees.holdAmount) : null);

  return (
    <section className={styles.card} aria-label={titleText}>
      <header className={styles.header}>
        <h3 className={styles.title}>{titleText}</h3>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </header>

      {collapsible ? (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? tCommon('components.price.collapse') : tCommon('components.price.viewDetails')}
          {expanded ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
        </button>
      ) : null}

      {showItems ? (
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
      ) : null}

      <div className={styles.totalBlock}>
        <div className={hasFees ? styles.totalRowMuted : styles.totalRow}>
          <span className={hasFees ? styles.totalLabelMuted : styles.totalLabel}>{totalText}</span>
          <span className={hasFees ? styles.totalAmountMuted : styles.totalAmount}>
            {fmt.money(totalAmount)}
          </span>
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

      {fees && feeLines.length > 0 ? (
        <div className={styles.feesBlock}>
          <h4 className={styles.feesTitle}>{tCommon('components.price.feesTitle')}</h4>
          {showItems ? (
            <dl className={styles.rows}>
              {feeLines.map((line) => (
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
          ) : null}

          {/*
            Số CUỐI CÙNG khách phải chuẩn bị — hero của cả bảng, to hơn hẳn "tiền thuê" ở trên vì
            đây mới là con số họ cần biết trước khi bấm gửi/chuyển khoản.
          */}
          <div className={styles.grandTotalRow}>
            <span className={styles.grandTotalLabel}>{tCommon('components.price.customerTotal')}</span>
            <span className={styles.grandTotalAmount}>{fmt.money(fees.customerTotalAmount)}</span>
          </div>

          {/*
            Giữ chỗ: số khách chuyển ONLINE ngay, và phần còn lại trả tay chủ xe lúc nhận xe
            (ADR 0028 điều 7A) — hai con số hành động, đặt trong một khối riêng để không lẫn vào
            các dòng phụ phí nhạt màu phía trên.
          */}
          {fees.holdAmount ? (
            <div className={styles.paymentPlan}>
              <div className={styles.paymentPlanRow}>
                <span className={styles.paymentPlanLabel}>
                  {tCommon('components.price.holdAmount')}
                  <Tooltip title={tCommon('components.price.holdHint')}>
                    <InfoCircleOutlined className={styles.depositInfo} />
                  </Tooltip>
                </span>
                <span className={styles.paymentPlanAmountNow}>{fmt.money(fees.holdAmount)}</span>
              </div>
              {payAtHandoverAmount != null ? (
                <div className={styles.paymentPlanRow}>
                  <span className={styles.paymentPlanLabel}>
                    {tCommon('components.price.payAtHandover')}
                  </span>
                  <span className={styles.paymentPlanAmountLater}>
                    {fmt.money(payAtHandoverAmount)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className={styles.depositNote}>{tCommon('components.price.feesNote')}</p>
        </div>
      ) : null}

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}
