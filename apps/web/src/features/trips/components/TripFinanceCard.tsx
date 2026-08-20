'use client';

import { Alert } from 'antd';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  hasDepositToShow,
  type DepositStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { isZeroMoney } from '@/lib/money';
import type { CustomerTripFinance } from '../types';
import styles from './TripFinanceCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useTranslations } from 'next-intl';

/**
 * Hoá đơn + tiền cọc, phía KHÁCH.
 *
 * Toàn bộ con số đã được server tính (`CustomerTripFinanceDto`); ở đây không có một phép cộng
 * trừ nào — đó là điều kiện để hoá đơn khách nhìn và sổ của chủ xe không bao giờ lệch.
 *
 * Khối cọc nói rõ khấu trừ phụ phí là **cách trả** cho phần phụ phí đã nằm trong tổng, không
 * phải một khoản bị trừ lần thứ hai. Không có nút nào ở đây: phụ phí do chủ xe ghi, hoàn cọc do
 * chủ xe thực hiện bên ngoài rồi đánh dấu — khách đọc, không duyệt.
 */
export function TripFinanceCard({
  finance,
  closed,
}: {
  finance: CustomerTripFinance;
  /** Chuyến đã khép: hiện hoá đơn cuối (có phụ phí) thay cho bảng giá dự kiến. */
  closed: boolean;
}) {
  const t = useTranslations('Trips.finance');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const depositStatus = finance.depositStatus as DepositStatus;
  const hasSurcharge = finance.surcharges.length > 0;
  /*
   * Chỉ `NONE` (chưa từng có cọc) mới ẩn khối này. Mọi trạng thái còn lại đều dính tới một
   * khoản tiền có thật — đang chờ thu, đang giữ, đã khấu trừ, hay đã hoàn — và giấu nó đi vì
   * "chuyến chưa xong" là giấu tiền của khách.
   */
  const showDeposit = hasDepositToShow(depositStatus);

  return (
    <section className={styles.card} aria-label={closed ? t('invoiceTitle') : t('priceTitle')}>
      <h2 className={styles.title}>{closed ? t('invoiceTitle') : t('priceTitle')}</h2>

      {finance.legacyPricing ? (
        <Alert
          type="info"
          showIcon
          message={t('legacy')}
        />
      ) : null}

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>{t('rental')}</dt>
          <dd>{fmt.money(finance.baseAmount)}</dd>
        </div>
        {!isZeroMoney(finance.discountAmount) ? (
          <div className={styles.row}>
            <dt>{t('discount')}</dt>
            <dd className={styles.discount}>−{fmt.money(finance.discountAmount)}</dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>{t('deliveryFee')}</dt>
          {/*
            Phí giao nhận mặc định miễn phí; chủ xe chốt lại sau khi thoả thuận (Wave 9). Khách
            thấy số MỚI NHẤT — không có bước chấp nhận, nên cũng không có nút nào ở đây.
          */}
          <dd className={isZeroMoney(finance.deliveryFee) ? styles.free : undefined}>
            {isZeroMoney(finance.deliveryFee) ? t('free') : fmt.money(finance.deliveryFee)}
          </dd>
        </div>
      </dl>

      {hasSurcharge ? (
        <>
          <h3 className={styles.subTitle}>{t('surchargesTitle')}</h3>
          <dl className={styles.rows}>
            {finance.surcharges.map((row, index) => (
              <div key={`${row.category}-${row.recordedAt}-${index}`} className={styles.row}>
                <dt className={styles.surchargeLabel}>
                  <span>
                    {dl('surchargeCategory', row.category)}
                  </span>
                  <span className={styles.surchargeReason}>{row.reason}</span>
                </dt>
                <dd>{fmt.money(row.amount)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      <div className={styles.total}>
        <span>{closed ? t('totalFinal') : t('total')}</span>
        <span className={styles.totalValue}>{fmt.money(finance.finalTotal)}</span>
      </div>

      {!isZeroMoney(finance.rentalPaid) ? (
        <div className={styles.row}>
          <dt className={styles.paidLabel}>{t('paid')}</dt>
          <dd>{fmt.money(finance.rentalPaid)}</dd>
        </div>
      ) : null}

      {showDeposit ? <DepositBlock finance={finance} status={depositStatus} /> : null}

      {!isZeroMoney(finance.additionalDue) ? (
        <Alert
          type="warning"
          showIcon
          message={t('additionalDue', { amount: fmt.money(finance.additionalDue) })}
          description={t('additionalDueBody')}
        />
      ) : null}
    </section>
  );
}

/**
 * Khối cọc — mỗi trạng thái một câu chuyện khác nhau, và cái sai đắt nhất là gộp
 * `Chưa nhận cọc` với `Không yêu cầu cọc`: câu đầu nghĩa là còn một khoản tiền đang treo.
 */
function DepositBlock({
  finance,
  status,
}: {
  finance: CustomerTripFinance;
  status: DepositStatus;
}) {
  const t = useTranslations('Trips.finance');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const refunded = finance.refundAmount !== null;

  return (
    <section className={styles.deposit} aria-label={t('depositAria')}>
      <header className={styles.depositHead}>
        <h3 className={styles.subTitle}>{t('depositTitle')}</h3>
        <StatusTag value={status} meta={DEPOSIT_STATUS_META} group="depositStatus" />
      </header>

      {status === DEPOSIT_STATUS.NOT_RECEIVED ? (
        <p className={styles.depositNote}>
          {t('depositNotReceived', { amount: fmt.money(finance.depositRequired) })}
        </p>
      ) : (
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>{t('depositReceived')}</dt>
            <dd>{fmt.money(finance.depositReceived)}</dd>
          </div>
          {!isZeroMoney(finance.depositDeducted) ? (
            <div className={styles.row}>
              <dt>{t('depositDeducted')}</dt>
              <dd className={styles.discount}>−{fmt.money(finance.depositDeducted)}</dd>
            </div>
          ) : null}
          {/*
            Chuyến chưa xong thì chưa có "dự kiến hoàn": cọc đang làm đúng việc của nó, và một
            con số hoàn lại lúc này chỉ là phỏng đoán trước khi biết có phát sinh gì không.
          */}
          {status === DEPOSIT_STATUS.RECEIVED ? null : (
            <div className={styles.depositTotal}>
              <span>{refunded ? t('refundActual') : t('refundExpected')}</span>
              <span className={styles.totalValue}>
                {fmt.money(refunded ? finance.refundAmount! : finance.expectedRefund)}
              </span>
            </div>
          )}
        </dl>
      )}

      {!isZeroMoney(finance.depositDeducted) ? (
        <p className={styles.depositNote}>{t('deductNote')}</p>
      ) : null}

      {refunded ? (
        <p className={styles.depositNote}>
          {t('refundedBy', {
            method: dl('refundMethod', finance.refundMethod, t('refundMethodOther')),
          })}
          {finance.refundedAt ? t('refundedAt', { date: fmt.dateTime(finance.refundedAt) }) : ''}
          {finance.refundReference
            ? t('refundRef', { reference: finance.refundReference })
            : ''}
          {t('refundedTail')}
        </p>
      ) : status === DEPOSIT_STATUS.AWAITING_REFUND ? (
        <p className={styles.depositNote}>{t('awaitingRefund')}</p>
      ) : status === DEPOSIT_STATUS.RECEIVED ? (
        <p className={styles.depositNote}>{t('holding')}</p>
      ) : status === DEPOSIT_STATUS.SETTLED ? (
        <p className={styles.depositNote}>{t('settled')}</p>
      ) : null}
    </section>
  );
}
