'use client';

import { RightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LEGAL_DOC, LEGAL_EFFECTIVE_FROM, legalPath } from '@/constants/legal';
import { ownerResourcesOfKind } from '@/constants/owner-resources';
import { useAppFormat } from '@/i18n/use-app-format';

import { AccountPageHeader } from './AccountPageHeader';
import { ResourceList } from './ResourceList';
import styles from './HostGuideView.module.css';

/**
 * Cẩm nang cho thuê xe — nội dung tĩnh, không gọi API nào.
 *
 * Hai khối theo mockup: danh sách cẩm nang (PDF từ manifest `OWNER_RESOURCES`) và "Cập nhật
 * chính sách". Khối thứ hai KHÔNG chép số nghị định/ngày hiệu lực từ mockup — nó trỏ tới hai
 * văn bản pháp lý THẬT của sàn (`/legal/*`) với ngày hiệu lực đọc từ `LEGAL_EFFECTIVE_FROM`,
 * nguồn duy nhất trong repo nói được "bản nào đang có hiệu lực".
 */
export function HostGuideView() {
  const t = useTranslations('Account.hostGuide');
  const tLegal = useTranslations('Legal.docs');
  const fmt = useAppFormat();
  const policyDocs = [LEGAL_DOC.MARKETPLACE_RULES, LEGAL_DOC.TERMS] as const;

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />

      <section className={styles.card}>
        <ResourceList resources={ownerResourcesOfKind('guide')} />

        <div className={styles.policy}>
          <h2 className={styles.policyHeading}>
            <span className={styles.dot} aria-hidden="true" />
            {t('policyHeading')}
          </h2>
          <p className={styles.policyBody}>
            {t('policyBody', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
          </p>
          <ul className={styles.policyList}>
            {policyDocs.map((doc) => (
              <li key={doc}>
                <Link href={legalPath.doc(doc)} className={styles.policyLink}>
                  <span className={styles.policyText}>
                    <span className={styles.policyTitle}>{tLegal(`${doc}.title`)}</span>
                    <span className={styles.policySummary}>{tLegal(`${doc}.summary`)}</span>
                  </span>
                  <RightOutlined className={styles.chevron} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
