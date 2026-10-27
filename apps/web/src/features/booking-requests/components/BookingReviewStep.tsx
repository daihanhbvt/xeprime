'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Form } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';
import { BOOKING_REQUEST_NOTE_MAX_LENGTH, HOLD_PAYMENT_WINDOW_MINUTES } from '@xeprime/types';
import { CheckboxField } from '@/components/form/CheckboxField';
import { TextAreaField } from '@/components/form/TextAreaField';
import type { DriverLicence } from '@/features/driver-licence/types';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import type { CustomerDepositView } from '../hooks/use-customer-cost-view';
import type { RequestFormValues } from '../schema';
import { BookingRenterCard } from './BookingRenterCard';
import { BookingRequirementsCard } from './BookingRequirementsCard';
import { BookingTripCard, type BookingTrip } from './BookingTripCard';
import styles from './BookingReviewStep.module.css';

/** Sau khi gửi thì chuyện gì xảy ra — server biết, không suy theo dịch vụ ở đây. */
export type BookingReviewNextStep = 'instantHold' | 'instantConfirmed' | 'hold' | 'general';

interface BookingReviewStepProps {
  listing: PublicListingDetail | null;
  vehicleName: string;
  vehicleImageUrl: string | null;
  trip: BookingTrip;
  /** Quãng đường + phí giao DỰ KIẾN (`DeliveryEstimate`) — chỉ khi giao tận nơi. */
  deliveryEstimate?: ReactNode;
  /** Tài khoản đang đăng nhập — họ tên + SĐT đã xác minh mà server sẽ ghi vào yêu cầu (ADR 0060). */
  renter: CurrentUser | null;
  control: Control<RequestFormValues>;
  /** `current` = bằng ĐÃ XÁC THỰC của tài khoản (bước bằng lái đã soát nó hợp lệ cho chuyến). */
  licence: { required: boolean; current: DriverLicence | null };
  /** Điều kiện chủ xe công bố cho đúng dịch vụ đang chọn (giấy tờ, điều khoản). */
  hostTerms: { text: string | null; documents: string[] } | null;
  /** Cọc thế chấp khi nhận xe — vẽ trong thẻ giấy tờ & điều kiện, không ở thẻ tiền. */
  deposit: CustomerDepositView | null;
  /**
   * Ô đồng ý phủ cả điều khoản thuê của chủ xe (chủ xe có điều khoản) — đổi CÂU của ô cho khớp với
   * thứ payload sẽ khai (`acceptedTerms`).
   */
  agreementCoversHostTerms: boolean;
  /** Thanh tiến trình hành trình (`BookingJourney`). */
  journey: ReactNode;
  /** Hai thẻ tiền (`BookingPriceSummary variant="review"`). */
  costs: ReactNode;
  nextStep: BookingReviewNextStep;
  /** Khách bấm gửi khi chưa tick đồng ý điều khoản. */
  agreementMissing: boolean;
  stepError: string | null;
  submitting: boolean;
  onSubmit: () => void;
}

/**
 * Màn "Xem lại yêu cầu thuê xe" — Figma `19727:55409`. Hai cột:
 *
 * - TRÁI: thẻ chuyến đi (`BookingTripCard`) · người thuê + lời nhắn · giấy tờ.
 * - PHẢI: chi phí · các khoản khác · đồng ý điều khoản + nút gửi · chuyện xảy ra sau khi gửi.
 *
 * Màn này KHÔNG sửa chuyến và không có lối "Chỉnh sửa": chuyến được chọn ở thẻ đặt xe của trang chi
 * tiết (nơi có lịch bận, bản đồ và báo giá sống) — muốn đổi thì khách đóng hộp và chọn lại ở đó.
 * Thứ nhập được ở đây là liên hệ, lời nhắn cho chủ xe và ô đồng ý.
 *
 * Người thuê là TÀI KHOẢN đang đăng nhập (ADR 0060): họ tên và SĐT đã xác minh hiện để soát, không
 * sửa được — server đọc chúng từ tài khoản, không từ payload. Thiết kế vẽ chúng thành ô nhập; ở
 * đây chúng là giá trị chỉ-đọc vì một ô sửa được mà server bỏ qua là nói dối khách.
 *
 * Tiền do `BookingPriceSummary` dựng từ báo giá server — component này không cộng trừ gì.
 */
