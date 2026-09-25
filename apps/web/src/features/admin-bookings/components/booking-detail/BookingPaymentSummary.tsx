'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { InfoHint } from '@/components/data-display/InfoHint';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import { isDebtOverdue, isInDebtScope, otherChargesAmount } from '../../detail';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

function MoneyRow({
  label,
  children,
  variant,
}: {
  label: string;
  children: ReactNode;
  variant?: 'total';
}) {
  return (
    <div className={cx(styles.moneyRow, variant === 'total' && styles.moneyRowTotal)}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * "Thanh toán" — hai khối TÁCH BIỆT, không bao giờ cộng vào nhau:
 *
 *  - Trái: tiền của ĐƠN (tiền thuê → tổng → đã thu → còn lại), đúng các con số API trả. Phần của
 *    tổng không nằm ở các dòng tách được (phụ phí phát sinh) hiện thành một dòng riêng để các
 *    dòng cộng khớp; đơn đã huỷ không có dòng "còn phải thanh toán" (ngoài phạm vi công nợ).
 *  - Phải: tài sản bảo đảm khi nhận xe = `depositAmount` của đơn. Đó là cọc THẾ CHẤP theo đơn
 *    (`BookingPriceSnapshot.depositAmount`: "hoàn trả, KHÔNG nằm trong totalAmount"), KHÁC tiền
 *    giữ chỗ khách chuyển qua QR (ADR 0044 điều 9). Nó là mức ĐƠN KHAI, chưa chắc đã thu.
 *
 * Không có dòng "tiền giữ chỗ": DTO nền tảng không mang khoản giữ chỗ đã trả — dựng dòng đó từ
 * `depositAmount` là đúng cái gộp nhầm mà ADR 0044 cấm.
 */
export function BookingPaymentSummary({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.payment');
  const fmt = useAppFormat();
  const titleId = useId();
  const collateralTitleId = useId();
  const overdueId = useId();

  const overdue = isDebtOverdue(booking);
  const otherCharges = otherChargesAmount(booking);
  const hasCollateral = !isZeroMoney(booking.depositAmount);

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {t('title')}
      </h3>
      <div className={styles.paymentGrid}>
        <dl className={styles.moneyTable} aria-label={t('summaryLabel')}>
          <MoneyRow label={t('base')}>{fmt.money(booking.baseAmount)}</MoneyRow>
          {isZeroMoney(booking.deliveryFee) ? null : (
            <MoneyRow label={t('delivery')}>{fmt.money(booking.deliveryFee)}</MoneyRow>
          )}
          {otherCharges ? (
            <MoneyRow label={t('otherCharges')}>{fmt.money(otherCharges)}</MoneyRow>
          ) : null}
          {isZeroMoney(booking.discountAmount) ? null : (
            <MoneyRow label={t('discount')}>
              {t('discountValue', { amount: fmt.money(booking.discountAmount) })}
            </MoneyRow>
          )}
          <MoneyRow label={t('total')} variant="total">
            {fmt.money(booking.totalAmount)}
          </MoneyRow>
          <MoneyRow label={t('paid')}>{fmt.money(booking.paidAmount)}</MoneyRow>
          {isInDebtScope(booking) ? (
            <MoneyRow label={t('debt')}>
              <span
                className={overdue ? styles.debtOverdue : undefined}
                aria-describedby={overdue ? overdueId : undefined}
              >
                {fmt.money(booking.debtAmount)}
              </span>
              {/* Màu không được là tín hiệu duy nhất: quá hạn thì nói bằng chữ. */}
              {overdue ? (
                <span id={overdueId} className={styles.debtOverdueNote}>
                  {t('debtOverdue')}
                </span>
              ) : null}
            </MoneyRow>
          ) : null}
        </dl>

        <aside className={styles.collateral} aria-labelledby={collateralTitleId}>
          <div className={styles.collateralHead}>
            <span id={collateralTitleId}>{t('collateral.title')}</span>
            {hasCollateral ? (
              <InfoHint label={t('collateral.hintLabel')} content={t('collateral.hint')} />
            ) : null}
          </div>
          {hasCollateral ? (
            <>
              <div className={styles.collateralAmount}>{fmt.money(booking.depositAmount)}</div>
              <p className={styles.collateralNote}>
                <InfoCircleOutlined aria-hidden />
                <span>{t('collateral.note')}</span>
              </p>
            </>
          ) : (
            <div className={styles.collateralNone}>{t('collateral.none')}</div>
          )}
        </aside>
      </div>
    </section>
  );
}
