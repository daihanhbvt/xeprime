'use client';

import { LeftOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import {
  BookingResult,
  BookingResultTotal,
  bookingResultDialogClassNames,
} from '@/features/booking-requests/components/BookingResult';
import { BookingTripCard } from '@/features/booking-requests/components/BookingTripCard';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useListingDetail } from '@/features/marketplace/hooks/use-listing-detail';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { payAtPickupAmount } from '@/lib/customer-price-view';
import { tripToBookingTrip } from '../booking-trip-view';
import type { CustomerTripDetail } from '../types';
import { TripHoldPanel } from './TripHoldPanel';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Hộp "Thanh toán thành công" — Figma `19759:38196` (popup 600 trên trang thanh toán, khung
 * `19759:37953`).
 *
 * Chỉ mở khi CHÍNH khoản giữ chỗ của chuyến đã đủ tiền (server nói — `paidAt`), nghĩa là đơn thuê
 * đã ra đời trong transaction đối soát (ADR 0044 điều 2). Không bao giờ vì một cú bấm hay một lượt
 * quét: tiền về ⇒ thông báo `hold_paid` đẩy qua bản chiếu realtime làm mới chuyến ⇒ hộp này mở.
 *
 * Kể đúng ba điều khách cần ngay lúc đó: đã ghi nhận bao nhiêu và qua KÊNH nào (`paidVia` do server
 * suy — hai kênh trở lên thì không gọi tên kênh), mã để đọc cho tổng đài, và phần còn phải trả
 * TRỰC TIẾP chủ xe lúc nhận xe (`B − D`, XePrime không thu hộ).
 */
export function TripPaymentSuccessDialog({
  trip,
  hold,
  open,
  onClose,
}: {
  trip: CustomerTripDetail;
  hold: Hold;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Trips.payment.success');
  const tFlow = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  // Thường đã nằm sẵn trong cache của luồng đặt xe; tin đã ẩn/gỡ thì thẻ rơi về dữ liệu chuyến.
  const listing = useListingDetail(trip.vehicle.id, { enabled: open }).data ?? null;

  const amount = fmt.money(hold.paidAmount);
  /*
   * Tiền đã về ⇒ đơn đã có ⇒ số đóng băng nằm ở `finance`; bảng kê của khoản giữ chỗ là đường dự
   * phòng cho lúc trang chưa kịp nhận bản chuyến có đơn.
   */
  const payOwner =
    trip.finance?.payAtPickupAmount ?? payAtPickupAmount(trip.estimate?.fees ?? null);

  return (
    <ResponsiveDialog
      hideHeaderTitle
      ariaLabel={t('title')}
      open={open}
      onClose={onClose}
      size="fit"
      footer={null}
      className={bookingResultDialogClassNames.className}
      bodyClassName={bookingResultDialogClassNames.bodyClassName}
    >
      <BookingResult
        title={t('title')}
        lead={
          hold.paidVia
            ? t('lead', { amount, channel: dl('holdPaymentChannel', hold.paidVia) })
            : t('leadNoChannel', { amount })
        }
        code={{
          label: tFlow('done.requestCodeLabel'),
          value: trip.id,
          copyLabel: tFlow('done.copyRequestCode'),
        }}
        footer={
          <>
            {/* Figma: Quay lại · Nhắn tin cho chủ xe · Chuyến của tôi (nút chính). */}
            <CtaButton onClick={onClose} variant="neutral" size="form" iconStart={<LeftOutlined />}>
              {tCommon('actions.back')}
            </CtaButton>
            <ChatWithShopButton
              vehicleId={trip.vehicle.id}
              appearance="cta"
              ctaVariant="neutral"
              label={tFlow('done.chatHost')}
            />
            <CtaButton href={ROUTES.TRIPS} size="form">
              {t('myTrips')}
            </CtaButton>
          </>
        }
      >
        <BookingTripCard
          listing={listing}
          vehicleName={trip.vehicle.name}
          vehicleImageUrl={trip.vehicle.imageUrl ?? null}
          trip={tripToBookingTrip(trip)}
          variant="receipt"
          fallback={{ specs: trip.vehicle, ownerName: trip.shop.name }}
        >
          {payOwner ? (
            <BookingResultTotal label={t('payOwner')} note={t('payOwnerNote')} amount={payOwner} />
          ) : null}
        </BookingTripCard>

        {/*
          Số đã ghi nhận vượt số phải trả (chuyển hai lần) ⇒ nói luôn khoản sẽ được hoàn và mời khai
          tài khoản nhận — cùng khối với trang chuyến (`TripHoldPanel`).
        */}
        {hold.refund ? <TripHoldPanel hold={hold} tripId={trip.id} /> : null}
      </BookingResult>
    </ResponsiveDialog>
  );
}
