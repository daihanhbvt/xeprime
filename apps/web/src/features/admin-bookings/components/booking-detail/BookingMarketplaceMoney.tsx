'use client';

import { DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  BOOKING_HOLD_OUTCOME_META,
  BOOKING_HOLD_STATUS_META,
  HOLD_REFUND_STATUS_META,
  INSURANCE_POLICY_STATUS_META,
  PERMISSION,
  TAX_WITHHOLDING_STATUS_META,
  type BookingHoldOutcome,
  type BookingHoldStatus,
  type HoldRefundStatus,
  type InsurancePolicyStatus,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FINANCE_QUEUE, financeQueueHref } from '@/features/platform-money/finance-queues';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import { platformCertificatePdfHref } from '../../api';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

type Marketplace = AdminBookingDetail['marketplace'];
type Fees = NonNullable<Marketplace['fees']>;
type Hold = NonNullable<Marketplace['hold']>;

function Row({
  label,
  children,
  variant,
}: {
  label: ReactNode;
  children: ReactNode;
  variant?: 'total' | 'sub';
}) {
  return (
    <div
      className={cx(
        styles.moneyRow,
        variant === 'total' && styles.moneyRowTotal,
        variant === 'sub' && styles.moneyRowSub,
      )}
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className={styles.mpGroup}>
      <h4 id={id} className={styles.mpGroupTitle}>
        {title}
      </h4>
      <dl className={styles.moneyTable} aria-labelledby={id}>
        {children}
      </dl>
    </div>
  );
}

/**
 * Khối "Tiền marketplace" của chi tiết đơn phía nền tảng (đợt rà Admin 16/11/2026) — trả lời
 * "khách đã trả bao nhiêu, chủ xe nhận bao nhiêu, XePrime giữ bao nhiêu" từ bảng phí ĐÃ ĐÓNG BĂNG
 * mà server dựng (ADR 0024). Màn hình không tính lại con số nào.
 *
 * Tách hẳn khỏi "Thanh toán" (tiền của đơn) và "Tài sản bảo đảm" (cọc thế chấp): tiền giữ chỗ khác
 * cọc thế chấp (ADR 0044 điều 9). Chứng từ ngân hàng do SERVER bỏ khi người xem thiếu quyền tiền
 * (`bankTransactions = null`), nên khối đó ẩn hẳn chứ không hiện rỗng.
 */
export function BookingMarketplaceMoney({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.marketplace');
  const titleId = useId();
  const m = booking.marketplace;

  const hasAnything =
    m.fees != null ||
    m.hold != null ||
    m.insurancePolicies.length > 0 ||
    m.taxRows.length > 0 ||
    m.cancellation != null;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <div className={styles.collateralHead}>
        <h3 id={titleId} className={styles.sectionTitle}>
          {t('title')}
        </h3>
        <InfoHint label={t('hintLabel')} content={t('hint')} />
      </div>

      {!hasAnything ? (
        <p className={styles.mpMuted}>{t('none')}</p>
      ) : (
        <div className={styles.mpStack}>
          {m.hold ? <HoldBlock hold={m.hold} /> : null}
          {m.fees ? (
            <FeesBlock fees={m.fees} />
          ) : (
            <p className={styles.mpMuted}>{t('feesUnavailable')}</p>
          )}
          {m.hold?.settlement ? <SettlementBlock settlement={m.hold.settlement} /> : null}
          {m.hold?.refund ? <RefundBlock refund={m.hold.refund} /> : null}
          {m.bankTransactions && m.hold ? (
            <BankBlock transactions={m.bankTransactions} holdCode={m.hold.code} />
          ) : null}
          {m.insurancePolicies.length > 0 ? (
            <InsuranceBlock policies={m.insurancePolicies} />
          ) : null}
          {m.taxRows.length > 0 ? <TaxBlock rows={m.taxRows} /> : null}
          {m.cancellation ? <CancellationBlock cancellation={m.cancellation} /> : null}
        </div>
      )}
    </section>
  );
}

