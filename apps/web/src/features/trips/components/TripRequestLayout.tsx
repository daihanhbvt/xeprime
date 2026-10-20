'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useId, useState, type ReactNode } from 'react';
import { canCustomerCancelTrip, serviceRequiresDriverLicence } from '@xeprime/types';
import { SUPPORT_HOTLINE } from '@/constants/contact';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { shopPath } from '@/constants/routes';
import { BookingRenterCard } from '@/features/booking-requests/components/BookingRenterCard';
import { BookingRequirementsCard } from '@/features/booking-requests/components/BookingRequirementsCard';
import { BookingTripCard } from '@/features/booking-requests/components/BookingTripCard';
import { useDriverLicence } from '@/features/driver-licence/hooks/use-driver-licence';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useListingDetail } from '@/features/marketplace/hooks/use-listing-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import { hasHoldStage } from '@/lib/customer-price-view';
import { tripEstimateBreakdown, tripToBookingTrip } from '../booking-trip-view';
import type { CustomerTripDetail } from '../types';
import { CancelTripDialog } from './CancelTripDialog';
import { TripRequestProgress, type TripRequestStep } from './TripRequestProgress';
import styles from './TripRequestLayout.module.css';

/**
 * Khung chung của các màn CHUYẾN phía khách sau khi gửi yêu cầu (design v2):
 *
 *  - chờ chủ xe phản hồi — `TripPendingApprovalView` (Figma `19727:60694`);
 *  - chủ xe đã đồng ý, chờ giữ chỗ — `TripAwaitingHoldView` (Figma `19737:23904`);
 *  - đã xác nhận, chờ ngày nhận xe — `TripConfirmedView` (Figma `19879:72913`).
 *
 * Hai màn YÊU CẦU có CÙNG cột trái (trạng thái · chuyến · tiến trình · người thuê · giấy tờ) —
 * `TripRequestLayout`; màn đã xác nhận ghép từ cùng các mảnh (`TripColumns`, `TripRequestTripCard`,
 * `TripRequestRenterCard`) với checklist nhận xe thay cho tiến trình. Cả ba có cùng khối "Cần thay
 * đổi kế hoạch?" cuối cột phải. Phần chung sống ở đây một lần — bản chép sẽ trôi khỏi nhau ngay lần
 * sửa đầu tiên.
 *
 * Các thẻ của cột trái là của màn "Xem lại yêu cầu" (`BookingTripCard`, `BookingRenterCard`,
 * `BookingRequirementsCard`): khách đọc lại đúng những gì mình đã soát trước khi bấm gửi, trên cùng
 * một khuôn. `h1` của trang là tiêu đề ở `TripPageHeader`, nên mọi thẻ là `h2`.
 *
 * Thẻ riêng của từng màn dùng khung `.card` / `.cardTitle` / `.cardLead` của
 * `TripRequestLayout.module.css` để đứng cùng khuôn với các thẻ còn lại.
 */

/** Những thứ cả hai cột cùng đọc — tính MỘT lần cho một màn. */
export function useTripRequestData(trip: CustomerTripDetail) {
  /*
   * Tin đăng của xe: điểm nhận xe, ảnh chủ xe, điều khoản thuê, hình thức cọc — chuyến không chép
   * những thứ đó lúc gửi. Tin đã ẩn/gỡ (404) thì các thẻ tự rơi về dữ liệu của chính chuyến.
   */
  const listingQ = useListingDetail(trip.vehicle.id);
  const breakdown = trip.estimate ? tripEstimateBreakdown(trip.estimate) : null;
  return {
    listing: listingQ.data ?? null,
    listingLoading: listingQ.isLoading,
    breakdown,
    /** Có khoản giữ chỗ phải trả online sau khi được nhận — CÙNG luật với thanh tiến trình đặt xe. */
    holdStage: hasHoldStage(breakdown),
  };
}

export type TripRequestData = ReturnType<typeof useTripRequestData>;

/** Sắc thái nhãn viên thuốc — đúng bốn màu thiết kế dùng trên hai màn. */
export type TripRequestTone = 'warning' | 'success' | 'primary' | 'info';

/** Nhãn viên thuốc (Figma "Request status") — trạng thái yêu cầu, tình trạng khoản giữ chỗ. */
export function TripRequestPill({
  tone,
  inline = false,
  children,
}: {
  tone: TripRequestTone;
  /** Đứng giữa hai dòng chữ (dưới số tiền trong thẻ "Các khoản khác") ⇒ chừa khoảng trên dưới. */
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx(styles.pill, styles[tone], inline && styles.inlinePill)}>{children}</span>
  );
}

