'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_COUNTDOWN_URGENT_MINUTES,
  HOLD_REFUND_STATUS,
} from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { InfoHint } from '@/components/data-display/InfoHint';
import { paymentPath } from '@/constants/routes';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { RefundAccountDialog } from './RefundAccountDialog';
import { useFreeCancelNote } from '../use-free-cancel-note';
import type { CustomerTripDetail } from '../types';
import { FreeCancelCountdown } from './FreeCancelCountdown';
import styles from './TripHoldPanel.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * TIỀN GIỮ CHỖ của một chuyến đã được nhận, nhìn từ phía KHÁCH — ADR 0044 điều 2.
 *
 * Từ 13/10/2026 việc TRẢ nằm ở trang thanh toán riêng (`/payment/:tripId` — `TripPaymentView`):
 * chuyển khoản VietQR và ví điện tử ở cùng một chỗ, và đó cũng là trang cổng chuyển khách về. Khối
 * này ở trang chuyến chỉ còn trả lời ba câu, theo thứ tự khách cần:
 *   1. Phải trả bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Trước khi nào, và hết giờ thì sao;
 *   3. Trả ở đâu — một nút, dẫn sang trang thanh toán.
 *
 * ⚠️ **"Tiền giữ chỗ" KHÁC "cọc thế chấp khi nhận xe".** Khoản ở đây chuyển cho XePrime để chốt
 * chuyến và là một phần tiền thuê; cọc thế chấp là tài sản khách đặt lại cho chủ xe lúc nhận xe
 * và lấy về khi trả xe nguyên vẹn (`rental-policies`). Hai khoản có hai chủ, hai thời điểm và
 * hai đường về — nên giao diện gọi tên chúng khác nhau ở mọi chỗ, và dấu "i" nói rõ khác biệt.
 *
 * Khoản đã khép (đã trả, hết hạn, huỷ, có hoàn) thì khối nói kết cục — `HoldOutcome`.
 *
 * Mọi mốc đọc từ server (`expiresAt`, `freeCancelUntil`) — không tính lại ở client, vì lệch đồng
 * hồ máy khách sẽ rơi đúng vào lúc tiền phụ thuộc vào nó.
 */
export function TripHoldPanel({
  hold,
  tripId,
  tripTotalAmount,
  payAtHandoverAmount,
}: {
  hold: Hold;
  tripId: string;
  /** Tổng khách phải chuẩn bị cả chuyến (đã gồm phụ phí) — null khi chưa có báo giá kèm theo. */
  tripTotalAmount?: string | null;
  /** B − D — phần trả TRỰC TIẾP chủ xe lúc nhận xe, không đi qua khoản giữ chỗ này. */
  payAtHandoverAmount?: string | null;
}) {
  const t = useTranslations('Trips.hold');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

  // Ba trạng thái huỷ miễn phí (không có · ngắn · thường lệ) + hệ quả huỷ muộn — ADR 0064.
  const freeCancelNote = useFreeCancelNote();

  /*
   * Bức tranh đầy đủ, CÙNG chữ dùng ở bảng "Chi tiết giá" (`PriceBreakdown`) — khách hỏi hoài
   * "chuyển 176k xong thì tổng chuyến/còn lại là bao nhiêu" (phản hồi 18/09/2026). Chỉ vẽ khi CẢ
   * HAI số đều có — thiếu một nửa còn tệ hơn không có gì.
   */
  const summary =
    tripTotalAmount != null && payAtHandoverAmount != null ? (
      <dl className={styles.summary}>
        <div className={styles.summaryRow}>
          <dt>{tCommon('components.price.customerTotal')}</dt>
          <dd>{fmt.money(tripTotalAmount)}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{tCommon('components.price.payAtHandover')}</dt>
          <dd className={styles.summaryHighlight}>{fmt.money(payAtHandoverAmount)}</dd>
        </div>
      </dl>
    ) : null;

  if (!awaiting) return <HoldOutcome hold={hold} tripId={tripId} summary={summary} />;

  return (
    <section className={styles.panel} aria-label={t('title')}>
      {/*
        HERO: số tiền và đồng hồ đứng cùng một khối, to nhất khối. Đây là hai thứ duy nhất khách
        phải nắm trước khi làm việc gì khác.
      */}
      <header className={styles.head}>
        <p className={styles.headLabel}>
          {t('title')}
          <InfoHint content={t('vsDepositHint')} label={t('vsDepositHintLabel')} />
        </p>
        <p className={styles.headAmount}>{fmt.money(hold.remainingAmount)}</p>
        <Countdown
          deadline={hold.expiresAt}
          urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
          segmentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
          labels={{
            remaining: t('countdownRemaining'),
            expired: t('countdownExpired'),
            segment: (index, total) => t('countdownSegment', { index, total }),
          }}
        />
        <FreeCancelCountdown hold={hold} />
      </header>

      {underpaid ? (
        <Alert
          type="warning"
          showIcon
          title={t('partialIntro', { paid: fmt.money(hold.paidAmount) })}
        />
      ) : null}

      {summary}

      {/*
        MỘT nút, không phải một mã QR thứ hai: trang thanh toán là nơi duy nhất có đủ kênh trả và là
        nơi cổng quay về. Hai chỗ trả là hai chỗ để số tiền hoặc nội dung chuyển khoản trôi khỏi nhau.
      */}
      <CtaButton
        href={paymentPath.trip(tripId)}
        size="lg"
        block
        className={styles.payLink}
        iconStart={<CreditCardOutlined aria-hidden />}
      >
        {t('payNow')}
      </CtaButton>

      <ul className={styles.notes}>
        <li>{t('expires')}</li>
        <li>{freeCancelNote(hold)}</li>
        {summary ? null : <li>{t('restAtHandover')}</li>}
      </ul>
    </section>
  );
}

