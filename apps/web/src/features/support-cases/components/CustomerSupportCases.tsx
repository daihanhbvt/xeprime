'use client';

import { useTranslations } from 'next-intl';
import { SupportCasesView } from './SupportCasesView';
import { SUPPORT_SURFACE } from '../types';
import styles from './CustomerSupportCases.module.css';

/** Bề mặt KHÁCH THUÊ — tiêu đề của khu tài khoản, phần còn lại dùng chung với hai bề mặt kia. */
export function CustomerSupportCases() {
  const t = useTranslations('SupportCases');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('page.customerTitle')}</h1>
        <p className={styles.subtitle}>{t('page.customerSubtitle')}</p>
      </header>
      <SupportCasesView surface={SUPPORT_SURFACE.CUSTOMER} />
    </div>
  );
}
