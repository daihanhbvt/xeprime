'use client';

import { FilePdfOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';

import { ownerResourceHref, ownerResourcesOfKind } from '@/constants/owner-resources';

import { AccountPageHeader } from './AccountPageHeader';
import { ResourceList } from './ResourceList';
import styles from './ContractsDocumentsView.module.css';

/**
 * Hợp đồng & Chứng từ — THƯ VIỆN BIỂU MẪU (PDF từ manifest), không phải danh sách hợp đồng phát
 * sinh theo đơn thuê (thứ đó là `features/contracts` ở cổng quản lý).
 *
 * Nội dung tĩnh, không gọi API nào. Hai khối theo mockup — nút hợp đồng mẫu và danh sách chứng
 * từ quyết toán. Link mở tab mới; không có PDF giả, file thật do vận hành chép vào
 * `public/owner-resources/` (README ở đó).
 */
export function ContractsDocumentsView() {
  const t = useTranslations('Account.contracts');
  const tResources = useTranslations('Account.resources');

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />

      <section className={styles.card}>
        <h2 className={styles.heading}>{t('templatesHeading')}</h2>
        <p className={styles.body}>{t('templatesBody')}</p>
        <div className={styles.templates}>
          {ownerResourcesOfKind('contract').map((resource) => {
            const title = tResources(`items.${resource.key}.title`);
            return (
              <a
                key={resource.key}
                href={ownerResourceHref(resource)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.templateButton}
                aria-label={tResources('open', { title })}
              >
                <FilePdfOutlined aria-hidden="true" />
                {title}
              </a>
            );
          })}
        </div>

        <h2 className={styles.heading}>{t('documentsHeading')}</h2>
        <ResourceList resources={ownerResourcesOfKind('document')} variant="compact" />

        <p className={styles.note}>{t('note')}</p>
      </section>
    </div>
  );
}
