'use client';

import { Checkbox } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_COUNTDOWN_URGENT_MINUTES,
  isFreeCancelWindowShort,
  holdRemainingMs,
  isAwaitingPayment,
  type BookingHoldStatus,
} from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { InfoHint } from '@/components/data-display/InfoHint';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { paymentPath } from '@/constants/routes';
import { BookingJourney } from '@/features/booking-requests/components/BookingJourney';
import { BookingReviewCosts } from '@/features/booking-requests/components/BookingReviewCosts';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { TripGatewayReturn } from '@/features/payment-gateway/components/TripGatewayReturn';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { payAtPickupAmount } from '@/lib/customer-price-view';
import type { CustomerTripDetail } from '../types';
import { TripPageHeader, useTripFlowCrumbs } from './TripPageHeader';
import { TripHoldPanel } from './TripHoldPanel';
import {
  TripPlanChangeCard,
  TripRequestLayout,
  TripRequestPill,
  TripRequestStatusCard,
  useTripRequestData,
} from './TripRequestLayout';
import layout from './TripRequestLayout.module.css';
import styles from './TripAwaitingHoldView.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

const SEGMENT_MS = HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000;

/**
 * Chuyến của KHÁCH đã được chủ xe nhận, chờ khách trả tiền giữ chỗ — Figma `19737:23904` (khung PC
 * 1440), hai cột:
 *
 *  - TRÁI (`19737:23918`): khung chung `TripRequestLayout` — trạng thái "chủ xe đã đồng ý" · thẻ
 *    chuyến · tiến trình (đang ở mốc "Hoàn tất giữ chỗ") · người thuê · giấy tờ.
 *  - PHẢI (`19737:24012`): khoản giữ chỗ cần thực hiện (số tiền, đồng hồ, xác nhận chính sách, nút
 *    thanh toán) · chi phí · các khoản khác ("Cần thanh toán") · cần thay đổi kế hoạch.
 *
 * Ranh giới nghiệp vụ, đều do SERVER quyết — màn này chỉ đọc:
 *  - `awaiting_hold` = ĐÃ được nhận, đã chiếm lịch, chờ khách trả (ADR 0044). Đơn thuê ra đời DUY
 *    NHẤT khi đối soát xác nhận đủ tiền — không vì một cú bấm nào ở đây. Nút chỉ DẪN sang trang
 *    thanh toán (`/payment/:id`, nơi duy nhất có kênh trả); tiền về thì realtime làm mới chuyến và
 *    trang tự sang chặng kế tiếp. Không có nút "Tôi đã chuyển khoản".
 *  - Cửa sổ thanh toán 120′ tính từ lúc nhận, KHÔNG gia hạn (ADR 0044 điều 3): đồng hồ đếm xuống
 *    `expiresAt` của server; hết giờ thì nút khoá. Cửa chặn thật là `expires_at` ở server.
 *  - Hình thức thiết kế không có đồng hồ lẫn nút nhắn tin; cả hai được thêm vào có chủ đích: hạn trả
 *    là điều khách PHẢI biết trước khi làm gì khác, còn kênh chat trong sàn mở cho mọi khách đã gửi
 *    yêu cầu (`ChatService.canCustomerOpenChat`) — nó là lối phụ nên đứng ở "Cần thay đổi kế hoạch?".
 *  - Khoản giữ chỗ đã khép (hết hạn, huỷ, có hoàn) mà chặng chưa kịp đổi ⇒ khối kết cục của
 *    `TripHoldPanel` (kể cả ô khai tài khoản nhận hoàn), không phải một nút trả tiền chết.
 */
