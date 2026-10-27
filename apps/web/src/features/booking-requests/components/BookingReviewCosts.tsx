'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { COLLATERAL_MODE, FEE_LINE, PRICE_ROW } from '@xeprime/types';
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useCustomerCostView, type CustomerCostBreakdown } from '../hooks/use-customer-cost-view';
import type { ListedPriceRow } from './BookingPriceSummary';
import reviewStyles from './BookingReviewStep.module.css';
import styles from './BookingReviewCosts.module.css';

/**
 * Những mảnh hai thẻ tiền cần — xem `CustomerCostBreakdown`. Màn chuyến chờ duyệt dựng chúng từ bảng
 * kê tạm tính của chuyến và dùng lại thẻ thay vì vẽ một bảng tiền thứ hai trông gần giống.
 */
export type ReviewCostsBreakdown = CustomerCostBreakdown;

interface BookingReviewCostsProps {
  listing: PublicListingDetail | null;
  /** Báo giá server của chuyến đang xem lại (đã áp mã khuyến mãi); `null` = chưa có / lỗi. */
  breakdown: ReviewCostsBreakdown | null;
  loading: boolean;
  isDelivery: boolean;
  /** Bảng giá NIÊM YẾT của dịch vụ đang chọn — chỉ dùng khi báo giá không về. */
  listedRows: readonly ListedPriceRow[];
  /** Ô áp mã khuyến mãi (ADR 0046) — tự hiện mã + số giảm khi đã áp. */
  promoSlot?: ReactNode;
  /**
   * Nhãn TRẠNG THÁI của tiền giữ chỗ, ngay dưới số tiền — "Chưa cần thanh toán" ở chuyến còn chờ chủ
   * xe phản hồi (Figma `19727:61135`). Màn Xem lại không có: lúc đó chưa có gì để mà "chưa cần".
   */
  holdTag?: ReactNode;
  /**
   * Câu thay cho "Liên hệ báo giá" khi không có báo giá lẫn giá niêm yết — chuyến đã gửi thì khách
   * không cần được mời hỏi giá nữa, mà cần biết giá chính thức sẽ có lúc nào.
   */
  emptyNote?: string;
  /**
   * Bậc tiêu đề của thẻ — `h3` trong hộp đặt xe (dưới tiêu đề `h2` của bước), `h2` khi thẻ đứng
   * ngay dưới `h1` của một trang (chuyến chờ chủ xe phản hồi): không nhảy bậc dàn ý.
   */
  headingLevel?: 2 | 3;
  /**
   * Bề mặt của hai thẻ:
   *  - `review` (mặc định) — màn Xem lại trong hộp đặt xe (Figma `19727:56092`): đệm 20, tiền giữ
   *    chỗ nằm cạnh lời giải thích.
   *  - `trip` — các màn chuyến sau khi gửi (Figma `19727:61104` · `19759:37485` · `19759:40335`):
   *    đệm 24, tiền giữ chỗ là một hàng nhãn/số, nhãn trạng thái và lời giải thích xếp dưới.
   */
  surface?: 'review' | 'trip';
  /**
   * Số khách ĐÃ chuyển (tiền giữ chỗ đã thanh toán) — chỉ màn chuyến (Figma `21777:56433`). Có thì
   * cuối thẻ là "Đã thanh toán" + "Còn lại" (= tổng − đã trả, không âm) thay cho dòng tổng.
   */
  paidAmount?: string | null;
  /**
   * Số đã CHỐT — bảng kê đóng băng lúc chủ xe nhận chuyến (khoản giữ chỗ, ADR 0039) hoặc của đơn
   * (ADR 0024). Lúc đó câu "giá chốt do chủ xe xác nhận khi duyệt" là sai, và tổng không còn là
   * "dự kiến".
   */
  frozen?: boolean;
  /**
   * Vẽ dòng cọc thế chấp khi nhận xe. Hộp đặt xe tắt nó: cọc đã nằm ở thẻ "Giấy tờ & điều kiện
   * nhận xe" bên trái — nói hai lần cùng một khoản là thừa.
   */
  showDeposit?: boolean;
}

/**
 * Hai thẻ tiền của màn "Xem lại yêu cầu thuê xe" — "Chi phí thuê xe" (Figma `19727:56092`) và
 * "Các khoản khác" (Figma `19727:56117`).
 *
 * Mọi con số đến từ báo giá server; dòng nào vẽ, cọc, tổng và câu chú thích do `useCustomerCostView`
 * quyết — CÙNG mô hình với thẻ "Thành tiền" của trang chi tiết xe. Ở đây chỉ khác HÌNH DẠNG, và hai
 * chỗ khác hình dạng có chủ đích:
 *
 *  - Tổng phụ "Giá sau khuyến mãi" không vẽ: thẻ này kể từng KHOẢN, tổng phụ là thứ khách tự thấy
 *    từ hai dòng ngay trên nó.
 *  - Tiền giữ chỗ và cọc khi nhận xe sang thẻ riêng: chúng không phải thêm một khoản phải trả, mà là
 *    CÁCH trả (một phần trước, phần còn lại tay chủ xe) và một khoản đặt lại rồi lấy về.
 *
 * Tên các khoản tiền dùng lại bộ chữ của `Common.components.price` — "Tổng bạn trả" là `B + S + IV
 * + IP − P`, không phải "tiền thuê" (ADR 0028 điều 3).
 */
