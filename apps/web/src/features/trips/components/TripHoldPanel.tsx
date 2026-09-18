'use client';

/* eslint-disable @next/next/no-img-element -- ảnh QR sinh động theo số tiền + mã, không phải
 * asset tĩnh để đi qua next/image; kích thước cố định nên không gây layout shift. */

import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_REFUND_STATUS,
} from '@xeprime/types';
import { buildVietQrUrl } from '@xeprime/domain';
import { Countdown } from '@/components/data-display/Countdown';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { RefundAccountDialog } from './RefundAccountDialog';
import type { CustomerTripDetail } from '../types';
import styles from './TripHoldPanel.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Khoản GIỮ CHỖ của một chuyến, nhìn từ phía KHÁCH — R3, ADR 0028 điều 6–7.
 *
 * Panel này trả lời đúng bốn câu, theo thứ tự khách cần:
 *   1. Phải chuyển bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Nội dung chuyển khoản là gì — MÃ, thứ quyết định tiền khớp vào chuyến nào;
 *   3. Trước khi nào, nếu không thì chỗ được nhả;
 *   4. Phần còn lại trả cho ai (chủ xe, lúc nhận xe — ADR 0028 điều 7A).
 *
 * VietQR mang SẴN số tiền và nội dung (ADR 0016 điều 5): không bao giờ để khách tự gõ mã, vì
 * một ký tự sai là một khoản tiền không khớp được và phải chờ admin xử lý tay.
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

  /*
   * Cửa sổ huỷ miễn phí hẹp hơn cửa sổ trả tiền nghĩa là nó đã bị kẹp bởi giờ nhận xe — chuyến
   * sát giờ. So hai MỐC ĐÃ LƯU của server, không tính lại từ giờ máy khách.
   */
  const freeCancelIsShort =
    new Date(hold.freeCancelUntil).getTime() <= new Date(hold.expiresAt).getTime();

  /*
   * Bức tranh đầy đủ, CÙNG chữ dùng ở bảng "Chi tiết giá" (`PriceBreakdown`) — khách hỏi hoài
   * "chuyển 176k xong thì tổng chuyến/còn lại là bao nhiêu" (phản hồi 18/09/2026) vì trước đây
   * khối này chỉ có một câu văn mơ hồ "phần còn lại trả tay chủ xe", không có con số. Chỉ vẽ khi
   * CẢ HAI số đều có — thiếu một nửa còn tệ hơn không có gì.
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

  const info = hold.paymentInfo;
  const qrUrl = buildVietQrUrl(info, hold.remainingAmount, hold.code);

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <Alert
        type={hold.status === BOOKING_HOLD_STATUS.UNDERPAID ? 'warning' : 'info'}
        showIcon
        title={
          hold.status === BOOKING_HOLD_STATUS.UNDERPAID
            ? t('partialIntro', { paid: fmt.money(hold.paidAmount) })
            : t('intro')
        }
      />

      {summary}

      <div className={styles.body}>
        {/*
          * QR kèm CHÚ THÍCH: một mã vuông không tự nói nó dùng để làm gì, và khách chưa quen
          * chuyển khoản bằng QR sẽ đứng lại ở đúng bước này.
          */}
        {qrUrl ? (
          <figure className={styles.qrWrap}>
            <img
              src={qrUrl}
              alt={t('qrAlt')}
              width={220}
              height={260}
              className={styles.qr}
              loading="lazy"
            />
            <figcaption className={styles.qrCaption}>{t('qrCaption')}</figcaption>
          </figure>
        ) : null}

        <dl className={styles.fields}>
          {info.configured ? (
            <>
              <div className={styles.row}>
                <dt>{t('bank')}</dt>
                <dd>
                  <span>{info.bankCode}</span>
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('accountNumber')}</dt>
                <dd>
                  <b>{info.accountNumber}</b>{' '}
                  {info.accountNumber ? (
                    <CopyButton value={info.accountNumber} label={t('copyAccount')} />
                  ) : null}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('accountName')}</dt>
                <dd>
                  <span>{info.accountName}</span>
                </dd>
              </div>
            </>
          ) : null}
          <div className={styles.row}>
            <dt>{t('amount')}</dt>
            <dd>
              <b className={styles.amount}>{fmt.money(hold.remainingAmount)}</b>{' '}
              <CopyButton value={hold.remainingAmount} label={t('copyAmount')} />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('code')}</dt>
            <dd>
              <b className={styles.code}>{hold.code}</b>{' '}
              <CopyButton value={hold.code} label={t('copyCode')} />
            </dd>
          </div>
        </dl>
      </div>

      {/*
        * Đồng hồ chạy, không phải một dòng "hạn lúc 14:35": cửa sổ chỉ còn 10 phút (ADR 0039
        * điều 2), và một mốc giờ tuyệt đối bắt khách tự trừ nhẩm đúng lúc họ cần hành động nhanh.
        *
        * `segmentMs` bằng đúng cửa sổ nên chỉ có MỘT chặng và nhãn chặng không hiện — giữ tham số
        * lại để cửa sổ dài ra là chia chặng chạy lại ngay, không phải nối lại dây.
        */}
      <Countdown
        deadline={hold.expiresAt}
        urgentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
        segmentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
        labels={{
          remaining: t('countdownRemaining'),
          expired: t('countdownExpired'),
          segment: (index, total) => t('countdownSegment', { index, total }),
        }}
      />
      {/*
        * Ba điều khách cần biết SAU khi đã thấy số tiền, gom thành một danh sách thay vì ba đoạn
        * rời: chúng cùng một loại — điều kiện của khoản tiền vừa nhìn — nên đọc thành một khối
        * nhanh hơn ba khối trôi nổi. Gạch đầu dòng cũng nói cho mắt biết đây là phần phụ, không
        * phải một chỉ dẫn thứ hai cạnh tranh với mã QR.
        *
        * Huỷ miễn phí đếm xuôi từ mốc đặt và bị kẹp bởi giờ nhận xe, nên chuyến sát giờ có cửa
        * sổ ngắn hơn 4 tiếng — ADR 0032 điều 5 bắt cảnh báo điều đó TRƯỚC khi khách trả tiền.
        */}
      <ul className={styles.notes}>
        <li>{t('expires')}</li>
        <li>
          {t(freeCancelIsShort ? 'freeCancelSoon' : 'freeCancel', {
            time: fmt.dateTime(hold.freeCancelUntil),
          })}
        </li>
        {/* Đã có con số thật ở `summary` phía trên thì câu văn mơ hồ này thừa — chỉ giữ khi
            thiếu báo giá kèm theo (tránh nói ra một khoản mà không kèm số). */}
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