export function TripAwaitingHoldView({
  trip,
  backHref,
}: {
  trip: CustomerTripDetail;
  /** Đích của nút quay lại ở đầu trang — danh sách chuyến của người đang xem. */
  backHref: string;
}) {
  const t = useTranslations('Trips.awaitingHold');
  const tDetail = useTranslations('Trips.detail');
  const tFlow = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const data = useTripRequestData(trip);
  const crumbs = useTripFlowCrumbs(trip.vehicle.id);

  const hold = trip.hold ?? null;
  /** Khoản giữ chỗ còn chờ tiền — chỉ lúc đó mới có việc "thanh toán ngay". */
  const awaitingHold = hold && isAwaitingPayment(hold.status as BookingHoldStatus) ? hold : null;
  const fees = trip.estimate?.fees ?? null;

  // Chuyến sát giờ: cửa sổ huỷ miễn phí bị kẹp bởi giờ nhận xe (ADR 0032 điều 5).
  const policyBody = awaitingHold
    ? t(isFreeCancelWindowShort(awaitingHold) ? 'policy.bodySoon' : 'policy.body', {
        time: fmt.dateTime(awaitingHold.freeCancelUntil),
      })
    : t('policy.bodyClosed');

  return (
    <TripRequestLayout
      trip={trip}
      data={data}
      header={
        <TripPageHeader
          backHref={backHref}
          backLabel={tDetail('back')}
          crumbs={crumbs}
          title={t('page.title')}
          description={t('page.description')}
          aside={<BookingJourney current="payment" hasHoldStage />}
        />
      }
      step="hold"
      /*
       * Chặng này CHẮC CHẮN có khoản giữ chỗ (không thu thì đơn ra đời ngay lúc duyệt — ADR 0044
       * điều 4). Bảng kê thiếu `holdAmount` không được xoá mất chính mốc khách đang đứng.
       */
      hasHoldStage={data.holdStage || hold != null}
      status={
        <TripRequestStatusCard
          tag={dl('customerTripStage', trip.stage)}
          tone="success"
          title={t('status.title')}
          body={
            awaitingHold
              ? t('status.body', {
                  owner: trip.shop.name,
                  time: fmt.dateTime(awaitingHold.expiresAt),
                })
              : t('status.bodyClosed', { owner: trip.shop.name })
          }
        />
      }
    >
      {/*
        Quay về từ MoMo/VNPAY (ADR 0058) bằng liên kết CŨ `/trips/:id?paymentOrder=` — lượt mở trước
        13/10/2026. Không có tham số thì khối tự im lặng.
      */}
      <TripGatewayReturn tripId={trip.id} />

      {awaitingHold ? (
        <HoldPaymentCard
          tripId={trip.id}
          hold={awaitingHold}
          payAtPickup={payAtPickupAmount(fees)}
        />
      ) : hold ? (
        <TripHoldPanel
          hold={hold}
          tripId={trip.id}
          tripTotalAmount={fees?.customerTotalAmount ?? null}
          payAtHandoverAmount={fees?.payAtPickupAmount ?? null}
        />
      ) : null}

      {/*
        Số ở đây là số ĐÃ CHỐT lúc chủ xe nhận chuyến (snapshot trên khoản giữ chỗ — ADR 0024), nên
        thẻ không còn gì "tạm tính". Nhãn "Cần thanh toán" chỉ đứng cạnh tiền giữ chỗ khi khoản đó
        thật sự còn chờ tiền.
      */}
      <BookingReviewCosts
        listing={data.listing}
        breakdown={data.breakdown}
        loading={false}
        isDelivery={trip.deliveryRequested}
        listedRows={[]}
        holdTag={
          awaitingHold ? (
            <TripRequestPill tone="info" inline>
              {t('costs.holdTag')}
            </TripRequestPill>
          ) : undefined
        }
        emptyNote={tDetail('priceEmpty')}
        headingLevel={2}
        surface="trip"
        frozen
      />

      <TripPlanChangeCard
        trip={trip}
        body={policyBody}
        actions={
          <ChatWithShopButton
            vehicleId={trip.vehicle.id}
            appearance="cta"
            ctaVariant="neutral"
            block
            label={tFlow('done.chatHost')}
          />
        }
      />
    </TripRequestLayout>
  );
}

