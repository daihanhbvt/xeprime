'use client';

import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useState } from 'react';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  FEE_LINE,
  HOLD_REFUND_STATUS,
  PRICE_ROW,
  hasDepositToShow,
  type DepositStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { isZeroMoney } from '@/lib/money';
import { visibleFeeLines } from '@/lib/customer-price-view';
import type { CustomerTripDetail, CustomerTripFinance } from '../types';
import { RefundAccountDialog } from './RefundAccountDialog';
import { TripRequestPill, type TripRequestTone } from './TripRequestLayout';
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
  settlement,
}: {
  finance: CustomerTripFinance;
  /** Chuyến đã khép: hiện hoá đơn cuối (có phụ phí) thay cho bảng giá dự kiến. */
  closed: boolean;
  /**
   * Chuyến đã khép: khoản giữ chỗ + khoản hoàn GỘP vào hoá đơn (thay thẻ `TripHoldPanel` riêng).
   * `completed` quyết nhãn trạng thái khi không có khoản hoàn.
   */
  settlement?: { hold: CustomerTripDetail['hold']; tripId: string; completed: boolean };
}) {
  if (closed) return <ClosedInvoice finance={finance} settlement={settlement} />;
  return <OpenFinanceCard finance={finance} />;
}

function OpenFinanceCard({ finance }: { finance: CustomerTripFinance }) {
  const t = useTranslations('Trips.finance');
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  /*
   * Gấp bảng kê từng dòng theo mặc định — khách chỉ cần "phải trả bao nhiêu" (`.total`) và tình
   * trạng cọc ngay khi mở màn; cách tính ra con số đó là tra cứu, không phải thứ đầu tiên cần
   * đọc. `.total`, tiền đã trả và khối cọc KHÔNG nằm sau nút này — chúng không phải "chi tiết".
   */
  const [expanded, setExpanded] = useState(false);

  const depositStatus = finance.depositStatus as DepositStatus;
  const hasSurcharge = finance.surcharges.length > 0;
  const hasHoldPaymentPlan =
    finance.customerTotalAmount != null &&
    finance.holdPaidAmount != null &&
    finance.payAtPickupAmount != null;
  /*
   * Chỉ `NONE` (chưa từng có cọc) mới ẩn khối này. Mọi trạng thái còn lại đều dính tới một
   * khoản tiền có thật — đang chờ thu, đang giữ, đã khấu trừ, hay đã hoàn — và giấu nó đi vì
   * "chuyến chưa xong" là giấu tiền của khách.
   */
  const showDeposit = hasDepositToShow(depositStatus);

  return (
    <section className={styles.card} aria-label={t('priceTitle')}>
      <h2 className={styles.title}>{t('priceTitle')}</h2>

      {finance.legacyPricing ? (
        <Alert
          type="info"
          showIcon
          title={t('legacy')}
        />
      ) : null}

      <button
        type="button"
        className={styles.toggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? tCommon('components.price.collapse') : tCommon('components.price.viewDetails')}
        {expanded ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
      </button>

      {expanded ? (
        <>
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
        </>
      ) : null}

      <div className={styles.total}>
        <span>{t('total')}</span>
        <span className={styles.totalValue}>{fmt.money(finance.finalTotal)}</span>
      </div>

      {/*
        Kế hoạch trả tiền của chuyến đã cọc phải nằm NGAY trong "Chi tiết giá", không chỉ là
        một câu Alert nhỏ ở khối giữ chỗ. Ba số do server trả sẵn: tổng khách trả, số đã chuyển
        XePrime và phần còn lại đưa chủ xe — client không tự lấy tổng trừ cọc.
      */}
      {hasHoldPaymentPlan ? (
        <section className={styles.paymentPlan} aria-label={t('paymentPlanTitle')}>
          <h3 className={styles.subTitle}>{t('paymentPlanTitle')}</h3>
          <dl className={styles.paymentPlanRows}>
            <div className={styles.paymentPlanRow}>
              <dt>{tCommon('components.price.customerTotal')}</dt>
              <dd>{fmt.money(finance.customerTotalAmount)}</dd>
            </div>
            <div className={styles.paymentPlanRow}>
              <dt>{t('holdPaid')}</dt>
              <dd>{fmt.money(finance.holdPaidAmount)}</dd>
            </div>
            <div className={styles.paymentPlanRowStrong}>
              <dt>{tCommon('components.price.payAtHandover')}</dt>
              <dd>{fmt.money(finance.payAtPickupAmount)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

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
          title={t('additionalDue', { amount: fmt.money(finance.additionalDue) })}
          description={t('additionalDueBody')}
        />
      ) : null}
    </section>
  );
}

type ClosedSettlement = NonNullable<Parameters<typeof TripFinanceCard>[0]['settlement']>;
type HoldRefund = NonNullable<NonNullable<ClosedSettlement['hold']>['refund']>;

/** Tình trạng khoản hoàn → nhãn + sắc thái viên thuốc "Trạng thái". */
function refundPill(refund: HoldRefund): { key: RefundPillKey; tone: TripRequestTone } {
  switch (refund.status) {
    case HOLD_REFUND_STATUS.PAID:
      return { key: 'refundPaid', tone: 'success' };
    case HOLD_REFUND_STATUS.CREDITED:
      return { key: 'refundCredited', tone: 'success' };
    case HOLD_REFUND_STATUS.REJECTED:
      return { key: 'noRefund', tone: 'danger' };
    default:
      return refund.hasAccount
        ? { key: 'refundProcessing', tone: 'warning' }
        : { key: 'refundNeedsAccount', tone: 'warning' };
  }
}

type RefundPillKey =
  | 'paid'
  | 'refundPaid'
  | 'refundCredited'
  | 'refundProcessing'
  | 'refundNeedsAccount'
  | 'noRefund';

/**
 * Hoá đơn dịch vụ của chuyến ĐÃ KHÉP — Figma `21621:68465` (hoàn thành) · `21621:67915` (đã huỷ).
 *
 * Kê PHẲNG mọi khoản phía khách (không gấp sau "Xem chi tiết giá"): tiền thuê kèm cách tính, khuyến
 * mãi của chủ xe, phí giao xe, các khoản đi kèm do KHÁCH chịu (phí sàn, bảo hiểm — dòng 0đ không
 * vẽ), mã khuyến mãi XePrime; rồi tổng, đã thanh toán, trạng thái. Khoản giữ chỗ và khoản hoàn GỘP
 * vào đây thay cho thẻ riêng. KHÔNG bao giờ hiện thuế, hoa hồng hay các dòng phía chủ xe (ADR 0064
 * điều 11) — `visibleFeeLines(…, 'customer')` bỏ dòng chủ xe chịu, và hai khoá đó bị loại thêm lần
 * nữa cho chắc. Mọi con số là của server; ở đây không cộng trừ.
 */
function ClosedInvoice({
  finance,
  settlement,
}: {
  finance: CustomerTripFinance;
  settlement?: ClosedSettlement;
}) {
  const t = useTranslations('Trips.finance');
  const tInv = useTranslations('Trips.finance.invoice');
  const tCommon = useTranslations('Common');
  const tRefund = useTranslations('BankAccounts.refund');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const [accountOpen, setAccountOpen] = useState(false);

  const fees = finance.breakdown?.fees ?? null;
  const baseRow = finance.breakdown?.rows.find((row) => row.key === PRICE_ROW.BASE);
  const feeLines = visibleFeeLines(fees?.lines ?? [], 'customer').filter(
    (line) => line.key !== FEE_LINE.TAX && line.key !== FEE_LINE.OWNER_COMMISSION,
  );
  const promoDiscount = fees?.promoDiscountAmount ?? '0';
  const totalAmount = finance.customerTotalAmount ?? finance.finalTotal;

  const hold = settlement?.hold ?? null;
  const completed = settlement?.completed ?? false;
  const paidAmount =
    finance.holdPaidAmount ??
    (hold && !isZeroMoney(hold.paidAmount) ? hold.paidAmount : null) ??
    (!isZeroMoney(finance.rentalPaid) ? finance.rentalPaid : null);
  const refund = hold?.refund ?? null;
  const needsAccount =
    refund != null &&
    refund.status === HOLD_REFUND_STATUS.PENDING &&
    !refund.hasAccount &&
    settlement != null;

  const status: { key: RefundPillKey; tone: TripRequestTone } | null = refund
    ? refundPill(refund)
    : completed
      ? { key: 'paid', tone: 'success' }
      : paidAmount
        ? { key: 'noRefund', tone: 'danger' }
        : null;

  const depositStatus = finance.depositStatus as DepositStatus;

  return (
    <section className={styles.card} aria-label={t('invoiceTitle')}>
      <h2 className={styles.title}>{t('invoiceTitle')}</h2>

      {finance.legacyPricing ? <Alert type="info" showIcon title={t('legacy')} /> : null}

      <dl className={styles.invoiceRows}>
        <div className={styles.invoiceRow}>
          <dt className={styles.invoiceLabel}>
            <span>{tInv('rentFee')}</span>
            {baseRow?.sublabel ? (
              <span className={styles.invoiceSub}>{baseRow.sublabel}</span>
            ) : null}
          </dt>
          <dd className={styles.invoiceValue}>{fmt.money(finance.baseAmount)}</dd>
        </div>

        {!isZeroMoney(finance.discountAmount) ? (
          <div className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>{t('discount')}</dt>
            <dd className={`${styles.invoiceValue} ${styles.discount}`}>
              −{fmt.money(finance.discountAmount)}
            </dd>
          </div>
        ) : null}

        {!isZeroMoney(finance.deliveryFee) ? (
          <div className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>{t('deliveryFee')}</dt>
            <dd className={styles.invoiceValue}>{fmt.money(finance.deliveryFee)}</dd>
          </div>
        ) : null}

        {feeLines.map((line) => {
          const sub =
            line.unitAmount && line.quantity
              ? tCommon('components.price.dailyRate', {
                  days: line.quantity,
                  amount: fmt.money(line.unitAmount),
                })
              : null;
          return (
            <div key={line.key} className={styles.invoiceRow}>
              <dt className={styles.invoiceLabel}>
                <span>{dl('feeLine', line.key)}</span>
                {sub || line.partnerName ? (
                  <span className={styles.invoiceSub}>
                    {[sub, line.partnerName].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </dt>
              <dd className={styles.invoiceValue}>{fmt.money(line.amount)}</dd>
            </div>
          );
        })}

        {!isZeroMoney(promoDiscount) ? (
          <div className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>
              <span>{dl('feeLine', FEE_LINE.PROMO)}</span>
              {fees?.promo ? (
                <span className={styles.invoiceSub}>
                  {fees.promo.code}
                  {fees.promo.name ? ` · ${fees.promo.name}` : ''}
                </span>
              ) : null}
            </dt>
            <dd className={`${styles.invoiceValue} ${styles.discount}`}>
              −{fmt.money(promoDiscount)}
            </dd>
          </div>
        ) : null}

        <div className={styles.invoiceRow}>
          <dt className={styles.invoiceLabel}>{tInv('total')}</dt>
          <dd className={styles.invoiceValue}>{fmt.money(totalAmount)}</dd>
        </div>

        {paidAmount ? (
          <div className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>{tInv('paid')}</dt>
            <dd className={styles.invoiceValue}>{fmt.money(paidAmount)}</dd>
          </div>
        ) : null}

        {/* Phần trả tay chủ xe lúc nhận xe — chỉ có nghĩa khi chuyến thật sự diễn ra. */}
        {completed && finance.payAtPickupAmount != null && paidAmount ? (
          <div className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>{tCommon('components.price.payAtHandover')}</dt>
            <dd className={styles.invoiceValue}>{fmt.money(finance.payAtPickupAmount)}</dd>
          </div>
        ) : null}

        {/* Phụ phí ghi lúc trả xe — đứng riêng, kèm lý do để khách đối chiếu. */}
        {finance.surcharges.map((row, index) => (
          <div key={`${row.category}-${row.recordedAt}-${index}`} className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>
              <span>{dl('surchargeCategory', row.category)}</span>
              <span className={styles.invoiceSub}>
                {tInv('surchargesAfter')}
                {row.reason ? ` · ${row.reason}` : ''}
              </span>
            </dt>
            <dd className={styles.invoiceValue}>{fmt.money(row.amount)}</dd>
          </div>
        ))}

        {refund ? (
          <>
            <div className={styles.invoiceDivider} role="presentation" />
            <div className={styles.invoiceRow}>
              <dt className={styles.invoiceLabel}>{tInv('refundAmount')}</dt>
              <dd className={styles.refundValue}>{fmt.money(refund.amount)}</dd>
            </div>
          </>
        ) : null}

        {status ? (
          <div className={styles.invoiceRow}>
            <dt className={styles.invoiceLabel}>{tInv('status')}</dt>
            <dd className={styles.invoicePill}>
              <TripRequestPill tone={status.tone}>{tInv(`pill.${status.key}`)}</TripRequestPill>
            </dd>
          </div>
        ) : null}
      </dl>

      {refund ? (
        <p className={styles.invoiceNote}>
          {[
            refund.paidAt ? tInv('refundPaidAt', { date: fmt.dateTime(refund.paidAt) }) : null,
            refund.bankReference ? tInv('refundRef', { reference: refund.bankReference }) : null,
            refund.accountHint ? tInv('refundAccount', { hint: refund.accountHint }) : null,
            needsAccount ? tInv('refundNeedsAccount') : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      ) : null}

      {needsAccount && settlement && refund ? (
        <>
          <Button type="primary" block onClick={() => setAccountOpen(true)}>
            {tRefund('submit')}
          </Button>
          {/* Chỉ mount khi ĐÃ MỞ — dialog tự gọi danh sách tài khoản của khách. */}
          {accountOpen ? (
            <RefundAccountDialog
              tripId={settlement.tripId}
              amount={fmt.money(refund.amount)}
              open={accountOpen}
              onClose={() => setAccountOpen(false)}
            />
          ) : null}
        </>
      ) : null}

      {hasDepositToShow(depositStatus) ? (
        <DepositBlock finance={finance} status={depositStatus} />
      ) : null}

      {!isZeroMoney(finance.additionalDue) ? (
        <Alert
          type="warning"
          showIcon
          title={t('additionalDue', { amount: fmt.money(finance.additionalDue) })}
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