function HoldBlock({ hold }: { hold: Hold }) {
  const t = useTranslations('AdminBookings.marketplace.hold');
  const fmt = useAppFormat();
  return (
    <Group title={t('title')}>
      <Row label={t('code')}>
        <span className={styles.mpCode}>{hold.code}</span>
      </Row>
      <Row label={t('status')}>
        <StatusTag
          value={hold.status as BookingHoldStatus}
          meta={BOOKING_HOLD_STATUS_META}
          group="bookingHoldStatus"
        />
      </Row>
      <Row label={t('outcome')}>
        {hold.outcome ? (
          <StatusTag
            value={hold.outcome as BookingHoldOutcome}
            meta={BOOKING_HOLD_OUTCOME_META}
            group="bookingHoldOutcome"
          />
        ) : (
          <span className={styles.mpMuted}>{t('outcomePending')}</span>
        )}
      </Row>
      <Row label={t('amount')}>{fmt.money(hold.amount)}</Row>
      <Row label={t('paid')}>{fmt.money(hold.paidAmount)}</Row>
      {hold.paidAt ? (
        <Row label={t('paidAt')}>{fmt.dateTime(hold.paidAt)}</Row>
      ) : (
        <Row label={t('expiresAt')}>{fmt.dateTime(hold.expiresAt)}</Row>
      )}
      {hold.freeCancelUntil ? (
        <Row label={t('freeCancelUntil')}>{fmt.dateTime(hold.freeCancelUntil)}</Row>
      ) : null}
      {hold.releasedAt ? <Row label={t('releasedAt')}>{fmt.dateTime(hold.releasedAt)}</Row> : null}
    </Group>
  );
}

function FeesBlock({ fees }: { fees: Fees }) {
  const t = useTranslations('AdminBookings.marketplace');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const minus = (amount: string) => `- ${fmt.money(amount)}`;
  const payout = fees.ownerPayout;
  const hasPromo = !isZeroMoney(fees.promoDiscountAmount);
  const optional = (amount: string, label: string) =>
    isZeroMoney(amount) ? null : <Row label={label}>{fmt.money(amount)}</Row>;

  const taxDetail =
    payout.taxExemptReason != null
      ? t('owner.taxExempt')
      : payout.vatAmount != null && payout.pitAmount != null
        ? t('owner.taxSplit', {
            vat: fmt.money(payout.vatAmount),
            pit: fmt.money(payout.pitAmount),
            sep: LIST_SEPARATOR,
          })
        : null;

  return (
    <div className={styles.mpGrid}>
      <Group
        title={`${t('customer.title')}${LIST_SEPARATOR}${domainLabel('billingMode', fees.billingMode)}`}
      >
        <Row label={t('customer.base')}>{fmt.money(fees.baseAmount)}</Row>
        {isZeroMoney(fees.deliveryAmount) ? null : (
          <Row label={t('customer.delivery')} variant="sub">
            {fmt.money(fees.deliveryAmount)}
          </Row>
        )}
        <Row label={t('customer.serviceFee')}>{fmt.money(fees.serviceFeeAmount)}</Row>
        {optional(fees.vehicleInsuranceAmount, t('customer.vehicleInsurance'))}
        {optional(fees.personalInsuranceAmount, t('customer.personalInsurance'))}
        {optional(fees.insuranceServiceFeeAmount, t('customer.insuranceServiceFee'))}
        {hasPromo ? (
          <Row
            label={
              fees.promoCode
                ? t('customer.promo', { code: fees.promoCode })
                : t('customer.promoNoCode')
            }
          >
            {minus(fees.promoDiscountAmount)}
          </Row>
        ) : null}
        <Row label={t('customer.online')}>{fmt.money(fees.onlineAmount)}</Row>
        <Row label={t('customer.payAtPickup')}>{fmt.money(fees.payAtPickupAmount)}</Row>
        <Row label={t('customer.total')} variant="total">
          {fmt.money(fees.customerTotalAmount)}
        </Row>
      </Group>

      <Group title={t('owner.title')}>
        <Row label={t('owner.rent')}>{fmt.money(payout.rentAmount)}</Row>
        {isZeroMoney(payout.ownerCommissionAmount) ? null : (
          <Row label={t('owner.commission')}>{minus(payout.ownerCommissionAmount)}</Row>
        )}
        <Row label={t('owner.tax')}>
          {isZeroMoney(payout.taxAmount) ? fmt.money(payout.taxAmount) : minus(payout.taxAmount)}
          {taxDetail ? <span className={styles.mpSub}>{taxDetail}</span> : null}
        </Row>
        <Row label={t('owner.net')}>{fmt.money(payout.ownerNetAmount)}</Row>
        <Row label={t('owner.payable')} variant="total">
          {fmt.money(payout.ownerPayableAmount)}
        </Row>
      </Group>

      <Group title={t('platform.title')}>
        <Row label={t('platform.retained')}>{fmt.money(fees.platformRetainedAmount)}</Row>
        {hasPromo ? <Row label={t('platform.promo')}>{minus(fees.promoDiscountAmount)}</Row> : null}
        <Row label={t('platform.net')} variant="total">
          {fmt.money(fees.platformNetAmount)}
        </Row>
      </Group>
    </div>
  );
}

