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
import { InfoHint } from '@/components/data-display/InfoHint';
import { useAppFormat } from '@/i18n/use-app-format';
import { RefundAccountDialog } from './RefundAccountDialog';
import type { CustomerTripDetail } from '../types';
import styles from './TripHoldPanel.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * TIỀN GIỮ CHỖ của một chuyến đã được nhận, nhìn từ phía KHÁCH — ADR 0044 điều 2.
 *
 * Panel trả lời đúng bốn câu, theo thứ tự khách cần:
 *   1. Phải chuyển bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Trước khi nào, và hết giờ thì sao;
 *   3. Chuyển thế nào — QR mang sẵn số tiền + MÃ, thứ quyết định tiền khớp vào chuyến nào;
 *   4. Phần còn lại trả cho ai (chủ xe, lúc nhận xe — ADR 0028 điều 7A).
 *
 * ⚠️ **"Tiền giữ chỗ" KHÁC "cọc thế chấp khi nhận xe".** Khoản ở đây chuyển cho XePrime để chốt
 * chuyến và là một phần tiền thuê; cọc thế chấp là tài sản khách đặt lại cho chủ xe lúc nhận xe
 * và lấy về khi trả xe nguyên vẹn (`rental-policies`). Hai khoản có hai chủ, hai thời điểm và
 * hai đường về — nên giao diện gọi tên chúng khác nhau ở mọi chỗ, và dấu "i" nói rõ khác biệt.
 *
 * **Không màn hình nào xác nhận "đã thanh toán" vì khách bấm một nút.** Nút "Tôi đã chuyển
 * khoản" chỉ đổi cách màn hình TRÌNH BÀY sự chờ đợi (và đúng ra thì trang tự hỏi lại server —
 * xem `useTrip`); chuyến chỉ thành đơn khi backend đối soát xác nhận đã nhận đủ tiền.
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

  /**
   * Khách đã bấm "Tôi đã chuyển khoản" — CHỈ là một trạng thái hiển thị.
   *
   * Nó không ghi gì lên server và không rút ngắn hạn nào. Lý do tồn tại: sau khi rời sang app
   * ngân hàng và quay lại, khách cần biết hệ thống đang làm gì với khoản vừa chuyển. Không có
   * nó, màn hình vẫn nói "hãy chuyển khoản" và người ta chuyển lần thứ hai.
   */
  const [declared, setDeclared] = useState(false);
  /** Ảnh QR không tải được (chặn mạng, nhà cung cấp lỗi) — có gì hiện nấy, không im lặng. */
  const [qrFailed, setQrFailed] = useState(false);

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

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
      {/*
        HERO: số tiền và đồng hồ đứng cùng một khối, to nhất màn hình. Đây là hai thứ duy nhất
        khách phải nắm trước khi làm bất cứ việc gì khác; đẩy chúng xuống dưới một đoạn văn là
        cách chắc chắn để người ta bỏ lỡ hạn.
      */}
      <header className={styles.head}>
        <p className={styles.headLabel}>
          {t('title')}
          <InfoHint content={t('vsDepositHint')} label={t('vsDepositHintLabel')} />
        </p>
        <p className={styles.headAmount}>{fmt.money(hold.remainingAmount)}</p>
        {/*
          Đồng hồ chạy, không phải một dòng "hạn lúc 14:35": một mốc giờ tuyệt đối bắt khách tự
          trừ nhẩm đúng lúc họ cần hành động. Hai chặng 60 phút — ranh giới giữa chúng chính là
          mốc hệ thống gửi lời nhắc, nên đồng hồ và thông báo nói cùng một điều.
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
      </header>

      {/*
        MỘT alert duy nhất, và chỉ khi có chuyện bất thường. Trạng thái bình thường ("hãy chuyển
        khoản") đã được nói bằng chính số tiền và mã QR — thêm một dòng nữa là nói lại.
      */}
      {underpaid ? (
        <Alert
          type="warning"
          showIcon
          title={t('partialIntro', { paid: fmt.money(hold.paidAmount) })}
        />
      ) : declared ? (
        <Alert type="info" showIcon title={t('checking')} description={t('checkingBody')} />
      ) : null}

      {summary}

      <div className={styles.body}>
        {/*
          QR kèm CHÚ THÍCH: một mã vuông không tự nói nó dùng để làm gì, và khách chưa quen
          chuyển khoản bằng QR sẽ đứng lại ở đúng bước này.

          Ảnh hỏng hoặc chưa cấu hình tài khoản nhận ⇒ nói thẳng và chỉ sang cột bên phải, nơi
          mọi thứ cần để chuyển tay đều có. Một khung trắng im lặng là chỗ khách bỏ cuộc.
        */}
        {qrUrl && !qrFailed ? (
          <figure className={styles.qrWrap}>
            <img
              src={qrUrl}
              alt={t('qrAlt')}
              width={220}
              height={260}
              className={styles.qr}
              loading="lazy"
              onError={() => setQrFailed(true)}
            />
            <figcaption className={styles.qrCaption}>{t('qrCaption')}</figcaption>
          </figure>
        ) : (
          <p className={styles.qrFallback}>{qrUrl ? t('qrFailed') : t('qrUnavailable')}</p>
        )}

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
            <dt>
              {t('code')}
              <InfoHint content={t('codeHint')} label={t('codeHintLabel')} />
            </dt>
            <dd>
              <b className={styles.code}>{hold.code}</b>{' '}
              <CopyButton value={hold.code} label={t('copyCode')} />
            </dd>
          </div>
        </dl>
      </div>

      {/*
        HAI câu, không phải ba đoạn: hệ quả khi hết giờ, và mốc huỷ miễn phí. Cả hai là điều kiện
        của khoản tiền vừa nhìn, nên chúng đứng ngay dưới nó. Mọi giải thích sâu hơn nằm sau dấu
        "i" ở trên — một khối chữ dài ở đây chỉ đẩy mã QR xuống dưới nếp gấp.

        Huỷ miễn phí đếm xuôi từ mốc chuyến được nhận và bị kẹp bởi giờ nhận xe, nên chuyến sát
        giờ có cửa sổ ngắn hơn 4 tiếng — ADR 0032 điều 5 bắt cảnh báo điều đó TRƯỚC khi trả tiền.
      */}
      <ul className={styles.notes}>
        <li>{t('expires')}</li>
        <li>
          {t(freeCancelIsShort ? 'freeCancelSoon' : 'freeCancel', {
            time: fmt.dateTime(hold.freeCancelUntil),
          })}
        </li>
        {/*
          Phần tiền thuê còn lại: chỉ nói bằng CÂU khi không có con số thật. Có `summary` thì hai
          dòng ở trên đã ghi rõ "Trả chủ xe khi nhận xe" kèm số — nhắc lại bằng một câu mơ hồ là
          nói cùng một điều hai lần, đúng thứ khối này phải tránh.
        */}
        {summary ? null : <li>{t('restAtHandover')}</li>}
      </ul>

      {/*
        "Tôi đã chuyển khoản" KHÔNG xác nhận gì — nó chỉ chuyển màn sang trạng thái chờ đối soát.
        Nút biến mất sau khi bấm: bấm lần thứ hai không làm gì thêm, và một nút vô tác dụng là
        một lời mời hiểu nhầm rằng bấm nữa sẽ nhanh hơn.
      */}
      {declared ? null : (
        <Button block onClick={() => setDeclared(true)}>
          {t('declarePaid')}
        </Button>
      )}
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
