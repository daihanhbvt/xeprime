'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TAX_EXEMPT_REASON, type components } from '@xeprime/types';
import { DeductedAmount } from '@/components/data-display/DeductedAmount';
import { InfoHint } from '@/components/data-display/InfoHint';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { useCommissionTierSummary } from '@/features/fee-policies/hooks/use-tier-range-label';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { isPositiveMoney } from '@/lib/money';
import styles from './OwnerPayoutTable.module.css';

export type OwnerPayout = components['schemas']['OwnerPayoutDto'];

/**
 * BẢNG CỘNG VÍ CHỦ XE (ADR 0068 điều 5 · đặc tả 05 §7.1) — MỘT khối cho hộp duyệt yêu cầu và chi
 * tiết đơn, để hai màn kể cùng một câu chuyện về cùng một chuyến:
 *
 *     Đơn giá thuê · Số ngày thuê
 *     ──────────────
 *     Doanh thu cho thuê xe          R
 *     Phí dịch vụ – Chủ xe (i)      −H     ← ẩn khi H = 0 (tuyến gói)
 *     Thuế khấu trừ (GTGT + TNCN) (i) −T   ← doanh nghiệp: "Không khấu trừ (doanh nghiệp)"
 *     ──────────────
 *     Thu nhập chủ xe (a)            R − H − T
 *     Khách thanh toán trực tiếp (b) R − D − H
 *     Số tiền cộng ví (a − b)        D − T
 *
 * Chỉ HIỆN: mọi con số do server dựng (`ownerPayoutOf`) từ cùng các dòng snapshot, nên ba đẳng thức
 * đúng tới đồng — client không cộng trừ gì, không làm tròn gì (ADR 0069). Chỉ ở phía đối tác/quản
 * trị: khách không bao giờ thấy phí dịch vụ chủ xe hay thuế (ADR 0064 điều 11).
 *
 * Chuyến không thu tiền giữ chỗ online (`collectsHold = false` — báo giá tạm tính): không có khoản
 * nào đi qua XePrime, nên hai dòng (b) và (a − b) không có nghĩa và bị ẩn; nơi gọi tự nói vì sao.
 */
export function OwnerPayoutTable({
  payout,
  label,
  className,
}: {
  payout: OwnerPayout;
  /** Tên khả truy cập của bảng — tiêu đề của khối chứa nó. */
  label?: string;
  className?: string;
}) {
  const t = useTranslations('Bookings.ownerPayout');
  const fmt = useAppFormat();
  const percent = (value: number) => fmt.measure(value);
  const commissionTierSummary = useCommissionTierSummary();
  // Nấc của chính sách ĐÃ ĐÓNG BĂNG cùng chuyến; không có (snapshot cũ) ⇒ câu chung, không số.
  const tierSummary = payout.commissionTiers?.length
    ? commissionTierSummary(payout.commissionTiers)
    : '';

  const hint = (item: string, content: ReactNode) => (
    <InfoHint label={t('hintLabel', { item })} content={content} />
  );

  const exempt = payout.taxExemptReason === TAX_EXEMPT_REASON.COMPANY;
  const showTax = exempt || isPositiveMoney(payout.taxAmount);
  const taxLabel =
    payout.vatPercent != null && payout.pitPercent != null
      ? t('taxSplit', { vat: percent(payout.vatPercent), pit: percent(payout.pitPercent) })
      : payout.taxTotalPercent != null && !exempt
        ? t('taxCombined', { percent: percent(payout.taxTotalPercent) })
        : t('tax');

  return (
    <dl className={cx(styles.root, className)} aria-label={label}>
      {payout.unitAmount != null ? (
        <>
          <Row label={t('unitPrice')} value={fmt.pricePerDay(payout.unitAmount)} />
          <Row label={t('rentalDays')} value={t('rentalDaysValue', { count: payout.rentalDays })} />
        </>
      ) : (
        <Row
          label={t('rentForDays', { count: payout.rentalDays })}
          value={<span className={styles.muted}>{t('variesByDay')}</span>}
        />
      )}

      <Row
        groupStart
        label={
          <>
            {t('revenue')}
            {hint(t('revenue'), t('revenueHint'))}
          </>
        }
        value={fmt.money(payout.rentAmount)}
      />
      {isPositiveMoney(payout.ownerCommissionAmount) ? (
        <Row
          label={
            <>
              {t('commission')}
              {hint(
                t('commission'),
                <>
                  <p className={styles.hintBody}>
                    {tierSummary
                      ? t('commissionHintTiers', { tiers: tierSummary })
                      : t('commissionHintGeneric')}
                  </p>
                  <p className={styles.hintBody}>{t('commissionHintBody')}</p>
                </>,
              )}
            </>
          }
          value={<DeductedAmount value={payout.ownerCommissionAmount} />}
        />
      ) : null}
      {showTax ? (
        <Row
          label={
            <>
              {taxLabel}
              {hint(
                t('tax'),
                <>
                  <p className={styles.hintBody}>{t('taxHint')}</p>
                  {/*
                    `/legal/*` là đường dùng chung MỌI site (proxy `SHARED_PREFIXES`), nên liên kết
                    tương đối mở đúng văn bản ngay trên site đối tác — không cần `crossZoneHref`.
                  */}
                  <Link
                    href={legalPath.doc(LEGAL_DOC.OWNER_TAX)}
                    className={styles.hintLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('taxPolicyLink')}
                  </Link>
                </>,
              )}
            </>
          }
          value={
            exempt ? (
              <span className={styles.muted}>{t('taxExempt')}</span>
            ) : (
              <DeductedAmount value={payout.taxAmount} />
            )
          }
        />
      ) : null}

      <Row groupStart strong label={t('ownerNet')} value={fmt.money(payout.ownerNetAmount)} />
      {payout.collectsHold ? (
        <>
          <Row
            label={
              <>
                {t('payAtPickup')}
                {hint(t('payAtPickup'), t('payAtPickupHint'))}
              </>
            }
            value={fmt.money(payout.payAtPickupRentAmount)}
          />
          <Row
            highlight
            label={
              <>
                {t('walletCredit')}
                {hint(t('walletCredit'), t('walletCreditHint'))}
              </>
            }
            value={fmt.money(payout.ownerPayableAmount)}
          />
        </>
      ) : null}
    </dl>
  );
}

/** Một cặp nhãn–giá trị. `<dt>`/`<dd>` để trình đọc màn hình đọc thành cặp. */
function Row({
  label,
  value,
  groupStart,
  strong,
  highlight,
}: {
  label: ReactNode;
  value: ReactNode;
  groupStart?: boolean;
  strong?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cx(
        styles.row,
        groupStart && styles.groupStart,
        strong && styles.strong,
        highlight && styles.highlight,
      )}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
