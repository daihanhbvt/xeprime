'use client';

import { InfoCircleOutlined, LeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import {
  BOOKING_REQUEST_RESPOND_WINDOW,
  isAwaitingPayment,
  type BookingHoldStatus,
} from '@xeprime/types';
import { paymentPath, tripPath } from '@/constants/routes';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { useTrip } from '@/features/trips/hooks';
import { useQuoteTotal } from '../hooks/use-quote-total';
import type { BookingRequestReceipt } from '../types';
import { BookingResult, BookingResultTotal } from './BookingResult';
import { BookingTripCard, type BookingTrip } from './BookingTripCard';
import styles from './BookingSuccessStep.module.css';

interface BookingSuccessStepProps {
  vehicleId: string;
  listing: PublicListingDetail | null;
  vehicleName: string;
  vehicleImageUrl: string | null;
  /** Chuyến VỪA GỬI — giá trị form lúc bấm gửi, kể lại đúng thứ khách đã soát ở màn Xem lại. */
  trip: BookingTrip;
  /** Phiếu server trả về (`POST /public/booking-requests`). */
  receipt: BookingRequestReceipt;
  /** Báo giá khách đã thấy lúc gửi (đã áp mã); `null` = báo giá không về — bỏ dòng tổng. */
  breakdown: PublicQuote['breakdown'] | null;
  onClose: () => void;
}

/**
 * Hộp "Đã gửi yêu cầu" — Figma `19759:22026` (modal 750 rộng trong khung `19759:21680`, bản vẽ lại
 * 27/10/2026: biểu tượng phong bì, thẻ chuyến hai cột có dòng tổng, ba nút dồn phải).
 *
 * Chỉ dành cho yêu cầu CHƯA cần thanh toán: chuyến được nhận ngay mà có tiền giữ chỗ đã sang trang
 * `/payment/:id` từ `onSuccess` của luồng. Còn lại hai lối ra của `submitPublic`:
 *
 *  - `autoAccepted = false` — yêu cầu nằm ở hàng chờ chủ xe (`pending_host_approval`). Chưa có
 *    giá chốt, chưa giữ lịch, chưa có đơn (ADR 0044 điều 1) ⇒ nói thẳng "xe CHƯA được giữ chỗ" và
 *    hạn phản hồi của chủ xe. Hạn đó là HẰNG SỐ dùng chung với server (`respond_by` tính từ nó) —
 *    hộp chỉ nói độ dài cửa sổ, không tự tính một mốc giờ.
 *  - `autoAccepted = true` — hệ thống đã nhận chuyến và tạo đơn ngay (chuyến không thu tiền giữ
 *    chỗ). Lúc này gọi là "đã gửi yêu cầu" là nói thiếu, nên tiêu đề đổi và không có lời nhắc.
 *
 * Mã yêu cầu là mã khách đọc cho tổng đài, nên nó CHÉP được. Khung hộp (huy hiệu, ô mã, hàng nút)
 * là của chung với hộp "Thanh toán thành công" — `BookingResult`, biến thể `sent`.
 *
 * Lời nhắc "xe chưa được giữ chỗ" không có trong bản vẽ nhưng được GIỮ: thiếu nó, "Đã gửi yêu cầu"
 * đọc như "đã đặt được xe" (ADR 0044 điều 1).
 *
 * Thẻ chuyến là `BookingTripCard` — cùng thẻ với màn Xem lại, và dòng tổng dùng cùng luật đặt tên
 * với thẻ chi phí ở đó (`useQuoteTotal`): khách vừa đọc "Tổng bạn trả" thì không được thấy cùng con
 * số ấy dưới một cái tên khác chỉ vì vừa bấm gửi.
 */
export function BookingSuccessStep({
  vehicleId,
  listing,
  vehicleName,
  vehicleImageUrl,
  trip,
  receipt,
  breakdown,
  onClose,
}: BookingSuccessStepProps) {
  const t = useTranslations('BookingRequests.flow');
  const router = useRouter();
  const total = useQuoteTotal(breakdown);
  const confirmed = receipt.autoAccepted;

  /*
   * Chủ xe duyệt trong lúc hộp còn mở ⇒ sang thẳng trang thanh toán, như chuyến "Đặt ngay".
   *
   * Không cần listener riêng: lượt duyệt phát thông báo `BOOKING_REQUEST_APPROVED` cho khách, bản
   * chiếu huy hiệu (Firebase, REST dự phòng khi không nghe được) đổi số và `refreshNotificationAffected`
   * làm mới nhánh `trips` — gồm chính query này. Chỉ chuyển khi đã có khoản giữ chỗ CHỜ TRẢ: duyệt mà
   * không thu tiền thì đơn ra đời ngay, không có QR nào để trả (ADR 0044 điều 4).
   */
  const tripQ = useTrip(confirmed ? '' : receipt.id);
  const hold = tripQ.data?.hold;
  const awaitingPayment = hold != null && isAwaitingPayment(hold.status as BookingHoldStatus);
  const redirected = useRef(false);
  useEffect(() => {
    if (!awaitingPayment || redirected.current) return;
    redirected.current = true;
    onClose();
    router.push(paymentPath.trip(receipt.id));
  }, [awaitingPayment, onClose, router, receipt.id]);

  /** Chi tiết CHÍNH chuyến vừa gửi — `tripPath` nhận id yêu cầu, chuyến lên đơn rồi vẫn mở đúng. */
  function openTrip() {
    onClose();
    router.push(tripPath.detail(receipt.id));
  }

  return (
    <BookingResult
      variant="sent"
      title={confirmed ? t('done.confirmedTitle') : t('done.title')}
      lead={
        confirmed
          ? t('done.autoAccepted')
          : // Hạn thật (động theo giờ nhận, ADR 0066) hiện ở trang chuyến; ở đây chỉ nói trần.
            t('done.pendingBody', { hours: BOOKING_REQUEST_RESPOND_WINDOW.MAX_MINUTES / 60 })
      }
      code={{
        label: t('done.requestCodeLabel'),
        value: receipt.id,
        copyLabel: t('done.copyRequestCode'),
      }}
      footer={
        <>
          {/*
            Hai nút phụ cùng là `Button` AntD với CÙNG một class: nút nhắn shop sẵn có là `Button`,
            nên dựng "Quay lại" bằng thứ khác thì hai nút đứng cạnh nhau sẽ phản hồi rê chuột hai kiểu.
          */}
          <Button
            size="large"
            icon={<LeftOutlined aria-hidden />}
            onClick={onClose}
            className={styles.secondary}
          >
            {t('done.close')}
          </Button>
          {/*
            Hỏi thêm chủ xe là việc RẤT hay xảy ra ngay sau khi gửi (giao xe ở đâu, có giao sớm hơn
            được không) — nhưng chỉ gian hàng tuyến gói mở hộp thư lúc này. Chủ xe cá nhân chỉ nhắn
            được khi đã có ĐƠN (ADR 0073), nên `ShopChatButton` hỏi server và ẩn hẳn nút. Overlay đóng
            trước khi rời sang khu tin nhắn.
          */}
          {listing ? (
            <ShopChatButton
              shopSlug={listing.shopSlug}
              vehicleId={vehicleId}
              publicChatOpen={listing.shopChatOpen}
              label={t('done.chatHost')}
              size="large"
              className={styles.secondary}
              onNavigate={onClose}
            />
          ) : null}
          <CtaButton variant="gradient" size="form" onClick={openTrip} className={styles.primary}>
            {t('done.viewDetail')}
          </CtaButton>
        </>
      }
    >
      <BookingTripCard
        listing={listing}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleImageUrl}
        trip={trip}
        variant="sent"
      >
        {total ? (
          <BookingResultTotal variant="sent" label={total.label} amount={total.amount} />
        ) : null}
      </BookingTripCard>

      {/*
        Yêu cầu chờ duyệt KHÔNG giữ lịch (ADR 0044 điều 1): xe vẫn nhận yêu cầu của người khác cho
        tới khi chủ xe nhận chuyến này. Thiếu câu này, "Đã gửi yêu cầu" đọc như "đã đặt được xe".
      */}
      {confirmed ? null : (
        <p className={styles.note}>
          <InfoCircleOutlined aria-hidden />
          <span>{t('done.notReserved')}</span>
        </p>
      )}
    </BookingResult>
  );
}