/**
 * "Khoản giữ chỗ cần thực hiện" — Figma `19759:19943`. Trả lời đúng ba câu, theo thứ tự khách cần:
 * phải trả bao nhiêu (còn thiếu bao nhiêu nếu đã chuyển một phần), trước khi nào, trả ở đâu.
 *
 * ⚠️ "Tiền giữ chỗ" KHÁC "cọc thế chấp khi nhận xe" (ADR 0044 điều 9) — dấu "i" cạnh tiêu đề nói rõ
 * khác biệt, và câu dẫn nói phần còn lại trả tay chủ xe lúc nhận xe (`B − D`, XePrime không thu hộ).
 *
 * Ô xác nhận chính sách là cổng CỦA GIAO DIỆN (Figma) trước khi rời sang trang thanh toán; nó không
 * ghi gì lên server. Mỗi lần mở trang là một lần xác nhận mới — không lưu.
 */
function HoldPaymentCard({
  tripId,
  hold,
  payAtPickup,
}: {
  tripId: string;
  hold: Hold;
  /** B − D — phần trả TRỰC TIẾP chủ xe lúc nhận xe; `null` khi chuyến không kèm bảng kê. */
  payAtPickup: string | null;
}) {
  const t = useTranslations('Trips.awaitingHold.pay');
  const tHold = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const titleId = useId();
  const [acknowledged, setAcknowledged] = useState(false);

  /*
   * Nhịp một giây — cùng nhịp với đồng hồ ngay dưới số tiền, để nút khoá đúng lúc đồng hồ báo hết
   * hạn chứ không trễ thêm một phút. Hết giờ thì KHÔNG mời trả nữa: tiền về sau `expires_at` không
   * tạo đơn (ADR 0044 điều 7) — chỗ đó có thể đã thuộc về khách khác.
   */
  const now = useNow(1_000);
  const expired = holdRemainingMs(hold.expiresAt, new Date(now)) <= 0;
  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  // Còn thiếu = số phải chuyển − số đã nhận (server kẹp sàn 0) — đúng số nút sẽ mời trả.
  const amount = fmt.money(hold.remainingAmount);
  const submitLabel = t('submit', { amount });

  return (
    <section className={cx(layout.card, styles.payCard)} aria-labelledby={titleId}>
      <div className={styles.payHead}>
        <h2 id={titleId} className={layout.cardTitle}>
          {t('title')}
        </h2>
        <InfoHint content={tHold('vsDepositHint')} label={tHold('vsDepositHintLabel')} />
      </div>

      <p className={styles.amount}>{amount}</p>
      <Countdown
        deadline={hold.expiresAt}
        urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
        segmentMs={SEGMENT_MS}
        labels={{
          remaining: tHold('countdownRemaining'),
          expired: tHold('countdownExpired'),
          segment: (index, total) => tHold('countdownSegment', { index, total }),
        }}
      />

      {underpaid ? (
        <p className={styles.partial}>
          {tHold('partialIntro', { paid: fmt.money(hold.paidAmount) })}
        </p>
      ) : null}

      <p className={layout.cardLead}>
        {expired
          ? tHold('expired')
          : [
              payAtPickup ? t('body', { amount: fmt.money(payAtPickup) }) : t('bodyNoRest'),
              tHold('expires'),
            ].join(' ')}
      </p>

      <Checkbox
        className={styles.ack}
        checked={acknowledged}
        disabled={expired}
        onChange={(event) => setAcknowledged(event.target.checked)}
      >
        {t.rich('acknowledge', {
          // Mở tab mới: rời trang ở đây là mất luôn dấu tích vừa đánh.
          policy: (chunks) => (
            <Link
              href={legalPath.doc(LEGAL_DOC.CANCELLATION)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.ackLink}
            >
              {chunks}
            </Link>
          ),
        })}
      </Checkbox>

      {/*
        Một liên kết thật khi đã mở (mở tab mới được), một nút khoá khi chưa: liên kết không có trạng
        thái "khoá". MỘT nút, không phải mã QR thứ hai — trang thanh toán là nơi duy nhất có đủ kênh
        trả và là nơi cổng quay về.
      */}
      {acknowledged && !expired ? (
        <CtaButton href={paymentPath.trip(tripId)} size="form" block>
          {submitLabel}
        </CtaButton>
      ) : (
        <CtaButton size="form" block disabled>
          {submitLabel}
        </CtaButton>
      )}
    </section>
  );
}
