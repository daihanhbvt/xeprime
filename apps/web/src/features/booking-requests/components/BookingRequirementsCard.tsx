'use client';

import { CheckCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import type { DriverLicence } from '@/features/driver-licence/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './BookingReviewStep.module.css';

interface BookingRequirementsCardProps {
  /**
   * `required` theo DỊCH VỤ (`serviceRequiresDriverLicence`); `current` = bằng ĐÃ XÁC THỰC của tài
   * khoản. Chỉ hiện dòng "hợp lệ" khi dịch vụ cần bằng VÀ tài khoản có bằng đã xác thực.
   */
  licence: { required: boolean; current: DriverLicence | null };
  /** Điều kiện chủ xe công bố cho đúng dịch vụ của chuyến (giấy tờ, điều khoản). */
  hostTerms: { text: string | null; documents: string[] } | null;
  /**
   * Bậc tiêu đề của thẻ — `h3` trong hộp đặt xe (dưới tiêu đề `h2` của bước), `h2` khi thẻ đứng
   * ngay dưới `h1` của một trang (chuyến chờ chủ xe phản hồi): không nhảy bậc dàn ý.
   */
  headingLevel?: 2 | 3;
}

/**
 * Thẻ "Giấy tờ & điều kiện nhận xe" — Figma `19727:56011` (màn Xem lại) và `19727:60754` (chuyến chờ
 * chủ xe phản hồi). Cùng điều kiện, cùng câu chữ ở cả hai màn: khách đã đồng ý điều gì trước khi gửi
 * thì sau khi gửi đọc lại đúng điều đó.
 */
export function BookingRequirementsCard({
  licence,
  hostTerms,
  headingLevel = 3,
}: BookingRequirementsCardProps) {
  const t = useTranslations('BookingRequests.flow');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
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
    <section className={styles.card} aria-label={t('reviewPage.requirements.title')}>
      <div className={styles.requirementHead}>
        <span className={styles.requirementIcon} aria-hidden>
          <SafetyCertificateOutlined />
        </span>
        <Heading className={styles.cardTitle}>{t('reviewPage.requirements.title')}</Heading>
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
  );
}