function SettlementBlock({ settlement }: { settlement: NonNullable<Hold['settlement']> }) {
  const t = useTranslations('AdminBookings.marketplace.settlement');
  const fmt = useAppFormat();
  return (
    <Group title={t('title')}>
      <Row label={t('customer')}>{fmt.money(settlement.customerAmount)}</Row>
      <Row label={t('owner')}>{fmt.money(settlement.ownerAmount)}</Row>
      <Row label={t('platform')}>{fmt.money(settlement.platformAmount)}</Row>
      <Row label={t('insurer')}>{fmt.money(settlement.insurerAmount)}</Row>
      <Row label={t('tax')}>{fmt.money(settlement.taxAmount)}</Row>
    </Group>
  );
}

function RefundBlock({ refund }: { refund: NonNullable<Hold['refund']> }) {
  const t = useTranslations('AdminBookings.marketplace.refund');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const account = [refund.bankCode, refund.bankAccountNumber, refund.bankAccountName]
    .filter(Boolean)
    .join(LIST_SEPARATOR);
  return (
    <Group title={t('title')}>
      <Row label={t('status')}>
        <StatusTag
          value={refund.status as HoldRefundStatus}
          meta={HOLD_REFUND_STATUS_META}
          group="holdRefundStatus"
        />
      </Row>
      <Row label={t('amount')}>{fmt.money(refund.amount)}</Row>
      <Row label={t('reason')}>{domainLabel('holdRefundReason', refund.reason)}</Row>
      <Row label={t('mode')}>
        {refund.settlementMode === 'balance' || refund.settlementMode === 'bank_transfer'
          ? t(`modes.${refund.settlementMode}`)
          : refund.settlementMode}
      </Row>
      {refund.paidAt ? <Row label={t('paidAt')}>{fmt.dateTime(refund.paidAt)}</Row> : null}
      {account ? <Row label={t('account')}>{account}</Row> : null}
      {refund.bankReference ? <Row label={t('reference')}>{refund.bankReference}</Row> : null}
    </Group>
  );
}

