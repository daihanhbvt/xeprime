'use client';

import { InfoCircleOutlined, LeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BOOKING_REQUEST_RESPOND_WINDOW_MINUTES } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { ROUTES } from '@/constants/routes';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useQuoteTotal } from '../hooks/use-quote-total';
import type { BookingRequestReceipt } from '../types';
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
 * Hộp "Đã gửi yêu cầu" — Figma `19759:22026` (modal 600 rộng trong khung `19759:21680`).
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
 * Mã yêu cầu là mã khách đọc cho tổng đài, nên nó CHÉP được (`CopyButton`).
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
  const fmt = useAppFormat();
  const router = useRouter();
  const total = useQuoteTotal(breakdown);
  const confirmed = receipt.autoAccepted;

  function openTrips() {
    onClose();
    router.push(ROUTES.TRIPS);
  }

  return (
    <div className={styles.success}>
      <div className={styles.content}>
        <div className={styles.status}>
          {/* Huy hiệu là TRANG TRÍ — tiêu đề ngay dưới đã nói đúng điều nó nói. */}
          <Image
            src="/booking/request-sent.webp"
            alt=""
            width={120}
            height={120}
            className={styles.badge}
          />
          <h2 className={styles.title}>{confirmed ? t('done.confirmedTitle') : t('done.title')}</h2>
          <p className={styles.lead}>
            {confirmed
              ? t('done.autoAccepted')
              : t('done.pendingBody', { minutes: BOOKING_REQUEST_RESPOND_WINDOW_MINUTES })}
          </p>
          <div className={styles.code}>
            <p className={styles.codeText}>
              <span className={styles.codeLabel}>{t('done.requestCodeLabel')}</span>{' '}
              <span className={styles.codeValue}>{receipt.id}</span>
            </p>
            <CopyButton value={receipt.id} label={t('done.copyRequestCode')} />
          </div>
        </div>

        <BookingTripCard
          listing={listing}
          vehicleName={vehicleName}
          vehicleImageUrl={vehicleImageUrl}
          trip={trip}
          variant="receipt"
        >
          {total ? (
            <div className={styles.total}>
              <span className={styles.totalLabel}>{total.label}</span>
              <strong className={styles.totalAmount}>{fmt.money(total.amount)}</strong>
            </div>
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
      </div>

      <footer className={styles.footer}>
        {/*
          Hai nút phụ cùng là `Button` AntD với CÙNG một class: nút nhắn shop sẵn có là `Button`, nên
          dựng "Quay lại" bằng thứ khác thì hai nút đứng cạnh nhau sẽ phản hồi rê chuột hai kiểu.
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
          được không). Nút nhắn shop sẵn có tự lo cả lượt mời đăng nhập lại; overlay đóng trước khi
          rời sang khu tin nhắn.
        */}
        <ChatWithShopButton
          vehicleId={vehicleId}
          label={t('done.chatHost')}
          size="large"
          className={styles.secondary}
          onNavigate={onClose}
        />
        <CtaButton variant="gradient" size="form" onClick={openTrips} className={styles.primary}>
          {t('done.myTrips')}
        </CtaButton>
      </footer>
    </div>
  );
}