export function BookingReviewStep({
  listing,
  vehicleName,
  vehicleImageUrl,
  trip,
  deliveryEstimate,
  renter,
  control,
  licence,
  hostTerms,
  deposit,
  agreementCoversHostTerms,
  journey,
  costs,
  nextStep,
  agreementMissing,
  stepError,
  submitting,
  onSubmit,
}: BookingReviewStepProps) {
  const t = useTranslations('BookingRequests.flow');

  return (
    <div className={styles.review}>
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <h2 className={styles.title}>{t('reviewPage.title')}</h2>
          <p className={styles.lead}>{t('reviewPage.description')}</p>
        </div>
        {journey}
      </header>

      <div className={styles.columns}>
        {/* ── Cột trái: chuyến · người thuê · giấy tờ ─────────────────────────────────── */}
        <div className={styles.main}>
          <BookingTripCard
            listing={listing}
            vehicleName={vehicleName}
            vehicleImageUrl={vehicleImageUrl}
            trip={trip}
            variant="review"
            showMileage
          >
            {deliveryEstimate}
          </BookingTripCard>

          {/*
            Màn này chỉ tới được khi đã có phiên; phiên mất giữa chừng (đăng xuất ở tab khác) thì
            lượt gửi trả 401 và luồng mời đăng nhập lại — thẻ không dựng khung chờ cho `renter`.
          */}
          <BookingRenterCard renter={renter} control={control}>
            {/* Nhãn nằm TRÊN ô như thiết kế — `Form.Item` đứng một mình mặc định đặt nhãn bên trái. */}
            <Form component={false} layout="vertical" colon={false}>
              <TextAreaField
                control={control}
                name="note"
                label={t('reviewPage.renter.noteLabel')}
                placeholder={t('reviewPage.renter.notePlaceholder')}
                rows={2}
                maxLength={BOOKING_REQUEST_NOTE_MAX_LENGTH}
              />
            </Form>
          </BookingRenterCard>

          <BookingRequirementsCard licence={licence} hostTerms={hostTerms} deposit={deposit} />
        </div>

        {/* ── Cột phải: tiền · đồng ý + gửi · sau khi gửi ─────────────────────────────── */}
        <div className={styles.aside}>
          {costs}

          <section className={cx(styles.card, styles.submitCard)}>
            <CheckboxField control={control} name="acceptedTerms">
              <LegalConsentNote
                as="span"
                place={agreementCoversHostTerms ? 'bookingCheckHost' : 'bookingCheck'}
                className={styles.agreement}
              />
            </CheckboxField>
            {agreementMissing ? (
              <p className={styles.agreementError} role="alert">
                {t('reviewPage.submit.agreementRequired')}
              </p>
            ) : null}
            {stepError ? <Alert type="error" showIcon title={stepError} role="alert" /> : null}
            <CtaButton variant="gradient" size="form" block loading={submitting} onClick={onSubmit}>
              {t('reviewPage.submit.cta')}
            </CtaButton>
            <p className={styles.submitHint}>{t('reviewPage.submit.hint')}</p>
          </section>

          <section className={styles.next} aria-label={t('reviewPage.next.title')}>
            <p className={styles.nextTitle}>
              <InfoCircleOutlined aria-hidden />
              <span>{t('reviewPage.next.title')}</span>
            </p>
            <p className={styles.nextBody}>
              {nextStep === 'instantHold'
                ? t('reviewPage.next.instant')
                : nextStep === 'instantConfirmed'
                  ? t('reviewPage.next.instantConfirmed')
                  : nextStep === 'hold'
                    ? t('reviewPage.next.hold', { minutes: HOLD_PAYMENT_WINDOW_MINUTES })
                    : t('reviewPage.next.general')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