function BankBlock({
  transactions,
  holdCode,
}: {
  transactions: NonNullable<Marketplace['bankTransactions']>;
  holdCode: string;
}) {
  const t = useTranslations('AdminBookings.marketplace.bank');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const id = useId();
  return (
    <div className={styles.mpGroup}>
      <h4 id={id} className={styles.mpGroupTitle}>
        {t('title')}
      </h4>
      {transactions.length === 0 ? (
        <p className={styles.mpMuted}>{t('empty')}</p>
      ) : (
        <ul className={styles.mpList} aria-labelledby={id}>
          {transactions.map((tx) => (
            <li key={tx.id} className={styles.mpItem}>
              <div className={styles.mpItemMain}>
                <span className={styles.fieldPrimary}>
                  {t('row', {
                    amount: fmt.money(tx.amountIn),
                    time: fmt.dateTime(tx.bankTime ?? tx.createdAt),
                    sep: LIST_SEPARATOR,
                  })}
                </span>
                <span className={styles.mpSub}>
                  {domainLabel('bankMatchStatus', tx.matchStatus)}
                  {LIST_SEPARATOR}
                  {tx.bankReferenceNumber
                    ? t('reference', { ref: tx.bankReferenceNumber })
                    : tCommon('labels.emptyValue')}
                </span>
              </div>
              <Link
                href={financeQueueHref(FINANCE_QUEUE.BANK_IN, {
                  status: tx.matchStatus,
                  q: holdCode,
                  open: tx.id,
                })}
                className={styles.mpAction}
              >
                <ExportOutlined aria-hidden /> {t('open')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsuranceBlock({ policies }: { policies: Marketplace['insurancePolicies'] }) {
  const t = useTranslations('AdminBookings.marketplace.insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  // Endpoint tải GCN gác bằng quyền tiền - người không có quyền không thấy nút dẫn tới 403.
  const canDownload = has(PERMISSION.PLATFORM_MONEY_MANAGE);
  const id = useId();
  return (
    <div className={styles.mpGroup}>
      <h4 id={id} className={styles.mpGroupTitle}>
        {t('title')}
      </h4>
      <ul className={styles.mpList} aria-labelledby={id}>
        {policies.map((p) => (
          <li key={p.id} className={styles.mpItem}>
            <div className={styles.mpItemMain}>
              <span className={styles.inline}>
                <span className={styles.fieldPrimary}>
                  {domainLabel('insuranceProductKind', p.productKind)}
                </span>
                <StatusTag
                  value={p.status as InsurancePolicyStatus}
                  meta={INSURANCE_POLICY_STATUS_META}
                  group="insurancePolicyStatus"
                />
                {p.isTest ? <Tag>{t('test')}</Tag> : null}
              </span>
              <span className={styles.mpSub}>
                {fmt.money(p.premiumAmount)}
                {LIST_SEPARATOR}
                {p.partnerName}
                {p.certificateNumber
                  ? `${LIST_SEPARATOR}${t('certificate', { number: p.certificateNumber })}`
                  : ''}
              </span>
            </div>
            {canDownload && p.certificateDownloadable ? (
              <a href={platformCertificatePdfHref(p.id)} className={styles.mpAction}>
                <DownloadOutlined aria-hidden /> {t('download')}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaxBlock({ rows }: { rows: Marketplace['taxRows'] }) {
  const t = useTranslations('AdminBookings.marketplace.tax');
  const fmt = useAppFormat();
  const id = useId();
  return (
    <div className={styles.mpGroup}>
      <h4 id={id} className={styles.mpGroupTitle}>
        {t('title')}
      </h4>
      <ul className={styles.mpList} aria-labelledby={id}>
        {rows.map((r) => (
          <li key={r.id} className={styles.mpItem}>
            <div className={styles.mpItemMain}>
              <span className={styles.inline}>
                <span className={styles.fieldPrimary}>{fmt.money(r.amount)}</span>
                <StatusTag
                  value={r.status as TaxWithholdingStatus}
                  meta={TAX_WITHHOLDING_STATUS_META}
                  group="taxWithholdingStatus"
                />
                {r.isReversal ? <Tag>{t('reversal')}</Tag> : null}
                {r.isExtension ? <Tag>{t('extension')}</Tag> : null}
              </span>
              <span className={styles.mpSub}>
                {/* Kỳ `YYYY-MM` là tháng lịch Việt Nam - mốc 00:00 +07 của ngày 1 rơi đúng tháng đó. */}
                {t('period', {
                  period: fmt.monthYear(new Date(`${r.periodKey}-01T00:00:00+07:00`)),
                })}
                {r.vatAmount != null && r.pitAmount != null
                  ? `${LIST_SEPARATOR}${t('split', {
                      vat: fmt.money(r.vatAmount),
                      pit: fmt.money(r.pitAmount),
                      sep: LIST_SEPARATOR,
                    })}`
                  : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CancellationBlock({
  cancellation,
}: {
  cancellation: NonNullable<Marketplace['cancellation']>;
}) {
  const t = useTranslations('AdminBookings.marketplace.cancellation');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  return (
    <Group title={t('title')}>
      <Row label={t('party')}>
        {domainLabel('cancellationParty', cancellation.responsibleParty)}
      </Row>
      <Row label={t('category')}>
        {domainLabel('cancellationReasonCategory', cancellation.reasonCategory)}
      </Row>
      <Row label={t('stage')}>{domainLabel('cancellationStage', cancellation.stage)}</Row>
      {cancellation.reason ? <Row label={t('reason')}>{cancellation.reason}</Row> : null}
      <Row label={t('at')}>{fmt.dateTime(cancellation.cancelledAt)}</Row>
    </Group>
  );
}
