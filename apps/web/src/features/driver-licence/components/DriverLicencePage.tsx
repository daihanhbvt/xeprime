'use client';

import { useTranslations } from 'next-intl';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { DriverLicenceVerifier } from './DriverLicenceVerifier';
import styles from './DriverLicencePage.module.css';

/**
 * Trang "Giấy tờ & Xác minh" của tài khoản khách — hiện chỉ có bằng lái (ADR 0057). Đặt bằng
 * dưới một tiêu đề mục riêng để trang có chỗ cho giấy tờ khác sau này mà không đổi bố cục.
 */
export function DriverLicencePage() {
  const t = useTranslations('DriverLicence.page');
  const tn = useTranslations('Navigation.account');
  return (
    <div className={styles.page}>
      <AccountPageHeader title={tn('documents')} subtitle={t('subtitle')} />
      <section className={styles.section} aria-labelledby="driver-licence-title">
        <h2 id="driver-licence-title" className={styles.sectionTitle}>
          {t('sectionTitle')}
        </h2>
        <DriverLicenceVerifier />
      </section>
    </div>
  );
}