export function BookingReviewCosts({
  listing,
  breakdown,
  loading,
  isDelivery,
  listedRows,
  promoSlot,
  holdTag,
  emptyNote,
  headingLevel = 3,
  surface = 'review',
  paidAmount = null,
  frozen = false,
  showDeposit = true,
}: BookingReviewCostsProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const t = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const {
    signedMoney,
    fees,
    rentRows,
    feeLines,
    promoDiscount,
    hasPromo,
    longTerm,
    holdAmount,
    payAtPickup,
    deposit: costDeposit,
    total,
    costNote,
  } = useCustomerCostView({ listing, breakdown, isDelivery, frozen });
  const onTrip = surface === 'trip';
  const deposit = showDeposit ? costDeposit : null;

  return (
    <>
      <section
        className={cx(reviewStyles.card, styles.accent, onTrip && styles.tripCard)}
        aria-label={t('reviewPage.costs.title')}
      >
        <Heading className={reviewStyles.cardTitle}>{t('reviewPage.costs.title')}</Heading>

        {loading ? (
          <div aria-busy="true">
            <Skeleton active title={false} paragraph={{ rows: 4 }} />
          </div>
        ) : breakdown ? (
          <>
            <dl className={styles.rows}>
              {rentRows.map((row) => (
                <div key={row.key} className={styles.row}>
                  <dt>
                    <span className={styles.label}>{row.label}</span>
                    {row.sublabel ? <span className={styles.sub}>{row.sublabel}</span> : null}
                  </dt>
                  <dd
                    className={cx(styles.amount, row.key === PRICE_ROW.DISCOUNT && styles.discount)}
                  >
                    {signedMoney(row.amount)}
                  </dd>
                </div>
              ))}
              {feeLines.map((line) => (
                <div key={line.key} className={styles.row}>
                  <dt>
                    <span className={styles.label}>{dl('feeLine', line.key)}</span>
                    <span className={styles.sub}>
                      {[
                        line.percent != null
                          ? `${line.percent}%`
                          : line.unitAmount && line.quantity
                            ? tCommon('components.price.dailyRate', {
                                days: line.quantity,
                                amount: fmt.money(line.unitAmount),
                              })
                            : null,
                        line.partnerName,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </dt>
                  <dd className={styles.amount}>{fmt.money(line.amount)}</dd>
                </div>
              ))}
              {/*
                Khoản giảm của MÃ KHUYẾN MÃI — ô áp mã (khi có) tự hiện mã + số giảm ngay tại chỗ
                này, nên dòng chỉ-đọc chỉ vẽ khi không có ô: hai chỗ cùng nói một khoản giảm là
                khách tưởng được giảm hai lần.
              */}
              {!promoSlot && hasPromo ? (
                <div className={styles.row}>
                  <dt>
                    <span className={styles.label}>{dl('feeLine', FEE_LINE.PROMO)}</span>
                    {fees?.promo ? <span className={styles.sub}>{fees.promo.code}</span> : null}
                  </dt>
                  <dd className={cx(styles.amount, styles.discount)}>
                    −{fmt.money(promoDiscount)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {promoSlot}

            <div className={reviewStyles.divider} role="presentation" />

            {onTrip && paidAmount ? (
              <TripPaidRemaining
                total={total?.amount ?? breakdown.totalAmount}
                paid={paidAmount}
              />
            ) : (
            <div className={cx(styles.total, onTrip && styles.tripTotal)}>
              {/* Màn chuyến (Figma `21788:60666`): nhãn + số cùng một hàng, số vàng 20/30. */}
              <span className={styles.totalLabel}>
                {onTrip
                  ? t(frozen ? 'reviewPage.costs.tripTotal' : 'reviewPage.costs.tripEstimatedTotal')
                  : total?.label}
              </span>
              <strong className={styles.totalAmount}>
                {fmt.money(total?.amount ?? breakdown.totalAmount)}
              </strong>
              {/* "Tiết kiệm" CHỈ nói về ưu đãi cam kết thời hạn, không so với giá ngày (ADR 0011). */}
              {longTerm?.durationDiscountPercent ? (
                <strong className={styles.savings}>
                  {t('price.savings', {
                    amount: fmt.money(longTerm.durationDiscountAmount),
                    months: longTerm.packageMonths,
                  })}
                </strong>
              ) : null}
              <p className={styles.note}>{costNote}</p>
            </div>
            )}
          </>
        ) : listedRows.length > 0 ? (
          <>
            {/* Báo giá không về (lỗi mạng, xe chưa đủ cấu hình) — trưng giá NIÊM YẾT, nói rõ. */}
            <dl className={styles.rows}>
              {listedRows.map((row) => (
                <div key={row.key} className={styles.row}>
                  <dt>
                    <span className={styles.label}>{row.label}</span>
                  </dt>
                  <dd className={styles.amount}>
                    {row.strikeAmount ? (
                      <s className={styles.strike}>{fmt.money(row.strikeAmount)}</s>
                    ) : null}
                    {fmt.money(row.amount)}
                    <span className={styles.unit}>{row.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className={styles.note}>{t('reviewPage.costs.listedNote')}</p>
          </>
        ) : (
          <p className={styles.note}>{emptyNote ?? t('price.onRequest')}</p>
        )}
      </section>

      {holdAmount || deposit ? (
        <section
          className={cx(reviewStyles.card, onTrip && styles.tripCard)}
          aria-label={t('reviewPage.others.title')}
        >
          <Heading className={reviewStyles.cardTitle}>{t('reviewPage.others.title')}</Heading>
          {holdAmount && onTrip ? (
            /*
             * Màn chuyến: hàng nhãn/số như mọi khoản khác, nhãn TRẠNG THÁI của khoản ngay dưới (chưa
             * cần / cần / đã thanh toán), rồi lời giải thích — đọc từ trên xuống một mạch.
             */
            <div className={styles.block}>
              <div className={styles.row}>
                <span className={styles.label}>{tCommon('components.price.holdAmount')}</span>
                <strong className={styles.amount}>{fmt.money(holdAmount)}</strong>
              </div>
              {holdTag}
              <p className={styles.note}>{tCommon('components.price.holdHint')}</p>
              {payAtPickup ? (
                <div className={styles.row}>
                  <span className={styles.label}>{tCommon('components.price.payAtHandover')}</span>
                  <strong className={styles.amount}>{fmt.money(payAtPickup)}</strong>
                </div>
              ) : null}
            </div>
          ) : holdAmount ? (
            <div className={styles.block}>
              <div className={styles.other}>
                <div className={styles.otherText}>
                  <span className={styles.otherLabel}>
                    {tCommon('components.price.holdAmount')}
                  </span>
                  {holdTag}
                  <p className={styles.otherBody}>{tCommon('components.price.holdHint')}</p>
                </div>
                <strong className={styles.otherAmount}>{fmt.money(holdAmount)}</strong>
              </div>
              {payAtPickup ? (
                <div className={styles.row}>
                  <span className={styles.label}>{tCommon('components.price.payAtHandover')}</span>
                  <strong className={styles.amount}>{fmt.money(payAtPickup)}</strong>
                </div>
              ) : null}
            </div>
          ) : null}
          {holdAmount && deposit ? (
            <div className={reviewStyles.divider} role="presentation" />
          ) : null}
          {deposit ? (
            <div className={styles.block}>
              <div className={styles.row}>
                {/*
                  Màn chuyến (Figma `21621:53895`): "Cọc xe" — cọc THẾ CHẤP trả tay khi nhận xe, KHÁC
                  tiền giữ chỗ chuyển qua QR ở trên (ADR 0044 điều 9).
                */}
                <span className={cx(styles.label, onTrip && styles.depositLabel)}>
                  {onTrip ? t('reviewPage.others.deposit') : tCommon('components.price.deposit')}
                </span>
                <strong className={styles.amount}>
                  {deposit.mode === COLLATERAL_MODE.CASH && deposit.amount
                    ? fmt.money(deposit.amount)
                    : dl('collateralMode', deposit.mode)}
                </strong>
              </div>
              <p className={cx(styles.note, onTrip && styles.depositNote)}>{deposit.note}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/** "Đã thanh toán" + "Còn lại" cuối thẻ chi phí của màn chuyến — Figma `21777:56433`. */
function TripPaidRemaining({ total, paid }: { total: string; paid: string }) {
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const raw = subtractMoney(total, paid);
  const remaining = isNegativeMoney(raw) ? '0.00' : raw;
  return (
    <>
      <div className={styles.row}>
        <span className={styles.label}>{t('reviewPage.costs.paid')}</span>
        <strong className={styles.amount}>{fmt.money(paid)}</strong>
      </div>
      <div className={styles.remaining}>
        <div className={styles.remainingRow}>
          <span className={styles.remainingLabel}>{t('reviewPage.costs.remaining')}</span>
          <strong className={styles.remainingAmount}>{fmt.money(remaining)}</strong>
        </div>
        <p className={styles.note}>{t('reviewPage.costs.remainingNote')}</p>
      </div>
    </>
  );
}
