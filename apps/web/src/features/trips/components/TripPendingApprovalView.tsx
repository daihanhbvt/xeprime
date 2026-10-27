'use client';

import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { BookingJourney } from '@/features/booking-requests/components/BookingJourney';
import { BookingReviewCosts } from '@/features/booking-requests/components/BookingReviewCosts';
import { RespondDeadline } from '@/features/booking-requests/components/RespondDeadline';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { CustomerTripDetail } from '../types';
import { TripPageHeader, useTripDetailCrumbs } from './TripPageHeader';
import {
  TripPlanChangeCard,
  TripRequestLayout,
  TripRequestPill,
  TripRequestStatusCard,
  useTripRequestData,
  REQUEST_SENT_STATUS_IMAGE,
} from './TripRequestLayout';
import styles from './TripPendingApprovalView.module.css';

/**
 * Chuyến của KHÁCH đang chờ chủ xe phản hồi — Figma `19727:60694` (khung PC 1440), hai cột:
 *
 *  - TRÁI (`19727:60708`): trạng thái yêu cầu + hạn phản hồi · thẻ chuyến · tiến trình yêu cầu ·
 *    người thuê + lời nhắn · giấy tờ & điều kiện nhận xe — khung chung `TripRequestLayout`.
 *  - PHẢI (`19727:61097`): chi phí tạm tính + các
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
 *    Tổng chưa chốt mang nhãn "Tổng thanh toán dự kiến"; báo giá còn tạm tính ở mức sâu hơn
 *    (`estimateNote`) thì lý do đó nằm ngay trong chú thích dưới tổng.
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
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const data = useTripRequestData(trip);
  const crumbs = useTripDetailCrumbs(ROUTES.TRIPS);

  return (
    <TripRequestLayout
      trip={trip}
      data={data}
      header={
        <TripPageHeader
          backHref={backHref}
          backLabel={tDetail('back')}
          home={false}
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
          image={REQUEST_SENT_STATUS_IMAGE}
          tag={dl('customerTripStage', trip.stage)}
          tone="warning"
          title={t('status.title')}
          body={
            // Hạn ĐỘNG theo khoảng cách tới giờ nhận (ADR 0066) — đọc mốc server đã lưu, không
            // nói một số phút cố định.
            trip.respondBy
              ? t('status.body', { time: fmt.dateTime(trip.respondBy) })
              : t('status.bodyNoDeadline')
          }
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
          <TripRequestPill tone="warning" inline>
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
