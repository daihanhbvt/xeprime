'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  HOLD_PAYMENT_WINDOW_MINUTES,
} from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { BookingJourney } from '@/features/booking-requests/components/BookingJourney';
import { BookingReviewCosts } from '@/features/booking-requests/components/BookingReviewCosts';
import { RespondDeadline } from '@/features/booking-requests/components/RespondDeadline';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { CustomerTripDetail } from '../types';
import { TripPageHeader, useTripFlowCrumbs } from './TripPageHeader';
import {
  TripPlanChangeCard,
  TripRequestLayout,
  TripRequestPill,
  TripRequestStatusCard,
  useTripRequestData,
} from './TripRequestLayout';
import layout from './TripRequestLayout.module.css';
import styles from './TripPendingApprovalView.module.css';

/**
 * Chuyến của KHÁCH đang chờ chủ xe phản hồi — Figma `19727:60694` (khung PC 1440), hai cột:
 *
 *  - TRÁI (`19727:60708`): trạng thái yêu cầu + hạn phản hồi · thẻ chuyến · tiến trình yêu cầu ·
 *    người thuê + lời nhắn · giấy tờ & điều kiện nhận xe — khung chung `TripRequestLayout`.
 *  - PHẢI (`19727:61097`): theo dõi yêu cầu (nhắn chủ xe, tìm xe khác) · chi phí tạm tính + các
 *    khoản khác · cần thay đổi kế hoạch (chính sách huỷ, huỷ chuyến, hotline).
 *
 * Ranh giới nghiệp vụ, đều do SERVER quyết — màn này chỉ đọc:
 *  - Yêu cầu chờ duyệt KHÔNG giữ lịch, KHÔNG thu tiền (ADR 0044 điều 1): không có QR, không có số
 *    phải trả; tiền giữ chỗ mang nhãn "Chưa cần thanh toán".
 *  - Nhắn tin KHÔNG theo `canContact`: cờ đó gác SĐT/biển số (chỉ mở khi đã có đơn — ADR 0028 điều
 *    9, ADR 0056), còn kênh chat trong sàn mở cho mọi khách đã gửi yêu cầu tới gian hàng
 *    (`ChatService.canCustomerOpenChat`) — đúng trường hợp của màn này, như hộp "Đã gửi yêu cầu".
 *  - Huỷ theo `canCustomerCancelTrip`; cửa chặn thật là `POST /trips/:id/cancel`.
 *  - Bảng giá là TẠM TÍNH theo chính sách đang hiệu lực; số chốt sinh ra lúc duyệt (ADR 0024).
 *    Báo giá còn tạm tính ở mức sâu hơn (`estimateNote`) thì tổng mang nhãn "Tạm tính".
 */
export function TripPendingApprovalView({
  trip,
  backHref,
}: {
  trip: CustomerTripDetail;
  /** Đích của nút quay lại ở đầu trang — danh sách chuyến của người đang xem. */
  backHref: string;
}) {
  const t = useTranslations('Trips.pending');
  const tDetail = useTranslations('Trips.detail');
  const tFlow = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const trackId = useId();
  const data = useTripRequestData(trip);
  const crumbs = useTripFlowCrumbs(trip.vehicle.id);

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
          aside={<BookingJourney current="request" hasHoldStage={data.holdStage} />}
        />
      }
      step="response"
      hasHoldStage={data.holdStage}
      status={
        <TripRequestStatusCard
          tag={dl('customerTripStage', trip.stage)}
          tone="warning"
          title={t('status.title')}
          body={t('status.body', { minutes: BOOKING_REQUEST_RESPOND_WINDOW_MINUTES })}
        >
          {/*
            Hạn phản hồi là mốc của SERVER (`respond_by`); đồng hồ chỉ đếm xuống tới nó. Hết hạn
            mà màn chưa kịp đổi chặng thì đồng hồ tự nói "đã quá hạn" — worker đóng yêu cầu sau đó.
          */}
          {trip.respondBy ? <RespondDeadline respondBy={trip.respondBy} /> : null}
          {/*
            Yêu cầu chờ duyệt KHÔNG giữ xe (ADR 0044 điều 1). Thiếu câu này, "đã được tiếp nhận"
            đọc như "đã đặt được xe".
          */}
          <p className={styles.guidance}>
            {data.holdStage ? t('status.guidanceHold') : t('status.guidance')}
          </p>
        </TripRequestStatusCard>
      }
    >
      <section className={layout.card} aria-labelledby={trackId}>
        <h2 id={trackId} className={layout.cardTitle}>
          {t('track.title')}
        </h2>
        <p className={layout.cardLead}>
          {data.holdStage
            ? t('track.bodyHold', { minutes: HOLD_PAYMENT_WINDOW_MINUTES })
            : t('track.body')}
        </p>
        <ChatWithShopButton
          vehicleId={trip.vehicle.id}
          appearance="cta"
          block
          label={tFlow('done.chatHost')}
        />
        <CtaButton href={ROUTES.SEARCH} variant="neutral" size="form" block>
          {t('track.findOther')}
        </CtaButton>
      </section>

      {/*
        Không báo giá được (xe thiếu giá, dài hạn chưa có gói) ⇒ `breakdown = null`: thẻ nói thẳng
        là chưa có số và giá chính thức có lúc chủ xe xác nhận — không mời "liên hệ báo giá" nữa.
      */}
      <BookingReviewCosts
        listing={data.listing}
        breakdown={data.breakdown}
        loading={false}
        isDelivery={trip.deliveryRequested}
        listedRows={[]}
        holdTag={
          <TripRequestPill tone="primary" inline>
            {t('costs.holdTag')}
          </TripRequestPill>
        }
        emptyNote={tDetail('priceEmpty')}
        headingLevel={2}
        surface="trip"
      />

      <TripPlanChangeCard trip={trip} body={t('policyBody')} />
    </TripRequestLayout>
  );
}
