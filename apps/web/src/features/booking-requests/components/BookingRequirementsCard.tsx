'use client';

import { CheckCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import type { ReactNode } from 'react';
import type { DriverLicence } from '@/features/driver-licence/types';
import { useRentalConditionsText } from '@/features/rental-policies/rental-conditions';
import { useAppFormat } from '@/i18n/use-app-format';
import type { CustomerDepositView } from '../hooks/use-customer-cost-view';
import styles from './BookingReviewStep.module.css';

interface BookingRequirementsCardProps {
  /**
   * `required` theo DỊCH VỤ (`serviceRequiresDriverLicence`); `current` = bằng ĐÃ XÁC THỰC của tài
   * khoản. Chỉ hiện dòng "hợp lệ" khi dịch vụ cần bằng VÀ tài khoản có bằng đã xác thực.
   */
  licence: { required: boolean; current: DriverLicence | null };
  /**
   * Chỉ màn Xem lại truyền: bằng đã soát cho CHÍNH chuyến này chưa (`ready`) và bộ tải bằng nhúng
   * (`uploader`). Chưa hợp lệ ⇒ thẻ vẽ bộ tải bằng ngay trong thẻ (Figma `21836:54301`).
   * Không truyền (chuyến đã gửi) ⇒ chỉ đọc `current` như trước.
   */
  licenceGate?: { ready: boolean; loading: boolean; uploader: ReactNode };
  /**
   * Điều khoản GIAN HÀNG công bố cho nhóm dịch vụ của chuyến (ADR 0112 điều 3). Giấy tờ tuỳ thân là
   * luật chuẩn của nền tảng - thẻ tự đọc `PLATFORM_RENTAL_CONDITIONS`, không theo từng chủ xe.
   */
  hostTerms: { text: string | null } | null;
  /**
   * Cọc thế chấp khi nhận xe (`useCustomerCostView`) — là điều kiện NHẬN XE, trao tay chủ xe, nên nằm
   * ở thẻ này chứ không ở thẻ tiền. Không truyền = không vẽ.
   */
  deposit?: CustomerDepositView | null;
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
  licenceGate,
  hostTerms,
  deposit = null,
  headingLevel = 3,
}: BookingRequirementsCardProps) {
  const tCommon = useTranslations('Common');
  const t = useTranslations('BookingRequests.flow');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const fmt = useAppFormat();

  const licenceBlocked = licence.required && licenceGate !== undefined && !licenceGate.ready;
  // Chưa đọc xong bằng thì không vẽ trạng thái rỗng - tránh nháy "chưa có bằng" với người đã có.
  const showLicenceEmpty = licenceBlocked && licenceGate !== undefined && !licenceGate.loading;
  const verifiedLicence = licence.required && !licenceBlocked ? licence.current : null;
  const rules = useRentalConditionsText();
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
      {showLicenceEmpty && licenceGate ? (
        licenceGate.uploader
      ) : (
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
      )}
      {verifiedLicence ? (
        <p className={styles.licenceOk}>
          <CheckCircleFilled aria-hidden />
          <span>
            <strong>{t('reviewPage.requirements.licenceVerified')}</strong>
            {licenceMeta ? `${LIST_SEPARATOR}${licenceMeta}` : ''}
          </span>
        </p>
      ) : null}
      {!showLicenceEmpty ? (
        <p className={styles.requirementBody}>
          {t('reviewPage.requirements.identity', {
            documents: rules.documents,
            verify: rules.verify,
          })}
        </p>
      ) : null}
      {deposit ? (
        <div className={styles.requirementBlock}>
          <p className={styles.depositHead}>
            <span className={styles.requirementTitle}>{tCommon('components.price.deposit')}</span>
            <strong className={styles.depositAmount}>
              {deposit.display}
            </strong>
          </p>
          <p className={styles.requirementBody}>{deposit.note}</p>
        </div>
      ) : null}
      {hostTerms?.text ? (
        <div className={styles.hostTerms}>
          <p className={styles.requirementTitle}>{t('reviewPage.requirements.hostTerms')}</p>
          <p className={styles.hostTermsText}>{hostTerms.text}</p>
        </div>
      ) : null}
      {showLicenceEmpty ? null : (
        <p className={styles.reminder}>{t('reviewPage.requirements.reminder')}</p>
      )}
    </section>
  );
}