/**
 * Thẻ trạng thái đầu cột trái: huy hiệu + nhãn chặng + tiêu đề + một câu giải thích, và chỗ cho phần
 * riêng của từng màn (đồng hồ hạn phản hồi, lời nhắc, lối "Xem hướng dẫn nhận xe").
 *
 * Tiêu đề là `h2`: `h1` của trang là tiêu đề ở `TripPageHeader`.
 *
 * `variant="confirmed"` — chuyến đã xác nhận (Figma `19759:40235`): nền `Status/success-25`, viền NÉT
 * ĐỨT `Status/success-500`, đệm 24. Hai màn còn lại là khung thẻ thường.
 */
export function TripRequestStatusCard({
  tag,
  tone,
  title,
  body,
  variant = 'default',
  children,
}: {
  /** Nhãn CHẶNG — cùng từ vựng với danh sách chuyến (`Domain`, ADR 0005). */
  tag: string;
  tone: TripRequestTone;
  title: string;
  body: string;
  variant?: 'default' | 'confirmed';
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      className={cx(styles.card, variant === 'confirmed' && styles.statusConfirmed)}
      aria-labelledby={titleId}
    >
      <div className={styles.statusHead}>
        {/*
          Huy hiệu là TRANG TRÍ — tiêu đề ngay cạnh đã nói đúng điều nó nói. Ba màn dùng CÙNG một
          ảnh (Figma `6b95c.png` ở `19727:61071`, `19737:23919` và `19759:40237`).
        */}
        <Image
          src="/booking/request-sent.webp"
          alt=""
          width={64}
          height={64}
          className={styles.statusBadge}
        />
        <div className={styles.statusCopy}>
          <TripRequestPill tone={tone}>{tag}</TripRequestPill>
          <h2 id={titleId} className={styles.statusTitle}>
            {title}
          </h2>
        </div>
      </div>
      <p className={styles.cardLead}>{body}</p>
      {children}
    </section>
  );
}

/**
 * Khung hai cột của các màn chuyến (design v2): đầu trang, cột trái `Booking information` (748 rộng
 * trên khung 1440) và cột phải `Costs and actions` (420 rộng).
 */
export function TripColumns({
  header,
  main,
  aside,
}: {
  /** `TripPageHeader` của màn. */
  header: ReactNode;
  main: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className={styles.view}>
      {header}
      <div className={styles.columns}>
        <div className={styles.main}>{main}</div>
        <div className={styles.aside}>{aside}</div>
      </div>
    </div>
  );
}

/**
 * Thẻ "Thông tin chuyến đi" của chuyến đã gửi — chính thẻ của màn "Xem lại yêu cầu"
 * (`BookingTripCard`, bố cục `review`), đọc từ chuyến (`GET /trips/:id`) + tin đăng của xe.
 */
export function TripRequestTripCard({
  trip,
  data,
  ownerAction,
}: {
  trip: CustomerTripDetail;
  data: TripRequestData;
  /** Lối liên hệ cạnh tên chủ xe — chỉ màn chuyến đã xác nhận có (Figma `19879:73257`). */
  ownerAction?: ReactNode;
}) {
  /*
   * Chờ tin đăng lần đầu (thường đã nằm sẵn trong cache của luồng đặt xe): khung chờ thay vì vẽ thẻ
   * dự phòng rồi nhảy sang bản đầy đủ — điểm nhận xe sẽ đổi chữ ngay trước mắt khách.
   */
  if (data.listingLoading) {
    return (
      <section className={styles.card} aria-busy="true">
        <Skeleton active paragraph={{ rows: 5 }} />
      </section>
    );
  }
  return (
    <BookingTripCard
      listing={data.listing}
      vehicleName={trip.vehicle.name}
      vehicleImageUrl={trip.vehicle.imageUrl ?? null}
      trip={tripToBookingTrip(trip)}
      variant="review"
      fallback={{ specs: trip.vehicle, ownerName: trip.shop.name }}
      ownerAction={ownerAction}
      /*
       * Tên chủ xe dẫn tới mặt tiền của họ — lối "Xem gian hàng / Xem chủ xe" của màn chuyến cũ;
       * trang `/shops/:slug` tự vẽ đúng mặt tiền theo tuyến (ADR 0038 điều 1).
       */
      ownerHref={shopPath.detail(trip.shop.slug)}
      headingLevel={2}
    />
  );
}

/**
 * "Thông tin người thuê" chỉ-đọc — đúng liên hệ khách đã để lại cho CHÍNH chuyến này (`contact`,
 * ADR 0063), không phải hồ sơ tài khoản hiện tại: khách có thể đã thuê hộ người nhà.
 */
