'use client';

import { Card } from 'antd';
import { useTranslations } from 'next-intl';
import { ACCOUNT_DOCUMENTS_ANCHOR } from '@/constants/routes';
import { DriverLicenceVerifier } from './DriverLicenceVerifier';
import styles from './AccountDocumentsCard.module.css';

/**
 * Mục "Giấy tờ & Xác minh" ngay trong trang Quản lý tài khoản (theo design Account / Profile) —
 * thay cho trang riêng `/account/documents` trước đây, giờ chỉ còn chuyển tiếp về đây. Bước bằng lái
 * trong luồng đặt xe dùng CÙNG bộ xác thực, nên nộp ở đâu thì chỗ kia cũng thấy (ADR 0057).
 */
export function AccountDocumentsCard() {
  const t = useTranslations('DriverLicence.page');
  const tn = useTranslations('Navigation.account');
  return (
    <Card className={styles.card} styles={{ body: { padding: 0 } }}>
      <section
        id={ACCOUNT_DOCUMENTS_ANCHOR}
        className={styles.inner}
        aria-labelledby="account-documents-title"
      >
        <header className={styles.head}>
          <h2 id="account-documents-title" className={styles.title}>
            {tn('documents')}
          </h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </header>
        <DriverLicenceVerifier embedded />
      </section>
    </Card>
  );
}
