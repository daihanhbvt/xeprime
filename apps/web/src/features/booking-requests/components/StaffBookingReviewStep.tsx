'use client';

import { ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import type { CalendarQuote } from '@/features/calendar/types/calendar.types';
import { BookingSourceFields } from '@/features/bookings/components/BookingSourceFields';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { STAFF_BOOKING_NOTE_MAX, type StaffBookingValues } from '../staff-booking-schema';
import { BookingJourney } from './BookingJourney';
import { BookingTripCard, type BookingTrip } from './BookingTripCard';
import { StaffBookingCollateralCard } from './StaffBookingCollateralCard';
import { StaffBookingPriceCard } from './StaffBookingPriceCard';
import { negotiatedTotal } from './staff-booking-money';
import styles from './BookingReviewStep.module.css';
import staffStyles from './StaffBookingCards.module.css';

interface StaffBookingReviewStepProps {
  listing: PublicListingDetail | null;
  vehicleName: string;
  vehicleImageUrl: string | null;
  trip: BookingTrip;
  control: Control<StaffBookingValues>;
  /** Bật/tắt "Giá thoả thuận" (ADR 0109) — luồng cha điền sẵn số từ báo giá khi bật. */
  onToggleNegotiated: (on: boolean) => void;
  /** Báo giá NỘI BỘ (`/calendar/quote`); `null` + `quoteUnavailable` = xe chưa cấu hình giá. */
  quote: CalendarQuote | null;
  quoteLoading: boolean;
  quoteUnavailable: boolean;
  stepError: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onEdit: () => void;
}

/**
 * Màn "Xem lại và tạo đơn thuê" của luồng ĐẶT HỘ — CÙNG khuôn hai cột với màn Xem lại của khách
 * (`BookingReviewStep`, Figma `19727:55409`) và dùng chung stylesheet của nó, để gian hàng và khách
 * nhìn một chuyến theo cùng một cách.
 *
 * - TRÁI: thẻ chuyến (`BookingTripCard`, có "Chỉnh sửa") · thông tin khách thuê + ghi chú nội bộ.
 * - PHẢI: tiền thuê · cọc & thế chấp · chuyện xảy ra sau khi tạo.
 * - ĐÁY (đứng yên, ngoài vùng cuộn): tổng tiền bên trái, "Quay lại" + "Tạo đơn thuê" bên phải - cùng
 *   chỗ với hàng nút của bước Chọn chuyến, không phải cuộn hết cột phải mới thấy nút.
 *
 * Khác màn của khách, và cố ý:
 *  - Họ tên + SĐT là ô NHẬP bắt buộc — khách vãng lai, không có tài khoản nào để đọc (khách thì đọc
 *    từ tài khoản, ADR 0060).
 *  - Không có giấy tờ/điều khoản/ô đồng ý: đó là cam kết của khách với nền tảng; ở đây người bấm là
 *    gian hàng, và gian hàng đối chiếu giấy tờ lúc giao xe.
 *  - Tiền là báo giá nội bộ: không phí sàn, không tiền giữ chỗ, không mã khuyến mãi — đơn lập tay
 *    nằm ngoài chợ. Bật "Giá thoả thuận" thì gian hàng sửa được mọi khoản + phụ phí theo dòng; cọc
 *    tiền và tài sản thế chấp ghi theo từng đơn, nhập khoản nào ghi khoản đó (ADR 0109).
 */
export function StaffBookingReviewStep({
  listing,
  vehicleName,
  vehicleImageUrl,
  trip,
  control,
  onToggleNegotiated,
  quote,
  quoteLoading,
  quoteUnavailable,
  stepError,
  submitting,
  onSubmit,
  onEdit,
}: StaffBookingReviewStepProps) {
  const t = useTranslations('BookingRequests.staffFlow');
  const tFlow = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const [negotiated, base, discount, delivery, extras] = useWatch({
    control,
    name: ['negotiated', 'manualBaseAmount', 'manualDiscount', 'manualDeliveryFee', 'extraCharges'],
  });
  // Tổng ở đáy - CHỈ để hiển thị, cùng phép tính với thẻ "Tiền thuê"; server tính lại lúc tạo đơn.
  const manual = negotiated || quoteUnavailable;
  const total = manual
    ? String(negotiatedTotal({ base, discount, delivery: trip.isDelivery ? delivery : 0, extras }))
    : (quote?.totalAmount ?? null);

  return (
    <div className={cx(staffStyles.reviewShell, staffStyles.tone)}>
      <div className={cx(styles.review, staffStyles.reviewScroll)}>
        <header className={styles.head}>
          <div className={styles.headCopy}>
            <h2 className={styles.title}>{t('review.title')}</h2>
            <p className={styles.lead}>{t('review.description')}</p>
          </div>
          <BookingJourney audience="staff" current="review" />
        </header>

        <div className={styles.columns}>
          <div className={styles.main}>
            <BookingTripCard
              listing={listing}
              vehicleName={vehicleName}
              vehicleImageUrl={vehicleImageUrl}
              trip={trip}
              variant="review"
              showMileage
              showOwner={false}
              selfPickupFallback={t('review.selfPickupBranch')}
              action={
                <button
                  type="button"
                  className={styles.editLink}
                  onClick={onEdit}
                  aria-label={tFlow('reviewPage.trip.editLabel')}
                  disabled={submitting}
                >
                  {tFlow('reviewPage.trip.edit')}
                </button>
              }
            />

            <section className={styles.card} aria-label={t('review.customer.title')}>
              <h3 className={styles.cardTitle}>{t('review.customer.title')}</h3>
              <p className={styles.cardLead}>{t('review.customer.description')}</p>
              {/* Nhãn nằm TRÊN ô như màn của khách — `Form.Item` đứng một mình mặc định đặt nhãn bên trái. */}
              <Form component={false} layout="vertical" colon={false}>
                <div className={staffStyles.customerFields}>
                  <div className={styles.contactInputs}>
                    <TextField
                      control={control}
                      name="customerName"
                      label={t('review.customer.name')}
                      placeholder={t('review.customer.namePlaceholder')}
                      autoComplete="off"
                      required
                    />
                    <TextField
                      control={control}
                      name="customerPhone"
                      type="tel"
                      label={t('review.customer.phone')}
                      placeholder={t('review.customer.phonePlaceholder')}
                      autoComplete="off"
                      required
                    />
                  </div>
                  {/* Nguồn đơn (ADR 0110): khách tới từ kênh nào — nhãn để lọc và thống kê về sau. */}
                  <div className={styles.contactInputs}>
                    <BookingSourceFields
                      control={control}
                      sourceName="source"
                      labelName="sourceLabel"
                    />
                  </div>
                  <TextAreaField
                    control={control}
                    name="note"
                    label={t('review.customer.noteLabel')}
                    placeholder={t('review.customer.notePlaceholder')}
                    rows={2}
                    maxLength={STAFF_BOOKING_NOTE_MAX}
                  />
                </div>
              </Form>
            </section>
          </div>

          <div className={styles.aside}>
            <StaffBookingPriceCard
              control={control}
              quote={quote}
              quoteLoading={quoteLoading}
              quoteUnavailable={quoteUnavailable}
              isDelivery={trip.isDelivery}
              onToggleNegotiated={onToggleNegotiated}
            />
            <StaffBookingCollateralCard control={control} />

            <section className={styles.next} aria-label={t('review.next.title')}>
              <p className={styles.nextTitle}>
                <InfoCircleOutlined aria-hidden />
                <span>{t('review.next.title')}</span>
              </p>
              <p className={styles.nextBody}>{t('review.next.body')}</p>
            </section>
          </div>
        </div>
      </div>

      <div className={staffStyles.reviewDock}>
        {stepError ? <Alert type="error" showIcon title={stepError} role="alert" /> : null}
        <footer className={staffStyles.dockRow}>
          <div className={staffStyles.dockTotal}>
            <span className={staffStyles.dockLabel}>
              {!manual && quote?.estimateNote ? t('trip.barEstimate') : t('trip.barTotal')}
            </span>
            {total != null ? <b className={staffStyles.dockAmount}>{fmt.money(total)}</b> : null}
          </div>
          <div className={staffStyles.dockActions}>
            <Button
              size="large"
              icon={<ArrowLeftOutlined />}
              onClick={onEdit}
              disabled={submitting}
            >
              {tFlow('actions.back')}
            </Button>
            <Button type="primary" size="large" loading={submitting} onClick={onSubmit}>
              {t('review.submit.cta')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