export function TripRequestRenterCard({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.requestView');
  const me = useCurrentUser().data ?? null;
  return (
    <BookingRenterCard renter={me} contact={trip.contact ?? null} headingLevel={2}>
      <div className={styles.noteField}>
        <span className={styles.noteLabel}>{t('noteLabel')}</span>
        <p className={styles.noteValue}>{trip.customerNote?.trim() || '—'}</p>
      </div>
    </BookingRenterCard>
  );
}

/**
 * Bố cục của hai màn YÊU CẦU (chờ phản hồi · chờ giữ chỗ) + toàn bộ cột trái của chúng. Cột phải
 * (việc chính, chi phí, thay đổi kế hoạch) do từng màn truyền vào qua `children`.
 */
export function TripRequestLayout({
  trip,
  data,
  header,
  step,
  hasHoldStage: holdStage,
  status,
  children,
}: {
  trip: CustomerTripDetail;
  data: TripRequestData;
  /** `TripPageHeader` của màn. */
  header: ReactNode;
  /** Mốc khách đang đứng trên "Tiến trình yêu cầu". */
  step: TripRequestStep;
  /** Thanh tiến trình có mốc "Hoàn tất giữ chỗ" không — xem `TripRequestProgress`. */
  hasHoldStage: boolean;
  /** Thẻ trạng thái đầu cột trái — `TripRequestStatusCard`. */
  status: ReactNode;
  /** Cột phải. */
  children: ReactNode;
}) {
  const me = useCurrentUser().data ?? null;
  const licenceRequired = serviceRequiresDriverLicence(trip.serviceType);
  const licenceQ = useDriverLicence({ enabled: licenceRequired && me !== null });
  const terms =
    data.listing?.rentalTerms?.find((term) => term.serviceType === trip.serviceType) ?? null;

  return (
    <TripColumns
      header={header}
      main={
        <>
          {status}
          <TripRequestTripCard trip={trip} data={data} />
          <TripRequestProgress current={step} hasHoldStage={holdStage} className={styles.card} />
          <TripRequestRenterCard trip={trip} />
          <BookingRequirementsCard
            licence={{ required: licenceRequired, current: licenceQ.data?.verified ?? null }}
            hostTerms={
              terms ? { text: terms.termsText ?? null, documents: terms.requiredDocuments } : null
            }
            headingLevel={2}
          />
        </>
      }
      aside={children}
    />
  );
}

/**
 * "Cần thay đổi kế hoạch?" — cuối cột phải của cả hai màn (Figma `19879:73335` · `19879:73321`):
 * lời nhắc theo chặng, các lối phụ, chính sách huỷ, nút huỷ và hotline.
 *
 * Huỷ là LỐI THOÁT, không phải việc khách vào đây để làm — đứng cuối, viền đỏ, và luôn qua hộp xác
 * nhận. Chỉ hiện khi chặng còn huỷ được (`canCustomerCancelTrip`); cửa chặn thật là
 * `POST /trips/:id/cancel`.
 */
export function TripPlanChangeCard({
  trip,
  body,
  actions,
}: {
  trip: CustomerTripDetail;
  /** Lời nhắc của CHẶNG: huỷ lúc này mất gì, được hoàn gì. */
  body: string;
  /** Lối phụ của riêng màn, đứng trước nút chính sách (ví dụ nhắn tin cho chủ xe). */
  actions?: ReactNode;
}) {
  const t = useTranslations('Trips.requestView.policy');
  const titleId = useId();
  const [cancelOpen, setCancelOpen] = useState(false);
  const canCancel = canCustomerCancelTrip(trip.stage);

  return (
    <section className={styles.policy} aria-labelledby={titleId}>
      <div className={styles.policyCopy}>
        <h2 id={titleId} className={styles.policyTitle}>
          {t('title')}
        </h2>
        <p className={styles.policyBody}>{body}</p>
      </div>
      {actions}
      <CtaButton href={legalPath.doc(LEGAL_DOC.CANCELLATION)} variant="neutral" size="form" block>
        {t('view')}
      </CtaButton>
      {canCancel ? (
        <CtaButton variant="danger" size="form" block onClick={() => setCancelOpen(true)}>
          {t('cancel')}
        </CtaButton>
      ) : null}
      <p className={styles.hotline}>
        {t.rich('hotline', {
          phone: SUPPORT_HOTLINE.display,
          // Số tổng đài là dữ liệu — thẻ `tel` bọc nó thành liên kết gọi được.
          tel: (chunks) => (
            <a href={`tel:${SUPPORT_HOTLINE.tel}`} className={styles.hotlineLink}>
              {chunks}
            </a>
          ),
        })}
      </p>

      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi của lần trước sang. */}
      {cancelOpen ? (
        <CancelTripDialog trip={trip} open onClose={() => setCancelOpen(false)} />
      ) : null}
    </section>
  );
}
