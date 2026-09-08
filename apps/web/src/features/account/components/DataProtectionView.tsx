'use client';

import { CheckSquareFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LEGAL_DOC, LEGAL_EFFECTIVE_FROM, legalPath } from '@/constants/legal';
import { useAppFormat } from '@/i18n/use-app-format';

import { AccountPageHeader } from './AccountPageHeader';
import styles from './DataProtectionView.module.css';

const POINTS = ['location', 'bank', 'masking', 'rights'] as const;

/**
 * Chính sách bảo vệ dữ liệu — bản TÓM TẮT chỉ-đọc dẫn tới văn bản thật ở `/legal/privacy`.
 *
 * Mockup vẽ các dòng có ô tick và nút "Xác nhận đồng ý". Repo CHƯA có API lưu consent, nên ở đây
 * chúng là một checklist thông tin (dấu tick trang trí, không phải control) và CTA là "Xem chính
 * sách chi tiết" — không dựng checkbox cục bộ rồi báo "đã lưu" cho một thứ backend không lưu.
 * Ghi chú `consentNote` nói thẳng điều đó với người đọc.
 *
 * Không chép nội dung `/legal/privacy` sang đây: bốn ý tóm tắt là chữ riêng của màn này, văn bản
 * pháp lý vẫn chỉ có một bản ở namespace `Legal`.
 */
export function DataProtectionView() {
  const t = useTranslations('Account.dataProtection');
  const fmt = useAppFormat();

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('title')} subtitle={t('intro')} />

      <section className={styles.card}>
        <div className={styles.banner}>
          <span className={styles.badge}>{t('badge')}</span>
          <h2 className={styles.bannerTitle}>{t('heading')}</h2>
          <span className={styles.bannerIcon} aria-hidden="true">
            <SafetyCertificateOutlined />
          </span>
        </div>

        <ul className={styles.points}>
          {POINTS.map((point) => (
            <li key={point} className={styles.point}>
              <CheckSquareFilled className={styles.check} aria-hidden="true" />
              <span>{t(`points.${point}`)}</span>
            </li>
          ))}
        </ul>

        <p className={styles.commitment}>{t('commitment')}</p>
        <p className={styles.note}>{t('consentNote')}</p>
        <p className={styles.updated}>{t('lastUpdated', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}</p>

        <Link href={legalPath.doc(LEGAL_DOC.PRIVACY)} className={styles.cta}>
          {t('readPolicy')}
        </Link>
      </section>
    </div>
  );
}
