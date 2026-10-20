'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { absoluteMoney, isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { COLLATERAL_MODE, FEE_LINE, PRICE_ROW } from '@xeprime/types';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { payAtPickupAmount, visibleFeeLines, visiblePriceRows } from '@/lib/customer-price-view';
import { useQuoteTotal } from '../hooks/use-quote-total';
import type { ListedPriceRow } from './BookingPriceSummary';
import reviewStyles from './BookingReviewStep.module.css';
import styles from './BookingReviewCosts.module.css';

type QuoteBreakdown = PublicQuote['breakdown'];

/**
 * Những mảnh hai thẻ tiền cần — báo giá công khai (`PublicQuote['breakdown']`) có đủ; bảng kê TẠM
 * TÍNH của một chuyến đã gửi (`CustomerTripEstimateDto`) cũng dựng được bằng đúng các mảnh này, nên
 * màn chuyến chờ duyệt dùng lại thẻ thay vì vẽ một bảng tiền thứ hai trông gần giống.
 */
export type ReviewCostsBreakdown = Pick<
  QuoteBreakdown,
  'rows' | 'totalAmount' | 'depositAmount' | 'fees' | 'estimateNote'
> & {
  /** Gói dài hạn — chỉ để nói phần "tiết kiệm" của ưu đãi cam kết thời hạn (ADR 0011). */
  longTerm?: QuoteBreakdown['longTerm'];
};

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
   * Số đã CHỐT — bảng kê đóng băng lúc chủ xe nhận chuyến (khoản giữ chỗ, ADR 0039) hoặc của đơn
   * (ADR 0024). Lúc đó câu "giá chốt do chủ xe xác nhận khi duyệt" là sai, và tổng không còn là
   * "dự kiến".
   */
  frozen?: boolean;
}

/**
 * Hai thẻ tiền của màn "Xem lại yêu cầu thuê xe" — "Chi phí thuê xe" (Figma `19727:56092`) và
 * "Các khoản khác" (Figma `19727:56117`).
 *
 * Mọi con số đến từ báo giá server; dòng nào vẽ do `lib/customer-price-view` quyết — CÙNG luật với
 * `PriceBreakdown` (ẩn dòng 0đ, ẩn dòng do chủ xe chịu). Ở đây chỉ khác HÌNH DẠNG, và hai chỗ khác
 * hình dạng có chủ đích:
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
  frozen = false,
}: BookingReviewCostsProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const t = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  /** Số âm (dòng giảm) viết bằng dấu trừ thật — `-` của chuỗi trên dây đọc như gạch nối. */
  const signedMoney = (amount: string) =>
    isNegativeMoney(amount) ? `−${fmt.money(absoluteMoney(amount))}` : fmt.money(amount);

  const fees = breakdown?.fees ?? null;
  const rentRows = breakdown ? visiblePriceRows(breakdown.rows, [PRICE_ROW.SUBTOTAL]) : [];
  const feeLines = visibleFeeLines(fees?.lines ?? [], 'customer');
  const promoDiscount = fees?.promoDiscountAmount ?? '0';
  const hasPromo = !isZeroMoney(promoDiscount);
  const longTerm = breakdown?.longTerm ?? null;
  const holdAmount = fees?.holdAmount ?? null;
  const payAtPickup = payAtPickupAmount(fees);

  /*
   * Cọc khi nhận xe: HÌNH THỨC lấy từ hồ sơ xe (tiền / tài sản / miễn), SỐ TIỀN ưu tiên báo giá
   * (chính sách hiệu lực của chuyến này), rồi tới hồ sơ xe.
   */
  const collateral = listing?.collateral ?? null;
  const quotedDeposit =
    breakdown?.depositAmount && !isZeroMoney(breakdown.depositAmount)
      ? breakdown.depositAmount
      : null;
  const depositMode =
    listing?.noCollateral || collateral?.mode === COLLATERAL_MODE.NONE
      ? COLLATERAL_MODE.NONE
      : (collateral?.mode ?? (quotedDeposit ? COLLATERAL_MODE.CASH : null));
  const depositAmount =
    quotedDeposit ??
    (collateral && !isZeroMoney(collateral.depositAmount) ? collateral.depositAmount : null);
  const showDeposit =
    depositMode === COLLATERAL_MODE.NONE ||
    depositMode === COLLATERAL_MODE.ASSET ||
    (depositMode === COLLATERAL_MODE.CASH && depositAmount != null);

  /* Có phụ phí hoặc mã ⇒ số cuối là TỔNG BẠN TRẢ, không còn là tiền thuê — cùng luật `PriceBreakdown`. */
  const total = useQuoteTotal(breakdown, { frozen });
  const onTrip = surface === 'trip';
  const costNote = [
    breakdown?.estimateNote ? `${breakdown.estimateNote}.` : null,
    t('reviewPage.costs.totalNote'),
    /*
     * Phí giao nhận "chưa nằm trong tổng" chỉ đúng khi bảng chưa có dòng đó. Bảng đã CHỐT mà có dòng
     * giao nhận thì phí đã nằm trong tổng — nói ngược lại là sai.
     */
    isDelivery && !(frozen && rentRows.some((row) => row.key === PRICE_ROW.DELIVERY))
      ? t('price.deliveryNote')
      : null,
    frozen ? null : t('price.finalNote'),
  ]
    .filter(Boolean)
    .join(' ');

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
                      {line.partnerName
                        ? `${line.percent}% · ${line.partnerName}`
                        : `${line.percent}%`}
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

            <div className={styles.total}>
              <span className={styles.totalLabel}>{total?.label}</span>
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

      {holdAmount || showDeposit ? (
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
          {holdAmount && showDeposit ? (
            <div className={reviewStyles.divider} role="presentation" />
          ) : null}
          {showDeposit ? (
            <div className={styles.block}>
              <div className={styles.row}>
                <span className={styles.label}>{tCommon('components.price.deposit')}</span>
                <strong className={styles.amount}>
                  {depositMode === COLLATERAL_MODE.CASH && depositAmount
                    ? fmt.money(depositAmount)
                    : dl('collateralMode', depositMode ?? COLLATERAL_MODE.NONE)}
                </strong>
              </div>
              <p className={styles.note}>
                {depositMode === COLLATERAL_MODE.NONE
                  ? t('reviewPage.others.noDepositBody')
                  : depositMode === COLLATERAL_MODE.ASSET && collateral?.assetTypes.length
                    ? t('reviewPage.others.assetBody', {
                        assets: collateral.assetTypes
                          .map((asset) => dl('collateralAssetType', asset))
                          .join(', '),
                      })
                    : tCommon('components.price.depositHint')}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
