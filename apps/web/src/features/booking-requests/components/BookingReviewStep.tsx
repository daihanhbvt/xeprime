'use client';

import { CheckCircleFilled, InfoCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Form } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';
import { BOOKING_REQUEST_NOTE_MAX_LENGTH, HOLD_PAYMENT_WINDOW_MINUTES } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { CheckboxField } from '@/components/form/CheckboxField';
import { TextAreaField } from '@/components/form/TextAreaField';
import type { DriverLicence } from '@/features/driver-licence/types';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { CurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { RequestFormValues } from '../schema';
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
  onEdit: () => void;
}

/**
 * Màn "Xem lại yêu cầu thuê xe" — Figma `19727:55409`. Hai cột:
 *
 * - TRÁI: thẻ chuyến đi (`BookingTripCard`) · người thuê + lời nhắn · giấy tờ.
 * - PHẢI: chi phí · các khoản khác · đồng ý điều khoản + nút gửi · chuyện xảy ra sau khi gửi.
 *
 * Màn này KHÔNG sửa chuyến: "Chỉnh sửa" đưa khách về bước Chuyến đi, nơi có lịch bận, bản đồ và
 * báo giá sống. Thứ duy nhất nhập được ở đây là lời nhắn cho chủ xe và ô đồng ý.
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
  agreementCoversHostTerms,
  journey,
  costs,
  nextStep,
  agreementMissing,
  stepError,
  submitting,
  onSubmit,
  onEdit,
}: BookingReviewStepProps) {
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const verifiedLicence = licence.required ? licence.current : null;
  const licenceMeta = verifiedLicence
    ? [
        verifiedLicence.classes.length
          ? t('reviewPage.requirements.licenceClasses', {
              classes: verifiedLicence.classes.join(', '),
            })
          : null,
        verifiedLicence.noExpiry
          ? t('reviewPage.requirements.licenceNoExpiry')
          : verifiedLicence.expiresOn
            ? t('reviewPage.requirements.licenceExpires', {
                date: fmt.dateKey(verifiedLicence.expiresOn),
              })
            : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : '';

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
            action={
              <button
                type="button"
                className={styles.editLink}
                onClick={onEdit}
                aria-label={t('reviewPage.trip.editLabel')}
                disabled={submitting}
              >
                {t('reviewPage.trip.edit')}
              </button>
            }
          >
            {deliveryEstimate}
          </BookingTripCard>

          <section className={styles.card} aria-label={t('reviewPage.renter.title')}>
            <h3 className={styles.cardTitle}>{t('reviewPage.renter.title')}</h3>
            <p className={styles.cardLead}>{t('reviewPage.renter.description')}</p>
            {/*
              Màn này chỉ tới được khi đã có phiên; phiên mất giữa chừng (đăng xuất ở tab khác) thì
              lượt gửi trả 401 và luồng mời đăng nhập lại — không dựng một khung chờ không bao giờ xong.
            */}
            {renter ? (
              <dl className={styles.contactGrid}>
                <div className={styles.contactField}>
                  <dt>{t('reviewPage.renter.name')}</dt>
                  <dd className={styles.contactValue}>{renter.displayName}</dd>
                </div>
                <div className={styles.contactField}>
                  <dt>{t('reviewPage.renter.phone')}</dt>
                  <dd className={styles.contactValue}>
                    <span className={styles.contactText}>{renter.phone ?? '—'}</span>
                    {renter.phoneVerified ? (
                      <span className={styles.verifiedTag}>
                        <CheckCircleFilled aria-hidden /> {t('contact.verified')}
                      </span>
                    ) : null}
                  </dd>
                </div>
                {renter.email ? (
                  <div className={styles.contactField}>
                    <dt>{t('reviewPage.renter.email')}</dt>
                    <dd className={styles.contactValue}>
                      <span className={styles.contactText}>{renter.email}</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
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
          </section>

          <section className={styles.card} aria-label={t('reviewPage.requirements.title')}>
            <div className={styles.requirementHead}>
              <span className={styles.requirementIcon} aria-hidden>
                <SafetyCertificateOutlined />
              </span>
              <h3 className={styles.cardTitle}>{t('reviewPage.requirements.title')}</h3>
            </div>
            <div className={styles.requirementBlock}>
              <p className={styles.requirementTitle}>
                {licence.required
                  ? t('reviewPage.requirements.licenceTitle')
                  : t('reviewPage.requirements.driverTitle')}
              </p>
              <p className={styles.requirementBody}>
                {licence.required
                  ? t('reviewPage.requirements.licenceBody')
                  : t('reviewPage.requirements.driverBody')}
              </p>
            </div>
            {verifiedLicence ? (
              <p className={styles.licenceOk}>
                <CheckCircleFilled aria-hidden />
                <span>
                  <strong>{t('reviewPage.requirements.licenceVerified')}</strong>
                  {licenceMeta ? `${LIST_SEPARATOR}${licenceMeta}` : ''}
                </span>
              </p>
            ) : null}
            {hostTerms && hostTerms.documents.length > 0 ? (
              <p className={styles.requirementBody}>
                {t('reviewPage.requirements.documents', {
                  documents: hostTerms.documents
                    .map((doc) => dl('customerDocumentType', doc, doc))
                    .join(', '),
                })}
              </p>
            ) : null}
            {hostTerms?.text ? (
              <div className={styles.hostTerms}>
                <p className={styles.requirementTitle}>{t('reviewPage.requirements.hostTerms')}</p>
                <p className={styles.hostTermsText}>{hostTerms.text}</p>
              </div>
            ) : null}
            <p className={styles.reminder}>{t('reviewPage.requirements.reminder')}</p>
          </section>
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