/**
 * Hold đã chốt hoặc đã chết — nói kết cục bằng tiếng người, kèm tình trạng hoàn nếu có.
 *
 * Không im lặng ở bất kỳ trạng thái nào: một khoản tiền đã chuyển mà màn hình không nhắc tới là
 * lý do đầu tiên khách gọi hỗ trợ.
 */
function HoldOutcome({
  hold,
  tripId,
  summary,
}: {
  hold: Hold;
  tripId: string;
  summary: ReactNode;
}) {
  const t = useTranslations('Trips.hold');
  const tRefund = useTranslations('BankAccounts.refund');
  const fmt = useAppFormat();
  const [accountOpen, setAccountOpen] = useState(false);
  const refund = hold.refund;

  if (refund) {
    const paid = refund.status === HOLD_REFUND_STATUS.PAID;
    /*
     * Chưa khai tài khoản thì phải có Ô ĐỂ KHAI ngay tại đây, không phải một dòng bảo khách đi
     * liên hệ hỗ trợ. Đây chính là chỗ luồng hoàn tiền tắc trước ADR 0033: admin không bấm được
     * "đã chuyển" vì lệnh chuyển không có đích, mà khách thì không có đường nào cung cấp đích.
     */
    const needsAccount = !paid && !refund.hasAccount;
    return (
      <>
        <Alert
          type={paid ? 'success' : needsAccount ? 'warning' : 'info'}
          showIcon
          title={
            paid
              ? t('refundPaid', { amount: fmt.money(refund.amount) })
              : refund.hasAccount
                ? t('refundPending', { amount: fmt.money(refund.amount) })
                : t('refundNeedsAccount', { amount: fmt.money(refund.amount) })
          }
          action={
            needsAccount ? (
              <Button size="small" type="primary" onClick={() => setAccountOpen(true)}>
                {tRefund('submit')}
              </Button>
            ) : null
          }
        />
        {/*
         * Chỉ mount khi ĐÃ MỞ: dialog đọc danh sách tài khoản của khách, và một màn chuyến
         * bất kỳ có khoản hoàn không nên kéo thêm một lượt gọi API mà người dùng chưa xin.
         */}
        {needsAccount && accountOpen ? (
          <RefundAccountDialog
            tripId={tripId}
            amount={fmt.money(refund.amount)}
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (hold.status === BOOKING_HOLD_STATUS.EXPIRED) {
    return <Alert type="warning" showIcon title={t('expired')} />;
  }
  if (hold.status === BOOKING_HOLD_STATUS.CANCELLED) return null;

  // `paid` / `released`: tiền đã về và chuyến đã có đơn — nói ngắn, chi tiết nằm ở khối tiền.
  return (
    <>
      <Alert type="success" showIcon title={t('paid', { amount: fmt.money(hold.paidAmount) })} />
      {summary}
    </>
  );
}
